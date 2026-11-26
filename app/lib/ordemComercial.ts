// Diretoria (só CCO e CMO) aciona os agentes do Comercial que já existem (Atendente, Follow-up, Reativação) para falar
// com UM lead. Não é contratação nem agente novo: o agente só escreve a mensagem a pedido do diretor. O resultado é o
// cartão "aguardando" de sempre (AcaoConversa tipo "mensagem"); quem envia é o "Aprovo e envio" do Felipe
// (responderAcao). Este arquivo NUNCA envia nada: o único envio é a ordem a LEAD pela porta externa, que passa por
// ordemDireta (envio do agente) e só quando o nível é "lead" (nivelCliente). Só roda no servidor.
import { supabase } from "./supabase"
import { lerCampos } from "./configAtomica"
import { lerConversa, type AcaoConversa } from "./diretoriaServidor"
import { nomeChave } from "./negocio"
import { chaveTelefone } from "./vinculoWhatsapp"
import type { IdDiretor } from "./diretoria"
import type { Funcionario } from "./rh"
import type { Conhecimento } from "./agenteLeads"
import { MOTIVO_APROVO_DESLIGADO } from "./aprovoDesligado"

export const MAX_PENDENTES = 20
export const DIRETORES_COMERCIAIS: IdDiretor[] = ["cco", "cmo"]

const CONCEITOS = [
  "A ENYLA é uma gráfica de embalagens: Offset (com o Felipe) e Digital (100% IA, produzido na Villa).",
  "Você é o mesmo agente do Comercial que atende o WhatsApp, agora escrevendo a pedido da diretoria para um lead específico.",
  "Siga o guia de atendimento do Felipe. Nunca invente desconto, brinde, preço, prazo ou estoque.",
]
const NAO_PODE = ["Dar desconto ou brinde", "Informar preço, prazo ou estoque que não esteja na ordem ou na conversa", "Expor algo interno (agentes, diretoria, sistema)"]
const comercial = (id: string, nome: string, qualificacao: string, pode: string[]): Funcionario => ({
  id, nome, setor: "cco", capacidade: "mensagem_cliente", fixo: true, status: "contratado", solicitadoPor: "felipe", motivo: "Agente do Comercial acionado pela diretoria",
  em: "2026-11-24T00:00:00.000Z", aprendizados: [], qualificacao, onboarding: { conceitos: CONCEITOS, pode, naoPode: NAO_PODE },
})
// Ficam fora do quadro do RH (quadro/executores): só existem para a CCO e a CMO
export const EXECUTORES_COMERCIAIS: Funcionario[] = [
  comercial("atendente", "Atendente", "Responde o lead e cobra o que falta para orçar (medidas, modelo, acabamento, quantidade)", ["Responder a dúvida do lead", "Pedir a ficha que falta para o orçamento"]),
  comercial("followup", "Follow-up", "Retoma a conversa com o lead que parou de responder, sem pressão", ["Retomar o assunto de onde parou", "Perguntar se ainda tem interesse"]),
  comercial("reativacao", "Reativação", "Chama de volta o cliente antigo que não compra há tempo", ["Lembrar do último pedido", "Perguntar se precisa repor ou fazer algo novo"]),
]
export const IDS_COMERCIAIS = EXECUTORES_COMERCIAIS.map(f => f.id)
export const ehComercial = (id: unknown) => typeof id === "string" && IDS_COMERCIAIS.includes(id)
export const podeAcionarComercial = (d: IdDiretor) => DIRETORES_COMERCIAIS.includes(d)
// O que a lista de funcionários do diretor ganha (vazio para COO, CFO e CTO)
export const comerciaisDoDiretor = (d: IdDiretor) => podeAcionarComercial(d) ? EXECUTORES_COMERCIAIS : []

