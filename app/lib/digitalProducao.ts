// Porta externa (só leitura): pedidos digitais (DIG) em andamento para a leitura de produção.
// Só dados operacionais: nada de telefone, e-mail, documento, jid ou endereço. Funções puras, nada é gravado.
import { diasUteisEntre, somarDiasUteis } from "./diasUteis"
import { prazoDigital } from "./prazoDigital"
import { hojeBrasilia } from "./etapasProducao"

const LIMITE = 7000
const STATUS = ["sinal_pago", "arte", "producao"] as const
const ETAPAS = ["arte", "producao", "pronto", "enviado"] as const

type PedidoDig = {
  id: string; nome?: string | null; empresa?: string | null; briefing?: { marca?: string }; entregaPrevista?: string | null; produto?: string | null; quantidade?: number; status: string
  em?: string; sinalPagoEm?: string; arteEnviadaEm?: string; arteAprovadaEm?: string
  designerAvisadoEm?: string; villaEnviadoEm?: string; prontoEm?: string; statusEm?: string
  sugestaoArteAprovada?: { trecho: string; em: string } | null   // só leitura: o cliente parece ter aprovado a arte; falta o clique de uma pessoa
}
const CAMPOS_DATA = ["em", "sinalPagoEm", "arteEnviadaEm", "arteAprovadaEm", "designerAvisadoEm", "villaEnviadoEm", "prontoEm", "statusEm"] as const

export type PedidoDigitalProducao = {
  id: string; cliente: string | null; produto: string | null; quantidade: number | null; status: string
  naEtapaDesde: string | null; diasUteisNaEtapa: number | null; faltam: string[]
  numero: string; marca: string | null; entregaPrevista: string | null; arte: "pendente" | "enviada" | "aprovada"; arteEm: string | null
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
  return (pedidos ?? []).filter(p => (STATUS as readonly string[]).includes(p.status)).map(p => {
    const d = desde(p)
    const dias = d ? Math.max(0, diasUteisEntre(diaDe(d), hoje)) : null
    const faltam = ETAPAS.slice(Math.max(0, ETAPAS.indexOf(p.status as never))).filter(e => !(e === "pronto" && p.prontoEm))
    const datas = Object.fromEntries(CAMPOS_DATA.map(c => [c, p[c] ?? null])) as Record<(typeof CAMPOS_DATA)[number], string | null>
    const arte = p.arteAprovadaEm ? "aprovada" : p.arteEnviadaEm ? "enviada" : "pendente"
    const arteDia = p.arteAprovadaEm ?? p.arteEnviadaEm
    // Entrega prevista: a gravada no pedido ou, com a arte aprovada, o prazo do digital (dias úteis) a partir da aprovação
    const entrega = p.entregaPrevista ?? (p.arteAprovadaEm && p.quantidade ? somarDiasUteis(diaDe(p.arteAprovadaEm), prazoDigital(p.quantidade).max) : null)
    return { id: p.id, numero: p.id, cliente: p.nome ?? null, marca: p.briefing?.marca?.trim() || p.empresa?.trim() || null, produto: p.produto ?? null, quantidade: p.quantidade ?? null, status: p.status,
      ...datas, naEtapaDesde: d, diasUteisNaEtapa: dias, faltam, entregaPrevista: entrega, arte, arteEm: arteDia ? diaDe(arteDia) : null,
      ...(p.sugestaoArteAprovada ? { sugestaoArteAprovada: { trecho: p.sugestaoArteAprovada.trecho, em: p.sugestaoArteAprovada.em } } : {}) }
  })
}

/** Junta o bloco `digital` ao JSON da produção (offset). Nenhum pedido não cancelado fica de fora: se passar de 7000
 *  caracteres, tira só as datas soltas (o essencial continua) e o limite deixa de valer para o bloco digital. */
export function comDigital(jsonProducao: string, pedidos: PedidoDig[] | undefined, hoje = hojeBrasilia()): string {
  const lista = digitaisEmProducao(pedidos, hoje)
  if (!lista.length) return jsonProducao
  let base: Record<string, unknown>
  try { base = JSON.parse(jsonProducao) } catch { return jsonProducao }
  const monta = (digital: unknown) => JSON.stringify({ ...base, digital })
  const completo = monta({ pedidos: lista })
  if (completo.length <= LIMITE) return completo
  const enxutos = lista.map(p => { const e: Record<string, unknown> = { ...p }; for (const c of CAMPOS_DATA) if (c !== "sinalPagoEm") delete e[c]; return e })
    .sort((a, b) => ((b.diasUteisNaEtapa as number | null) ?? -1) - ((a.diasUteisNaEtapa as number | null) ?? -1))
  return monta({ pedidos: enxutos })
}
