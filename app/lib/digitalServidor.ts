// Braço digital no servidor: link assinado da página do pedido, leitura e gravação dos pedidos (AppConfig, campo do
// servidor) e a conferência do sinal no extrato (Pluggy), que avisa o cliente e você.

import { supabase } from "./supabase"
import { linkPedido, linkDesigner } from "./digitalLink"
export { BASE_PUBLICA, tokenDigital, tokenDigitalValido, linkPedido, tokenDesignerValido, linkDesigner } from "./digitalLink"
import { evo } from "./evolution"
import { enviar, enviarArquivo, gravarCfg, seuNumero, Conversa, CfgAgente } from "./agenteAuto"
import {
  sinaisPagos, textoSinalPago, PedidoComBriefing, EntradaBanco, restantesPagos, textoRestantePago, arteAtual, novaArte, marcarArteEnviada,
  aprovarArte, pedirAjuste, textoArteParaAprovar, textoArteAprovada, textoParaVilla, textoParaDesigner, acertoDaSemana, textoAcerto, semanaDe,
} from "./digital"
import { sincronizar } from "./bancoServidor"
import { pluggyConfigurada, atualizarItem } from "./pluggy"
import { asaas, asaasConfigurado, PAGO, CobrancaAsaas } from "./asaas"
import { soNumeros, documentoValido } from "./documento"
import type { CobrancaPix } from "./digital"


export type ContatosDigital = { villa?: string; designer?: string; designerNome?: string }
type CfgDigital = Omit<CfgAgente, "pedidosDigitais"> & { pedidosDigitais?: PedidoComBriefing[]; digitalConferidoEm?: string; digitalBancoEm?: string; digitalAcertoSemana?: string; digitalContatos?: ContatosDigital; pluggy?: { itens?: { id: string }[] } }

async function lerDados() {
  const { data } = await supabase.from("AppConfig").select("data").eq("id", 1).single()
  return (data?.data ?? {}) as Record<string, unknown> & CfgDigital
}

export async function lerPedido(id: string): Promise<{ pedido: PedidoComBriefing | null; cfg: CfgDigital }> {
  const cfg = await lerDados()
  return { pedido: (cfg.pedidosDigitais ?? []).find(p => p.id === id) ?? null, cfg }
}

// Troca um pedido (lendo de novo na hora de gravar, para não apagar o que mudou enquanto isso)
export async function gravarPedido(id: string, mudar: (p: PedidoComBriefing, todos: PedidoComBriefing[]) => PedidoComBriefing | null) {
  let novo: PedidoComBriefing | null = null
  await gravarCfg(d => {
    const todos = ((d as CfgDigital).pedidosDigitais ?? []) as PedidoComBriefing[]
    return { pedidosDigitais: todos.map(p => { if (p.id !== id) return p; const n = mudar(p, todos); if (n) novo = n; return n ?? p }) }
  })
  return novo as PedidoComBriefing | null
}

async function conversa(jid: string): Promise<Conversa | null> {
  const { data } = await supabase.from("whatsapp_conversas").select("jid, nome, telefone, etiquetas, status_lead").eq("jid", jid).maybeSingle()
  return (data as Conversa | null) ?? null
}

async function avisarVoce(cfg: CfgDigital, texto: string) {
  const destino = (cfg.agenteAuto?.avisoNumero ?? "").replace(/\D/g, "") || await seuNumero()
  if (destino) await evo("/message/sendText/{i}", { method: "POST", body: JSON.stringify({ number: destino, text: texto }) }).catch(() => null)
}

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