// Qual conversa do WhatsApp é o lead: pelo jid, pelo telefone, ou pelo nome do contato (ou do cadastro, pelo telefone)
export async function acharLead(x: { cliente?: string; jid?: string }): Promise<{ ok: true; jid: string; nome: string } | { ok: false; erro: string }> {
  const jid = x.jid?.trim(), cliente = x.cliente?.trim()
  if (!jid && !cliente) return { ok: false, erro: "Diga o lead: cliente (nome do contato ou telefone) ou jid." }
  const { data } = await supabase.from("whatsapp_conversas").select("jid, nome, telefone, ultima_at").order("ultima_at", { ascending: false }).limit(2000)
  const conversas = (data ?? []).filter(c => !String(c.jid).endsWith("@g.us"))
  const digitos = (s?: string) => (s ?? "").replace(/\D/g, "")
  const porTelefone = (tel: string) => {
    const k = chaveTelefone(tel.length <= 11 ? "55" + tel : tel)
    return k ? conversas.find(c => chaveTelefone(c.telefone) === k || chaveTelefone(String(c.jid).split("@")[0]) === k) : undefined
  }
  let achou = jid ? (conversas.find(c => c.jid === jid) ?? (digitos(jid).length >= 10 ? porTelefone(digitos(jid)) : undefined)) : undefined
  if (!achou && cliente) {
    achou = conversas.find(c => nomeChave(c.nome) && nomeChave(c.nome) === nomeChave(cliente))
    if (!achou && digitos(cliente).length >= 10) achou = porTelefone(digitos(cliente))
    if (!achou) {
      const { data: cad } = await supabase.from("Cliente").select("nome, telefone")
      const tel = digitos((cad ?? []).find(c => nomeChave(c.nome) === nomeChave(cliente))?.telefone)
      if (tel.length >= 10) achou = porTelefone(tel)
    }
  }
  if (!achou) return { ok: false, erro: `Não achei WhatsApp de ${jid ?? cliente}: nenhuma conversa com esse nome, telefone ou jid. Nada foi escrito.` }
  return { ok: true, jid: achou.jid, nome: cliente || achou.nome || achou.telefone || achou.jid }
}

type Pronto = { saida: string; acao?: AcaoConversa; status?: number; destino?: "enviado_direto" | "fila_aprovo"; motivo?: string; nivel?: string }
// A ordem do diretor: redige (sem enviar) e devolve o cartão "aguardando". Sem Aprovo do Felipe nada sai.
export async function ordenarComercial(diretor: IdDiretor, x: Record<string, unknown>, op: { apiKey: string; cultura?: string[]; novoId: () => string; enviarLead?: boolean }): Promise<Pronto> {
  const func = EXECUTORES_COMERCIAIS.find(f => f.id === x.funcionario)
  if (!func) return { saida: "Funcionário não encontrado no quadro.", status: 400 }
  if (!podeAcionarComercial(diretor)) return { saida: `${func.nome} só atende ordens da CCO e da CMO.`, status: 403 }
  const ordem = String(x.ordem ?? "").trim()
  if (!ordem) return { saida: "Falta a ordem (o que o agente deve dizer ao lead).", status: 400 }
  // Gráfica do Prospector (prospectos_parceiros): sai direto, sem Aprovo e sem exigir conversa anterior (regra de 26/11/2026).
  // Só pela porta externa (enviarLead) e só se o nível é "lead": cliente A, B, C ou indefinido segue na fila.
  if (op.enviarLead) {
    const p = await ordenarProspecto(diretor, func, x, ordem, op).catch(() => null)
    if (p) return p
  }
  const lead = await acharLead({ cliente: x.cliente as string | undefined, jid: x.jid as string | undefined })
  if (!lead.ok) return { saida: lead.erro, status: 404 }
  // Só quem já comprou (A, B, C) precisa do Aprovo; na dúvida ("indefinido") conta como cliente. Sem enviarLead, tudo vai à fila.
  const { nivelDoDestinatario } = await import("./nivelCliente")
  const nv = op.enviarLead ? await nivelDoDestinatario(lead.jid) : { nivel: "indefinido" as const, jaCliente: false, motivo: "" }
  // Chave aprovoObrigatorio (padrão false): desligada, cliente A/B/C e indefinido também saem direto (as travas continuam); ligada, é a regra de antes
  const aprovoDesligado = !!op.enviarLead && !(await (await import("./aprovoDesligado")).lerAprovoObrigatorio())
  const direto = op.enviarLead && (nv.nivel === "lead" || aprovoDesligado)
  if (direto) {
    const { travasAntesDeRedigir } = await import("./ordemDireta")
    const t = await travasAntesDeRedigir(func, lead).catch(() => null)
    if (t) return { saida: t.saida, status: t.status, motivo: t.motivo, nivel: nv.nivel }
  } else {
    const pendentes = (await lerConversa(diretor)).flatMap(m => m.acoes ?? []).filter(a => a.tipo === "mensagem" && a.status === "aguardando").length
    if (pendentes >= MAX_PENDENTES) return { saida: `Já são ${pendentes} mensagens esperando o Aprovo do Felipe (máximo ${MAX_PENDENTES} por diretor). Espere ele aprovar ou descartar antes de mandar outra.`, status: 429 }
  }
  const cfg = await lerCampos<{ guiaAtendimento?: string; conhecimentoAgente?: Conhecimento[] }>(["guiaAtendimento", "conhecimentoAgente"])
  const { redigirComoFuncionario } = await import("./funcionariosServidor")
  const r = await redigirComoFuncionario({
    funcionario: func, cliente: lead.nome, jid: lead.jid, ordem, apiKey: op.apiKey, conhecimento: cfg.conhecimentoAgente, cultura: op.cultura,
    guia: cfg.guiaAtendimento?.trim() || undefined,
  })
  if (!r.ok) return { saida: `Não deu: ${r.erro}`, acao: { id: op.novoId(), tipo: "falha", texto: r.erro }, status: 422 }
  const fila = (texto: string, motivo: string): Pronto => ({
    acao: { id: op.novoId(), tipo: "mensagem", funcionario: func.nome, cliente: lead.nome, jid: lead.jid, texto, status: "aguardando" },
    saida: `${func.nome} escreveu e a mensagem está esperando o Aprovo do Felipe: "${texto}"`, destino: "fila_aprovo", motivo, nivel: nv.nivel,
  })
  if (!direto) {
    const motivo = !op.enviarLead ? "ordem pela conversa com o Felipe: espera o Aprovo" : nv.nivel === "indefinido" ? "nível indefinido: fila por segurança" : `cliente ${nv.nivel}: precisa do Aprovo do Felipe`
    return fila(r.texto, motivo)
  }
  const { enviarAoLead } = await import("./ordemDireta")
  const e = await enviarAoLead({ diretor, func, lead, texto: r.texto, novoId: op.novoId, aprovoDesligado, nivel: nv.nivel })
  if ("recusa" in e) return { saida: e.saida, status: e.status, motivo: e.motivo, nivel: nv.nivel }
  if ("fila" in e) {
    const p = (await lerConversa(diretor)).flatMap(m => m.acoes ?? []).filter(a => a.tipo === "mensagem" && a.status === "aguardando").length
    if (p >= MAX_PENDENTES) return { saida: `Já são ${p} mensagens esperando o Aprovo do Felipe (máximo ${MAX_PENDENTES} por diretor).`, status: 429, motivo: e.motivo, nivel: nv.nivel }
    return fila(e.texto ?? r.texto, e.motivo)
  }
  return { acao: e.acao, saida: `${func.nome} enviou direto ao lead (sem Aprovo): "${(e.acao as { texto: string }).texto}"`, destino: "enviado_direto", motivo: nv.nivel === "lead" ? `lead sem compra: enviado pelo ${func.nome}` : `${MOTIVO_APROVO_DESLIGADO}: enviado pelo ${func.nome}`, nivel: nv.nivel }
}

