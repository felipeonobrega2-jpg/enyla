// Grandes negócios: os peixes grandes (fábrica de 350 mil, 30 mil caixas de amostra enviada, o quase fechando),
// num funil próprio, com o próximo passo e a data. Fica em config.grandesNegocios (campo do servidor).

export type EtapaGrande = "contato" | "amostra" | "proposta" | "negociacao" | "fechado" | "perdido"
export const ETAPAS_GRANDE: { id: EtapaGrande; nome: string }[] = [
  { id: "contato", nome: "Primeiro contato" },
  { id: "amostra", nome: "Amostra / visita" },
  { id: "proposta", nome: "Proposta enviada" },
  { id: "negociacao", nome: "Negociação final" },
  { id: "fechado", nome: "Fechado" },
  { id: "perdido", nome: "Perdido" },
]
export const ABERTAS: EtapaGrande[] = ["contato", "amostra", "proposta", "negociacao"]

export type NotaGrande = { em: string; texto: string }
export type GrandeNegocio = {
  id: string
  nome: string                  // quem (pessoa ou empresa)
  empresa?: string
  jid?: string | null           // conversa do WhatsApp, quando tem
  telefone?: string
  produto?: string              // "embalagem de chocolate", "caixinhas Wepink"
  volume?: number | null        // unidades
  valor?: number | null         // estimado, em R$
  etapa: EtapaGrande
  proximoPasso?: string         // "ligar para saber da amostra"
  proximoEm?: string | null     // AAAA-MM-DD
  numeros?: string[]            // orçamentos ligados (ORC-…)
  origem?: "ligacao" | "whatsapp" | "indicacao" | "visita" | "outro"
  notas: NotaGrande[]
  criadoEm: string
  atualizadoEm: string
  fechadoEm?: string
}

export const hojeSP = (agora = Date.now()) => new Date(agora - 3 * 3600_000).toISOString().slice(0, 10)

// Precisa de você: o próximo passo venceu (ou é hoje), ou o negócio aberto está sem próximo passo
export function precisaDeVoce(g: GrandeNegocio, agora = Date.now()): "vencido" | "hoje" | "sem_passo" | null {
  if (!ABERTAS.includes(g.etapa)) return null
  if (!g.proximoEm || !g.proximoPasso?.trim()) return "sem_passo"
  const h = hojeSP(agora)
  return g.proximoEm < h ? "vencido" : g.proximoEm === h ? "hoje" : null
}

// Abertos primeiro: o que precisa de você, depois a etapa mais avançada e o maior valor
export function ordenarGrandes(gs: GrandeNegocio[], agora = Date.now()): GrandeNegocio[] {
  const peso = (g: GrandeNegocio) => ({ vencido: 0, hoje: 1, sem_passo: 2 } as Record<string, number>)[precisaDeVoce(g, agora) ?? ""] ?? 3
  const ordemEtapa = (e: EtapaGrande) => ({ negociacao: 0, proposta: 1, amostra: 2, contato: 3, fechado: 4, perdido: 5 })[e]
  return [...gs].sort((a, b) => Number(!ABERTAS.includes(a.etapa)) - Number(!ABERTAS.includes(b.etapa)) || peso(a) - peso(b) || ordemEtapa(a.etapa) - ordemEtapa(b.etapa) || (b.valor ?? 0) - (a.valor ?? 0))
}

// Sugestão: conversa ICP/Oportunidade com volume grande, ou proposta offset alta, que ainda não está na lista
export const VOLUME_GRANDE = 10_000
export const VALOR_GRANDE = 15_000
export type SugestaoGrande = { jid?: string | null; numero?: string; nome: string; volume?: number | null; valor?: number | null; motivo: string }
export function sugestoesGrandes(a: {
  conversas: { jid: string; nome: string | null; etiquetas: string[] | null; quantidade?: number | null; produto?: string | null }[]
  propostas: { numero: string; nomeCliente: string; preco: number; quantidade?: number | null; jid?: string | null }[]
  grandes: GrandeNegocio[]; dispensadas?: string[]
}): SugestaoGrande[] {
  const jaJid = new Set(a.grandes.map(g => g.jid).filter(Boolean)), jaNum = new Set(a.grandes.flatMap(g => g.numeros ?? []))
  const fora = new Set(a.dispensadas ?? [])
  const out: SugestaoGrande[] = []
  for (const p of a.propostas) {
    if (p.preco < VALOR_GRANDE || jaNum.has(p.numero) || (p.jid && jaJid.has(p.jid)) || fora.has(p.numero)) continue
    out.push({ numero: p.numero, jid: p.jid ?? null, nome: p.nomeCliente, valor: p.preco, volume: p.quantidade ?? null, motivo: `proposta ${p.numero} de ${p.preco.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}` })
  }
  for (const c of a.conversas) {
    const grande = (c.quantidade ?? 0) >= VOLUME_GRANDE
    if (!grande || jaJid.has(c.jid) || fora.has(c.jid) || out.some(o => o.jid === c.jid)) continue
    out.push({ jid: c.jid, nome: c.nome ?? c.jid.split("@")[0], volume: c.quantidade, motivo: `falou em ${(c.quantidade ?? 0).toLocaleString("pt-BR")} un${c.produto ? ` · ${c.produto}` : ""}` })
  }
  return out.sort((x, y) => (y.valor ?? 0) - (x.valor ?? 0) || (y.volume ?? 0) - (x.volume ?? 0)).slice(0, 8)
}