// Confere no extrato os sinais esperando Pix. Pede atualização do banco à Pluggy no máximo a cada 20 min e
// sincroniza o extrato no máximo a cada 5 min (o cliente que clicou "Já paguei" força a conferência).
export async function conferirSinais(opts: { forcar?: boolean } = {}): Promise<{ pagos: string[]; pendentes: number; motivo?: string }> {
  const cfg = await lerDados()
  const agora = Date.now()
  // Teste (R$ 5) só confirma pelo Asaas: no extrato qualquer Pix de R$ 5 seria confundido com ele
  const pendentes = (cfg.pedidosDigitais ?? []).filter(p => !p.teste && p.status === "aguardando_sinal" && agora - new Date(p.em).getTime() < 15 * 86_400_000)
  const restantes = (cfg.pedidosDigitais ?? []).filter(p => !p.teste && p.restante && !p.restantePagoEm && p.status !== "cancelado" && p.arteAprovadaEm)
  if (!pendentes.length && !restantes.length) return { pagos: [], pendentes: 0 }
  const desdeUltima = cfg.digitalConferidoEm ? agora - new Date(cfg.digitalConferidoEm).getTime() : Infinity
  if (desdeUltima < (opts.forcar ? 60_000 : 5 * 60_000)) return { pagos: [], pendentes: pendentes.length, motivo: "conferido agora há pouco" }
  const bancoHa = cfg.digitalBancoEm ? agora - new Date(cfg.digitalBancoEm).getTime() : Infinity
  await gravarCfg(() => ({ digitalConferidoEm: new Date().toISOString(), ...(bancoHa > 20 * 60_000 ? { digitalBancoEm: new Date().toISOString() } : {}) } as Partial<CfgAgente>))

  if (pluggyConfigurada()) {
    // A Pluggy busca no banco em segundo plano: o Pix aparece numa das próximas conferências
    if (bancoHa > 20 * 60_000) for (const it of cfg.pluggy?.itens ?? []) await atualizarItem(it.id).catch(() => null)
    await sincronizar().catch(() => null)
  }
  const menorDia = [...pendentes.map(p => p.em.slice(0, 10)), ...restantes.map(p => p.arteAprovadaEm!.slice(0, 10))].sort()[0]
  const { data: extrato } = await supabase.from("banco_transacoes").select("id, data, valor, tipo, contraparte_nome").eq("tipo", "entrada").gte("data", menorDia).limit(2000)
  const usadas = new Set(((cfg.pedidosDigitais ?? []) as PedidoComBriefing[]).flatMap(p => [p.pagamento?.txId, p.pagamentoFinal?.txId]).filter(Boolean) as string[])
  const achados = sinaisPagos(pendentes, (extrato ?? []) as EntradaBanco[], usadas)

  const pagos: string[] = []
  for (const { id, tx } of achados) {
    const p = await gravarPedido(id, x => x.status !== "aguardando_sinal" ? null
      : { ...x, status: "sinal_pago", sinalPagoEm: new Date().toISOString(), pagamento: { txId: tx.id, valor: tx.valor, data: tx.data, nome: tx.contraparte_nome ?? null } })
    if (!p) continue
    pagos.push(id)
    const c = await conversa(p.jid)
    if (c) await enviar(c, textoSinalPago(p, linkPedido(p.id), !!(p.briefing?.marca || p.briefing?.arquivos?.length))).catch(() => null)
    const designer = await avisarDesigner(cfg, p)
    await avisarVoce(cfg, `💰 *Digital ${p.id}* · sinal pago ${brl(p.sinal)}\n${p.nome ?? ""} · ${p.quantidade.toLocaleString("pt-BR")} caixinhas · total ${brl(p.total)}${designer ? "" : "\n\nSem designer cadastrada: cadastre em Digital → Contatos, ou mande o briefing pelo link:\n" + linkDesigner(p.id)}`)
  }
  for (const { id, tx } of restantesPagos(restantes, (extrato ?? []) as EntradaBanco[], new Set([...usadas, ...achados.map(a => a.tx.id)]))) {
    const p = await gravarPedido(id, x => x.restantePagoEm ? null : { ...x, restantePagoEm: new Date().toISOString(), pagamentoFinal: { txId: tx.id, valor: tx.valor, data: tx.data, nome: tx.contraparte_nome ?? null } })
    if (!p) continue
    pagos.push(id)
    const c = await conversa(p.jid)
    if (c) await enviar(c, textoRestantePago(p)).catch(() => null)
    await avisarVoce(cfg, `💰 *Digital ${p.id}* · restante pago ${brl(p.restante ?? 0)}\n${p.nome ?? ""}${p.entrega ? `\nEntrega: ${p.entrega.endereco} · CEP ${p.entrega.cep}` : "\nSem endereço de entrega ainda"}`)
  }
  return { pagos, pendentes: pendentes.length + restantes.length - pagos.length }
}

