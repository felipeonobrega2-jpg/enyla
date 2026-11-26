// Chave `aprovoObrigatorio` (AppConfig, padrão false). Desligada, o que ia para a fila do Aprovo sai direto pelo envio do
// funcionário indicado, com as outras travas: horário, exclusão, limite diário, espaçamento, promessa de orçamento sem
// link real e a conferência de valor (cada R$ de saldo/falta pagar bate ao centavo com o "a receber" do pedido, lido na
// hora). Ligada, tudo volta a ser como era: a fila. Cada envio direto e cada recusa ficam em `aprovoDesligadoLog`.
// Só roda no servidor.
import { lerCampos, mudarConfig } from "./configAtomica"
import { nomeChave } from "./negocio"

export const MOTIVO_APROVO_DESLIGADO = "aprovo_desligado"
export const MAX_LOG = 1000

export async function lerAprovoObrigatorio(): Promise<boolean> {
  const c = await lerCampos<{ aprovoObrigatorio?: unknown }>(["aprovoObrigatorio"])
  return c.aprovoObrigatorio === true
}

// ── Valores em R$ do texto ──────────────────────────────────────────────────
const REAL = /R\$\s*(\d+(?:\.\d{3})*)(?:[,.](\d{1,2}))?/g
const SALDO = /\b(saldo|falt\w*|restan\w*|rest[ao]|a pagar|a receber|em aberto|pendente|pendência|devid\w*|devend\w*|deve|quitar|quitaç\w*|pagar)\b/i

const SALDO_DEPOIS = /^\s*(?:(?:de|do|em|a)\s+)?(?:saldo|restantes?|em aberto|pendentes?|a pagar|a receber|devidos?|de falta)\b/i

export type ValorNoTexto = { centavos: number; trecho: string; saldo: boolean }

const emCentavos = (inteiro: string, dec?: string) => Number(inteiro.replace(/\./g, "")) * 100 + (dec ? Number(dec.padEnd(2, "0")) : 0)

// Cada R$ do texto, e se ele fala de saldo/falta pagar (palavra-chave entre o valor vizinho ou o fim da frase e este valor, ou logo depois dele)
export function valoresDoTexto(texto: string): ValorNoTexto[] {
  const ms = [...texto.matchAll(REAL)]
  return ms.map((m, i) => {
    const ini = m.index!, fim = ini + m[0].length
    const antes = Math.max(i ? ms[i - 1].index! + ms[i - 1][0].length : 0, texto.slice(0, ini).search(/[.!?;\n][^.!?;\n]*$/) + 1)
    const depois = texto.slice(fim, fim + 30)   // "R$ 400 de saldo", "R$ 400 em aberto": a palavra logo colada ao valor
    return { centavos: emCentavos(m[1], m[2]), trecho: m[0], saldo: SALDO.test(texto.slice(antes, ini)) || SALDO_DEPOIS.test(depois) }
  })
}

export type PedidoReceber = { numero: string; cliente: string; aReceber: number }
export type ConferenciaValor = { ok: true } | { ok: false; motivo: string; saida: string }