// jid candidato da ordem: o jid mandado ou, se o "cliente" é um telefone, o número no WhatsApp
function jidDaOrdem(x: Record<string, unknown>): string | null {
  const jid = typeof x.jid === "string" ? x.jid.trim() : ""
  if (jid) return /^\d{10,13}$/.test(jid) ? `${jid.length <= 11 ? "55" + jid : jid}@s.whatsapp.net` : jid
  const d = String(x.cliente ?? "").replace(/\D/g, "")
  return d.length >= 10 && d.length <= 13 && !/[a-z]/i.test(String(x.cliente ?? "")) ? `${d.length <= 11 ? "55" + d : d}@s.whatsapp.net` : null
}

// null = não é gráfica do Prospector (ou não dá para saber): segue o caminho de sempre, que só enfileira ou envia a lead.
async function ordenarProspecto(diretor: IdDiretor, func: Funcionario, x: Record<string, unknown>, ordem: string, op: { apiKey: string; cultura?: string[]; novoId: () => string }): Promise<Pronto | null> {
  const jid = jidDaOrdem(x)
  if (!jid) return null
  const { prospectoDoJid } = await import("./prospectorTrava")
  const prospecto = await prospectoDoJid(jid)
  if (!prospecto) return null
  const { nivelDoDestinatario } = await import("./nivelCliente")
  const nv = await nivelDoDestinatario(jid)
  if (nv.nivel !== "lead") return null   // já comprou (A, B, C) ou indefinido: fila do Aprovo
  const { travasDoProspecto, enviarAoProspecto } = await import("./ordemProspecto")
  const t = travasDoProspecto(prospecto)
  if (t) return t
  const cfg = await lerCampos<{ guiaAtendimento?: string; conhecimentoAgente?: Conhecimento[] }>(["guiaAtendimento", "conhecimentoAgente"])
  const { redigirComoFuncionario } = await import("./funcionariosServidor")
  const nome = prospecto.nome_fantasia || prospecto.razao_social || String(x.cliente ?? jid)
  const r = await redigirComoFuncionario({ funcionario: func, cliente: nome, jid, ordem, apiKey: op.apiKey, conhecimento: cfg.conhecimentoAgente, cultura: op.cultura, guia: cfg.guiaAtendimento?.trim() || undefined })
  if (!r.ok) return { saida: `Não deu: ${r.erro}`, acao: { id: op.novoId(), tipo: "falha", texto: r.erro }, status: 422 }
  return enviarAoProspecto({ diretor, func, prospecto, jid, texto: r.texto, novoId: op.novoId })
}