// ── Arte, Villa e acerto ─────────────────────────────────────────────────────
const soDigitos = (n?: string) => (n ?? "").replace(/\D/g, "")
async function paraNumero(numero: string, texto: string, arquivo?: { url: string; mime: string; nome: string }) {
  if (arquivo) {
    const mediatype = arquivo.mime.startsWith("image/") ? "image" : "document"
    const r = await evo("/message/sendMedia/{i}", { method: "POST", body: JSON.stringify({ number: numero, mediatype, mimetype: arquivo.mime, media: arquivo.url, caption: texto, fileName: mediatype === "document" ? arquivo.nome : undefined }) }).catch(() => null)
    return !!r?.ok
  }
  const r = await evo("/message/sendText/{i}", { method: "POST", body: JSON.stringify({ number: numero, text: texto }) }).catch(() => null)
  return !!r?.ok
}
const mimeDe = (url: string) => /\.pdf($|\?)/i.test(url) ? "application/pdf" : /\.png($|\?)/i.test(url) ? "image/png" : /\.webp($|\?)/i.test(url) ? "image/webp" : "image/jpeg"

// Briefing para a designer (sinal pago ou ajuste pedido). Devolve false se não há designer cadastrada.
export async function avisarDesigner(cfg: CfgDigital, p: PedidoComBriefing) {
  if (p.teste) return true   // teste: a designer não recebe
  const num = soDigitos(cfg.digitalContatos?.designer)
  if (!num) return false
  const ok = await paraNumero(num, textoParaDesigner(p, linkDesigner(p.id)))
  if (ok) await gravarPedido(p.id, x => ({ ...x, designerAvisadoEm: new Date().toISOString() }))
  return ok
}

// Arte nova (designer pela página, ou você pelo painel): só guarda; mandar ao cliente é outro passo
export async function guardarArte(id: string, file: File) {
  const path = `digital/${id}/arte-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60)}`
  const { error } = await supabase.storage.from("pedido-arquivos").upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false })
  if (error) return { erro: "Não consegui guardar a arte. Tente de novo." }
  const { data: { publicUrl } } = supabase.storage.from("pedido-arquivos").getPublicUrl(path)
  const novo = await gravarPedido(id, p => novaArte(p, { url: publicUrl, nome: file.name.slice(0, 120), em: new Date().toISOString() }) as PedidoComBriefing | null)
  return novo ? { pedido: novo } : { erro: "Esse pedido não está na fase de arte." }
}

// Manda a arte para o cliente aprovar (imagem com o link da página)
export async function mandarArte(id: string) {
  const { pedido, cfg } = await lerPedido(id)
  const a = pedido && arteAtual(pedido)
  if (!pedido || !a) return { erro: "Ainda não tem arte neste pedido." }
  const c = await conversa(pedido.jid)
  if (!c) return { erro: "Não achei a conversa do cliente." }
  const r = await enviarArquivo(c, a.url, mimeDe(a.url), textoArteParaAprovar(pedido, linkPedido(id)), a.nome)
  if (r.erro) return { erro: `WhatsApp: ${r.erro}` }
  const novo = await gravarPedido(id, p => marcarArteEnviada(p) as PedidoComBriefing | null)
  await avisarVoce(cfg, `🎨 *Digital ${id}* · arte enviada para ${pedido.nome ?? "o cliente"} aprovar`)
  return { pedido: novo }
}

// Cliente aprovou na página: produção, Villa e você avisados
export async function aprovarPeloCliente(id: string) {
  const novo = await gravarPedido(id, (p, todos) => aprovarArte(p, todos) as PedidoComBriefing | null)
  if (!novo) return { erro: "Essa arte não está esperando aprovação." }
  const { cfg } = await lerPedido(id)
  const c = await conversa(novo.jid)
  if (c) await enviar(c, textoArteAprovada(novo, linkPedido(id))).catch(() => null)
  await mandarParaVilla(cfg, novo)
  return { pedido: novo }
}
export async function mandarParaVilla(cfg: CfgDigital, p: PedidoComBriefing) {
  const a = arteAtual(p)
  const texto = textoParaVilla(p, a?.url ?? null)
  const villa = p.teste ? "" : soDigitos(cfg.digitalContatos?.villa)
  if (p.teste) { await avisarVoce(cfg, `✅ *Digital ${p.id}* (teste) · arte aprovada. Num pedido de verdade, isto iria para a Villa:\n\n${texto}`); return }
  const ok = villa ? await paraNumero(villa, texto, a ? { url: a.url, mime: mimeDe(a.url), nome: a.nome } : undefined) : false
  if (ok) await gravarPedido(p.id, x => ({ ...x, villaEnviadoEm: new Date().toISOString() }))
  await avisarVoce(cfg, ok
    ? `✅ *Digital ${p.id}* · arte aprovada e enviada para a Villa\n${p.nome ?? ""} · restante ${brl(p.restante ?? 0)}`
    : `✅ *Digital ${p.id}* · arte aprovada. Sem o número da Villa cadastrado (Digital → Contatos): encaminhe ao Leandro:\n\n${texto}`)
}