const brl = (c: number) => `R$ ${(c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// Os pedidos a que a mensagem se refere: número (DIG-0001 ou outro) dito na ordem ou no texto, ou o nome do cliente
export function pedidosDaMensagem(pedidos: PedidoReceber[], o: { cliente?: string; pedido?: string; texto: string }): PedidoReceber[] {
  const numeros = new Set<string>()
  for (const s of [o.pedido, o.cliente]) if (s?.trim()) numeros.add(s.trim().toUpperCase())
  for (const m of o.texto.matchAll(/\bDIG-\d+\b/gi)) numeros.add(m[0].toUpperCase())
  for (const m of o.texto.matchAll(/\/d\/([A-Za-z0-9-]+)/g)) numeros.add(m[1].toUpperCase())
  const nome = nomeChave(o.cliente)
  const porNumero = pedidos.filter(p => numeros.has(p.numero.toUpperCase()))
  return porNumero.length ? porNumero : nome ? pedidos.filter(p => nomeChave(p.cliente) === nome) : []
}

// Trava de valor: todo valor que fala de saldo (todos, se `todosSaoSaldo`, como na Cobrança) tem de ser, ao centavo, o a
// receber de um dos pedidos da mensagem (ou a soma deles). Sem valor de saldo no texto, passa.
export function conferirValores(texto: string, pedidos: PedidoReceber[], o: { cliente?: string; pedido?: string; todosSaoSaldo?: boolean }): ConferenciaValor {
  const citados = valoresDoTexto(texto).filter(v => o.todosSaoSaldo || v.saldo)
  if (!citados.length) return { ok: true }
  const candidatos = pedidosDaMensagem(pedidos, { ...o, texto })
  const aceitos = new Set(candidatos.map(p => Math.round(p.aReceber * 100)))
  if (candidatos.length > 1) aceitos.add(candidatos.reduce((s, p) => s + Math.round(p.aReceber * 100), 0))
  const errado = citados.find(v => !aceitos.has(v.centavos))
  if (!errado) return { ok: true }
  const esperado = candidatos.length ? [...aceitos].map(brl).join(" ou ") : "nenhum pedido com saldo a receber"
  const motivo = `valor divergente do a receber: o texto cita ${brl(errado.centavos)} e o a receber do pedido é ${esperado}`
  return { ok: false, motivo, saida: `Nada foi enviado: ${motivo}. Confira o a receber em ?o=detalhe&area=financeiro e refaça o texto.` }
}

// Lê o a receber na hora e confere
export async function conferirValoresAgora(texto: string, o: { cliente?: string; pedido?: string; todosSaoSaldo?: boolean }): Promise<ConferenciaValor> {
  if (!valoresDoTexto(texto).some(v => o.todosSaoSaldo || v.saldo)) return { ok: true }
  try {
    const { aReceberDosPedidos } = await import("./financeiroExterno")
    return conferirValores(texto, await aReceberDosPedidos(), o)
  } catch (e) {
    const motivo = `não consegui conferir o a receber agora (${String(e).slice(0, 120)})`
    return { ok: false, motivo, saida: `Nada foi enviado: ${motivo}.` }
  }
}

// ── Histórico para o Felipe auditar ─────────────────────────────────────────
export type RegistroAprovo = {
  em: string; destino: "enviado_direto" | "recusado"; motivo: string; diretor: string; agente: string
  cliente: string; jid?: string; texto: string; nivel?: string; detalhe?: string
}
export async function registrarAprovo(r: Omit<RegistroAprovo, "em" | "motivo"> & { motivo?: string; em?: string }): Promise<void> {
  const reg: RegistroAprovo = { ...r, motivo: r.motivo ?? MOTIVO_APROVO_DESLIGADO, em: r.em ?? new Date().toISOString() }
  await mudarConfig((d: { aprovoDesligadoLog?: RegistroAprovo[] }) => ({ aprovoDesligadoLog: [reg, ...(d.aprovoDesligadoLog ?? [])].slice(0, MAX_LOG) })).catch(() => null)
}

// ── Funcionário do quadro (Cobrança etc.): envio direto ao cliente pelo cadastro ou pela conversa ligada ──────────
// Mesmas travas do envio ao lead: agente ligado e no horário, promessa de orçamento sem link real (409), conferência
// do a receber agora, limite diário por diretor e o espaçamento do envio do agente.
export type RecusaDireta = { recusa: true; status: number; motivo: string; saida: string }
export async function enviarFuncionarioDireto(a: {
  diretor: string; func: { id: string; nome: string }; cliente: string; pedido?: string; texto: string; novoId: () => string
}): Promise<{ acao: import("./diretoriaServidor").AcaoConversa } | RecusaDireta> {
  const barrar = async (status: number, motivo: string, saida: string): Promise<RecusaDireta> => {
    await registrarAprovo({ destino: "recusado", diretor: a.diretor, agente: a.func.nome, cliente: a.cliente, texto: a.texto, detalhe: motivo })
    return { recusa: true, status, motivo, saida }
  }
  const { lerCfg } = await import("./agenteAuto")
  const { dentroDoHorario, travaPromessaDeOrcamento } = await import("./agenteLeads")
  const { MOTIVO_FORA_DO_HORARIO, MOTIVO_PROMETIA_ORCAMENTO, reservarEnvioDireto, devolverEnvioDireto, MAX_DIRETOS_DIA } = await import("./ordemDireta")
  const cfg = await lerCfg()
  if (!cfg.agenteAuto?.ligado || !dentroDoHorario(cfg.agenteAuto.horario)) return barrar(409, MOTIVO_FORA_DO_HORARIO, `Nada foi enviado nem criado: ${MOTIVO_FORA_DO_HORARIO}. Tente de novo dentro do horário.`)
  const t = travaPromessaDeOrcamento(a.texto, { idsExistentes: (cfg.pedidosDigitais ?? []).map(p => p.id) })
  if (t.reescrita) return barrar(409, MOTIVO_PROMETIA_ORCAMENTO, `Nada foi enviado: ${MOTIVO_PROMETIA_ORCAMENTO}. Ponha o link real da proposta ou tire a promessa.`)
  const v = await conferirValoresAgora(t.resposta, { cliente: a.cliente, pedido: a.pedido, todosSaoSaldo: /cobran/i.test(`${a.func.id} ${a.func.nome}`) })
  if (!v.ok) return barrar(409, v.motivo, v.saida)
  const { destinoDoCliente, enviarAoCliente } = await import("./enviarCliente")
  const dest = await destinoDoCliente(a.cliente)
  if (!dest.destino) return barrar(404, "sem destino", `Sem telefone de ${a.cliente} no cadastro e nenhuma conversa ligada a ele. Nada foi enviado.`)
  if (!await reservarEnvioDireto(a.diretor)) return barrar(429, "limite diário", `Já foram ${MAX_DIRETOS_DIA} envios diretos hoje (máximo por diretor por dia). Nada foi enviado.`)
  const r = await enviarAoCliente(a.cliente, t.resposta, dest.jid ?? undefined).catch(e => ({ ok: false as const, erro: String(e), status: 503 }))
  if (!r.ok) { await devolverEnvioDireto(a.diretor); return barrar(r.status === 429 ? 429 : 503, r.erro, `Não enviou: ${r.erro}. Nada foi para a fila.`) }
  const em = new Date().toISOString()
  await registrarAprovo({ destino: "enviado_direto", diretor: a.diretor, agente: a.func.nome, cliente: a.cliente, jid: r.jid, texto: t.resposta, em })
  return { acao: { id: a.novoId(), tipo: "mensagem", funcionario: a.func.nome, cliente: a.cliente, jid: r.jid, texto: t.resposta, status: "enviado", em, direto: true, destino: "enviado_direto", motivo: MOTIVO_APROVO_DESLIGADO, diretor: a.diretor } }
}
