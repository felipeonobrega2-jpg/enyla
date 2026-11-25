// Porta externa (só leitura): pedidos digitais (DIG) em andamento para a leitura de produção.
// Só dados operacionais: nada de telefone, e-mail, documento, jid ou endereço. Funções puras, nada é gravado.
import { diasUteisEntre } from "./diasUteis"
import { hojeBrasilia } from "./etapasProducao"

const LIMITE = 7000
const STATUS = ["sinal_pago", "arte", "producao"] as const
const ETAPAS = ["arte", "producao", "pronto", "enviado"] as const

type PedidoDig = {
  id: string; nome?: string | null; produto?: string | null; quantidade?: number; status: string; teste?: boolean
  em?: string; sinalPagoEm?: string; arteEnviadaEm?: string; arteAprovadaEm?: string
  designerAvisadoEm?: string; villaEnviadoEm?: string; prontoEm?: string; statusEm?: string
  sugestaoArteAprovada?: { trecho: string; em: string } | null   // só leitura: o cliente parece ter aprovado a arte; falta o clique de uma pessoa
}
const CAMPOS_DATA = ["em", "sinalPagoEm", "arteEnviadaEm", "arteAprovadaEm", "designerAvisadoEm", "villaEnviadoEm", "prontoEm", "statusEm"] as const

export type PedidoDigitalProducao = {
  id: string; cliente: string | null; produto: string | null; quantidade: number | null; status: string
  naEtapaDesde: string | null; diasUteisNaEtapa: number | null; faltam: string[]
  sugestaoArteAprovada?: { trecho: string; em: string }
} & Record<(typeof CAMPOS_DATA)[number], string | null>

// Data (aaaa-mm-dd) em Brasília; data sem hora fica como veio
const diaDe = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : (isNaN(Date.parse(s)) ? s.slice(0, 10) : new Date(s).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }))

/** Data gravada que marca a entrada na etapa atual: statusEm ou, na falta, o evento que caracteriza a etapa. */
function desde(p: PedidoDig): string | null {
  const evento = p.status === "producao" ? (p.villaEnviadoEm ?? p.arteAprovadaEm)
    : p.status === "arte" ? (p.designerAvisadoEm ?? p.sinalPagoEm)
    : p.sinalPagoEm
  return p.statusEm ?? evento ?? null
}

export function digitaisEmProducao(pedidos: PedidoDig[] | undefined, hoje = hojeBrasilia()): PedidoDigitalProducao[] {
  return (pedidos ?? []).filter(p => !p.teste && (STATUS as readonly string[]).includes(p.status)).map(p => {
    const d = desde(p)
    const dias = d ? Math.max(0, diasUteisEntre(diaDe(d), hoje)) : null
    const faltam = ETAPAS.slice(Math.max(0, ETAPAS.indexOf(p.status as never))).filter(e => !(e === "pronto" && p.prontoEm))
    const datas = Object.fromEntries(CAMPOS_DATA.map(c => [c, p[c] ?? null])) as Record<(typeof CAMPOS_DATA)[number], string | null>
    return { id: p.id, cliente: p.nome ?? null, produto: p.produto ?? null, quantidade: p.quantidade ?? null, status: p.status,
      ...datas, naEtapaDesde: d, diasUteisNaEtapa: dias, faltam,
      ...(p.sugestaoArteAprovada ? { sugestaoArteAprovada: { trecho: p.sugestaoArteAprovada.trecho, em: p.sugestaoArteAprovada.em } } : {}) }
  })
}

/**
 * Junta o bloco `digital` ao JSON da produção (offset), sempre JSON válido. Nenhum Digital aberto some: para caber em
 * 7000 caracteres, primeiro tira as datas soltas do Digital e depois enxuga o Offset (listas do fim para o começo).
 * Se mesmo assim passar do limite, a lista do Digital segue completa.
 */
export function comDigital(jsonProducao: string, pedidos: PedidoDig[] | undefined, hoje = hojeBrasilia()): string {
  const lista = digitaisEmProducao(pedidos, hoje)
  if (!lista.length) return jsonProducao
  let base: Record<string, unknown>
  try { base = JSON.parse(jsonProducao) } catch { return jsonProducao }
  const monta = (b: Record<string, unknown>, digital: unknown) => JSON.stringify({ ...b, digital })
  const completo = monta(base, { pedidos: lista })
  if (completo.length <= LIMITE) return completo
  // Sem as datas soltas, os pedidos parados há mais tempo primeiro
  const enxutos = lista.map(p => ({ id: p.id, cliente: p.cliente, produto: p.produto, quantidade: p.quantidade, status: p.status, naEtapaDesde: p.naEtapaDesde, diasUteisNaEtapa: p.diasUteisNaEtapa, faltam: p.faltam, sugestaoArteAprovada: p.sugestaoArteAprovada }))
    .sort((a, b) => (b.diasUteisNaEtapa ?? -1) - (a.diasUteisNaEtapa ?? -1))
  const digital = { pedidos: enxutos }
  const b: Record<string, unknown> = { ...base }
  while (monta(b, digital).length > LIMITE) {
    // Enxuga o Offset: tira o último item da maior lista; sem lista para enxugar, para
    const [chave] = Object.entries(b).filter(([, v]) => Array.isArray(v) && v.length).sort((x, y) => JSON.stringify(y[1]).length - JSON.stringify(x[1]).length)[0] ?? []
    if (!chave) break
    b[chave] = (b[chave] as unknown[]).slice(0, -1)
  }
  return monta(b, digital)
}