export async function ajustePeloCliente(id: string, texto: string) {
  const novo = await gravarPedido(id, p => pedirAjuste(p, texto) as PedidoComBriefing | null)
  if (!novo) return { erro: "Escreva o que quer mudar." }
  const { cfg } = await lerPedido(id)
  const designer = await avisarDesigner(cfg, novo)
  await avisarVoce(cfg, `✏️ *Digital ${id}* · ${novo.nome ?? "cliente"} pediu ajuste na arte:\n${texto.slice(0, 400)}${designer ? "\n(a designer já recebeu)" : ""}`)
  return { pedido: novo }
}

// Segunda-feira de manhã: o que foi para a Villa e falta acertar (uma vez por semana)
export async function talvezAcertoSemanal() {
  const agora = new Date()
  const sp = new Date(agora.getTime() - 3 * 3_600_000)
  if (sp.getUTCDay() !== 1 || sp.getUTCHours() < 9) return
  const cfg = await lerDados()
  const semana = semanaDe(sp)
  if (cfg.digitalAcertoSemana === semana) return
  await gravarCfg(() => ({ digitalAcertoSemana: semana } as Partial<CfgAgente>))
  const { itens, total } = acertoDaSemana(cfg.pedidosDigitais ?? [])
  if (itens.length) await avisarVoce(cfg, textoAcerto(itens, total))
}

// Pago pelo Asaas (webhook, já conferido na API): marca o sinal ou o restante e avisa igual ao extrato
export async function pagoPeloAsaas(id: string, parte: "sinal" | "restante", tx: { txId: string; valor: number; data: string }) {
  const { cfg } = await lerPedido(id)
  const agora = new Date().toISOString()
  const p = await gravarPedido(id, x => parte === "sinal"
    ? (x.status !== "aguardando_sinal" ? null : { ...x, status: "sinal_pago", sinalPagoEm: agora, pagamento: { ...tx, nome: null } })
    : (x.restantePagoEm || x.status === "cancelado" ? null : { ...x, restantePagoEm: agora, pagamentoFinal: { ...tx, nome: null } }))
  if (!p) return
  const c = await conversa(p.jid)
  if (parte === "sinal") {
    if (c) await enviar(c, textoSinalPago(p, linkPedido(p.id), !!(p.briefing?.marca || p.briefing?.arquivos?.length))).catch(() => null)
    const designer = await avisarDesigner(cfg, p)
    await avisarVoce(cfg, `💰 *Digital ${p.id}* · sinal pago pelo Asaas ${brl(tx.valor)}\n${p.nome ?? ""} · ${p.quantidade.toLocaleString("pt-BR")} caixinhas${designer ? "" : "\n\nSem designer cadastrada: link do briefing:\n" + linkDesigner(p.id)}`)
  } else {
    if (c) await enviar(c, textoRestantePago(p)).catch(() => null)
    await avisarVoce(cfg, `💰 *Digital ${p.id}* · restante pago pelo Asaas ${brl(tx.valor)}\n${p.nome ?? ""}${p.entrega ? `\nEntrega: ${p.entrega.endereco} · CEP ${p.entrega.cep}` : "\nSem endereço de entrega ainda"}`)
  }
}

// ── Cobrança no Asaas (Pix na hora + cartão pela fatura) ─────────────────────
// Cria (ou reaproveita, se o valor não mudou) a cobrança do sinal ou do restante. Sem Asaas ou com erro, devolve
// erro e a página fica no Pix de antes (conferido pelo extrato): nenhum pedido trava.
export async function cobrarNoAsaas(id: string, parte: "sinal" | "restante", doc?: string): Promise<{ cobranca?: CobrancaPix; erro?: string }> {
  if (!asaasConfigurado()) return { erro: "sem asaas" }
  const { pedido } = await lerPedido(id)
  if (!pedido) return { erro: "Pedido não encontrado." }
  const valor = parte === "sinal" ? pedido.sinal : pedido.restante
  if (parte === "sinal" ? pedido.status !== "aguardando_sinal" : !valor || !!pedido.restantePagoEm) return { erro: "Nada a pagar agora." }
  const documento = doc ? soNumeros(doc) : pedido.documento
  if (!documento || !documentoValido(documento)) return { erro: "Confira o CPF ou CNPJ." }
  const atual = pedido.asaas?.[parte]
  if (atual && Math.round(atual.valor * 100) === Math.round(valor! * 100) && documento === pedido.documento) return { cobranca: atual }

  // Cliente no Asaas (pelo documento; sem e-mail/SMS do Asaas: quem fala com o cliente é você)
  let cliente = documento === pedido.documento ? pedido.asaas?.cliente : undefined
  if (!cliente) {
    const achado = await asaas<{ data?: { id: string }[] }>(`/customers?cpfCnpj=${documento}`)
    cliente = achado.corpo?.data?.[0]?.id
    if (!cliente) {
      const novo = await asaas<{ id?: string; errors?: { description: string }[] }>("/customers", { method: "POST", body: JSON.stringify({ name: (pedido.briefing?.marca || pedido.nome || "Cliente Enyla").slice(0, 100), cpfCnpj: documento, notificationDisabled: true, externalReference: pedido.id }) })
      cliente = novo.corpo?.id
      if (!cliente) return { erro: novo.corpo?.errors?.[0]?.description ?? "Asaas não criou o cliente." }
    }
  }
  if (atual) await asaas(`/payments/${atual.id}`, { method: "DELETE" }).catch(() => null)   // valor mudou: a antiga sai
  const vence = new Date(Date.now() + (parte === "sinal" ? 3 : 7) * 86_400_000 - 3 * 3_600_000).toISOString().slice(0, 10)
  const cob = await asaas<CobrancaAsaas & { invoiceUrl?: string; errors?: { description: string }[] }>("/payments", { method: "POST", body: JSON.stringify({
    customer: cliente, billingType: "UNDEFINED", value: valor, dueDate: vence,
    description: `${parte === "sinal" ? "Sinal" : "Restante"} do pedido ${pedido.id} · ${pedido.quantidade} caixinhas`, externalReference: `${pedido.id}:${parte}`,
  }) })
  if (!cob.ok || !cob.corpo?.id) return { erro: cob.corpo?.errors?.[0]?.description ?? "Asaas não criou a cobrança." }
  const qr = await asaas<{ encodedImage?: string; payload?: string }>(`/payments/${cob.corpo.id}/pixQrCode`)
  if (!qr.corpo?.payload) return { erro: "Asaas não gerou o Pix (confira se há chave Pix cadastrada na conta)." }
  const nova: CobrancaPix = { id: cob.corpo.id, valor: valor!, payload: qr.corpo.payload, imagem: qr.corpo.encodedImage ?? "", fatura: cob.corpo.invoiceUrl ?? "", em: new Date().toISOString() }
  await gravarPedido(id, p => ({ ...p, documento, asaas: { ...(p.asaas ?? {}), cliente, [parte]: nova } }))
  return { cobranca: nova }
}

// "Já paguei" com cobrança no Asaas: consulta a cobrança na hora
export async function conferirNoAsaas(id: string) {
  const { pedido } = await lerPedido(id)
  if (!pedido?.asaas || !asaasConfigurado()) return
  for (const parte of ["sinal", "restante"] as const) {
    const c = pedido.asaas[parte]
    if (!c) continue
    const r = await asaas<CobrancaAsaas>(`/payments/${c.id}`)
    if (r.corpo && PAGO.has(r.corpo.status) && Math.round(r.corpo.value * 100) === Math.round(c.valor * 100))
      await pagoPeloAsaas(id, parte, { txId: `asaas:${c.id}`, valor: r.corpo.value, data: (r.corpo.clientPaymentDate ?? r.corpo.paymentDate ?? new Date().toISOString()).slice(0, 10) })
  }
}
