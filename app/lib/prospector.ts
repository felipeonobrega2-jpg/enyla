// Prospector de Parceiros: nota (0 a 100), CNAE → serviço, distância até Barueri e funil.
// Puro. A tela e o banco usam estas funções; nada aqui envia mensagem.
//
// Para mudar a nota, edite só PESOS_NOTA. A conta é:
//   distância (até 40) + serviços (até 35) + tempo de empresa (até 15) + porte (até 10).
// Fora de SP, ou com situação diferente de ativa, a nota é 0: não entra.
//
// Distância: frete até a base em Barueri-SP. Com latitude/longitude do prospecto, usa elas.
// Sem coordenada, usa a sede do município (app/lib/municipiosSp.ts, fonte pública do IBGE).
// Sem as duas, fica no piso (não trata como se fosse ao lado). A curva é
//   pontos = round(40 × (piso + (1 − piso) × e^(−km / meiaVidaKm)))
// com piso 0,2 e meia-vida 80 km: ao lado vale 40; perto de 80 km vale cerca de metade
// do caminho até o piso; o interior de SP continua pontuando (cerca de 8).

import { MUNICIPIOS_SP } from "./municipiosSp"

export const SERVICOS_PROSPECTO = ["offset", "digital", "corteVinco", "colagem", "acabamento", "hotStamping", "cartonagem"] as const
export type ServicoProspect = (typeof SERVICOS_PROSPECTO)[number]

export const ETAPAS_FUNIL = ["encontrado", "qualificado", "abordado", "abriu", "cadastrou"] as const
/** Etapas do envio automático: não entram na contagem do funil da tela, mas andam no mesmo caminho. */
export const ETAPAS_ENVIO = ["encerrado_sem_resposta", "respondeu"] as const
export type EtapaFunil = (typeof ETAPAS_FUNIL)[number] | (typeof ETAPAS_ENVIO)[number] | "descartado"

// Ordem em que a etapa só anda para frente. Respondeu e encerrado ficam entre abordado e abriu.
const ORDEM_ETAPAS: readonly EtapaFunil[] = ["encontrado", "qualificado", "abordado", "encerrado_sem_resposta", "respondeu", "abriu", "cadastrou"]

export type MudancaEtapa = { etapa: EtapaFunil; em: string; motivo?: string; cadastroId?: string; envio?: unknown; por?: string; mensagem?: unknown }
export type EstadoFunil = { etapa: EtapaFunil; optOut: boolean; historico: MudancaEtapa[] }

/** Tudo que muda a nota está aqui. Os quatro tetos somam 100. */
export const PESOS_NOTA = {
  distancia: { max: 40, meiaVidaKm: 80, piso: 0.2 },
  servicosMax: 35,
  tempoMax: 15,
  porteMax: 10,
  // Cartonagem, corte e vinco, colagem e offset enchem os 35 juntos.
  // Acabamento, hot stamping e digital pontuam quando esses quatro não estão todos.
  pontosServico: { cartonagem: 12, corteVinco: 9, colagem: 8, offset: 8, acabamento: 4, hotStamping: 3, digital: 3 },
  pontosTempo: { anos10: 15, anos5: 12, anos2: 8, menosDe2: 2, semData: 5 },
  pontosPorte: { demais: 10, epp: 8, me: 5, mei: 2, desconhecido: 4 },
} as const

// CNAE-Subclasses 2.3 (IBGE / CONCLA). Conferido na API oficial em 2026-11-24:
// https://servicodados.ibge.gov.br/api/v2/cnae/subclasses/{codigo}
// "Impressão de material para outros usos" é 1813-0/99. Na 2.2 esse texto era 1813-0/02;
// 1813002 fica aceito só para não perder extrato antigo.
//
// 1822-9/99, na nota explicativa, reúne colagem, corte e vinco, hot stamping e laminação.
// A subclasse não diz qual deles a empresa faz, então a nota só ganha "acabamento".
// Corte e vinco, colagem e hot stamping entram quando vierem indicados, não por presunção.
// Digital não tem subclasse própria: 1813 entra como offset.
export const CNAES_PROSPECTO: Record<string, { codigo: string; descricao: string; servicos: readonly ServicoProspect[] }> = {
  "1813001": { codigo: "1813-0/01", descricao: "Impressão de material para uso publicitário", servicos: ["offset"] },
  "1813099": { codigo: "1813-0/99", descricao: "Impressão de material para outros usos", servicos: ["offset"] },
  "1813002": { codigo: "1813-0/02", descricao: "Impressão de material para outros usos (código da CNAE 2.2, substituído por 1813-0/99)", servicos: ["offset"] },
  "1821100": { codigo: "1821-1/00", descricao: "Serviços de pré-impressão", servicos: [] },
  "1822901": { codigo: "1822-9/01", descricao: "Serviços de encadernação e plastificação", servicos: ["acabamento"] },
  "1822999": { codigo: "1822-9/99", descricao: "Serviços de acabamentos gráficos, exceto encadernação e plastificação", servicos: ["acabamento"] },
  "1731100": { codigo: "1731-1/00", descricao: "Fabricação de embalagens de papel", servicos: ["cartonagem"] },
  "1732000": { codigo: "1732-0/00", descricao: "Fabricação de embalagens de cartolina e papel-cartão", servicos: ["cartonagem"] },
  "1733800": { codigo: "1733-8/00", descricao: "Fabricação de chapas e de embalagens de papelão ondulado", servicos: ["cartonagem"] },
}

export const FONTE_CNAE = "IBGE, CNAE-Subclasses 2.3, https://servicodados.ibge.gov.br/api/v2/cnae/subclasses/"

export function chaveMunicipio(nome: string): string {
  return nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

const porNome = new Map<string, { lat: number; lng: number; nome: string }>()
for (const m of MUNICIPIOS_SP) porNome.set(chaveMunicipio(m.nome), m)

const baseBarueri = porNome.get("barueri")
if (!baseBarueri) throw new Error("Barueri não está na tabela de municípios de SP")
export const BASE_BARUERI = { nome: "Barueri", uf: "SP" as const, lat: baseBarueri.lat, lng: baseBarueri.lng }

const R_TERRA_KM = 6371

export function distanciaKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (g: number) => (g * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R_TERRA_KM * Math.asin(Math.min(1, Math.sqrt(s)))
}

function numero(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v)
  return null
}

function coordenadaValida(lat: number | null, lng: number | null): lat is number {
  if (lat == null || lng == null) return false
  if (lat === 0 && lng === 0) return false
  return lat <= 6 && lat >= -34 && lng <= -32 && lng >= -74
}

export function localizar(p: { latitude?: number | null; longitude?: number | null; municipio?: string | null }): { lat: number; lng: number; origem: "coordenada" | "municipio" } | null {
  const lat = numero(p.latitude)
  const lng = numero(p.longitude)
  if (coordenadaValida(lat, lng) && lng != null) return { lat, lng, origem: "coordenada" }
  const m = p.municipio ? porNome.get(chaveMunicipio(p.municipio)) : undefined
  return m ? { lat: m.lat, lng: m.lng, origem: "municipio" } : null
}

/** Quilômetros até Barueri. Null quando não há coordenada nem município de SP na tabela. */
export function distanciaAteBarueri(p: { latitude?: number | null; longitude?: number | null; municipio?: string | null }): number | null {
  const lugar = localizar(p)
  if (!lugar) return null
  return distanciaKm(lugar, BASE_BARUERI)
}

export function codigoCnae(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "")
}

export function cnaeDeInteresse(codigo: string | null | undefined): boolean {
  return codigoCnae(codigo) in CNAES_PROSPECTO
}

export function servicosDosCnaes(principal?: string | null, secundarios?: readonly string[] | null): ServicoProspect[] {
  const ids = [principal, ...(secundarios ?? [])].map(c => codigoCnae(c)).filter(Boolean)
  const set = new Set<ServicoProspect>()
  for (const id of ids) for (const s of CNAES_PROSPECTO[id]?.servicos ?? []) set.add(s)
  return SERVICOS_PROSPECTO.filter(s => set.has(s))
}

const ALIAS_SERVICO: Record<string, ServicoProspect> = {
  offset: "offset",
  "impressao offset": "offset",
  digital: "digital",
  "impressao digital": "digital",
  cortevinco: "corteVinco",
  "corte e vinco": "corteVinco",
  colagem: "colagem",
  acabamento: "acabamento",
  hotstamping: "hotStamping",
  "hot stamping": "hotStamping",
  cartonagem: "cartonagem",
}

function canonServico(v: string): ServicoProspect | null {
  const bruto = chaveMunicipio(v)
  return ALIAS_SERVICO[bruto] ?? ALIAS_SERVICO[bruto.replace(/ /g, "")] ?? null
}

function pontosServicos(lista: readonly string[] | null | undefined): number {
  const ids = new Set<ServicoProspect>()
  for (const s of lista ?? []) {
    const id = canonServico(String(s))
    if (id) ids.add(id)
  }
  let soma = 0
  for (const id of ids) soma += PESOS_NOTA.pontosServico[id]
  return Math.min(PESOS_NOTA.servicosMax, soma)
}

function dia(v: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(v.trim())
  return m ? m[1] : v.trim()
}

export function hojeSp(agora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(agora)
}

function anosCompletos(abertura: string, hoje: string): number | null {
  const a = new Date(`${dia(abertura)}T12:00:00Z`)
  const h = new Date(`${dia(hoje)}T12:00:00Z`)
  if (Number.isNaN(a.getTime()) || Number.isNaN(h.getTime())) return null
  let anos = h.getUTCFullYear() - a.getUTCFullYear()
  if (h.getUTCMonth() < a.getUTCMonth() || (h.getUTCMonth() === a.getUTCMonth() && h.getUTCDate() < a.getUTCDate())) anos -= 1
  return Math.max(0, anos)
}

function pontosTempo(abertura: string | null | undefined, hoje: string): number {
  const anos = abertura?.trim() ? anosCompletos(abertura, hoje) : null
  if (anos == null) return PESOS_NOTA.pontosTempo.semData
  if (anos >= 10) return PESOS_NOTA.pontosTempo.anos10
  if (anos >= 5) return PESOS_NOTA.pontosTempo.anos5
  if (anos >= 2) return PESOS_NOTA.pontosTempo.anos2
  return PESOS_NOTA.pontosTempo.menosDe2
}

function pontosPorte(porte?: string | null): number {
  const p = chaveMunicipio(porte ?? "")
  if (!p || p === "00" || p === "0" || p === "nao informado") return PESOS_NOTA.pontosPorte.desconhecido
  if (p === "mei" || p.includes("microempreendedor")) return PESOS_NOTA.pontosPorte.mei
  if (p === "epp" || p === "03" || p === "3" || p.includes("pequeno")) return PESOS_NOTA.pontosPorte.epp
  if (p === "me" || p === "01" || p === "1" || p.includes("micro")) return PESOS_NOTA.pontosPorte.me
  if (p === "demais" || p === "05" || p === "5" || p.includes("medio") || p.includes("grande")) return PESOS_NOTA.pontosPorte.demais
  return PESOS_NOTA.pontosPorte.desconhecido
}

function situacaoAtiva(situacao?: string | null): boolean {
  const s = chaveMunicipio(situacao ?? "")
  return s === "ativa" || s === "02"
}

export type EntradaNota = {
  uf?: string | null
  municipio?: string | null
  latitude?: number | null
  longitude?: number | null
  servicos?: readonly string[] | null
  abertura?: string | null
  porte?: string | null
  situacao?: string | null
  hoje?: string
}

export type PartesNota = { distancia: number; servicos: number; tempo: number; porte: number }
export type ResultadoNota = { nota: number; entra: boolean; km: number | null; partes: PartesNota; motivo?: "fora de SP" | "situação não ativa" }

function zerada(motivo: ResultadoNota["motivo"]): ResultadoNota {
  return { nota: 0, entra: false, km: null, partes: { distancia: 0, servicos: 0, tempo: 0, porte: 0 }, motivo }
}

export function notaDoProspect(p: EntradaNota): ResultadoNota {
  if ((p.uf ?? "").trim().toUpperCase() !== "SP") return zerada("fora de SP")
  if (!situacaoAtiva(p.situacao)) return zerada("situação não ativa")
  const km = distanciaAteBarueri(p)
  const { max, meiaVidaKm, piso } = PESOS_NOTA.distancia
  const fracao = km == null ? piso : piso + (1 - piso) * Math.exp(-Math.max(0, km) / meiaVidaKm)
  const partes: PartesNota = {
    distancia: Math.round(max * fracao),
    servicos: pontosServicos(p.servicos),
    tempo: pontosTempo(p.abertura, p.hoje ?? hojeSp()),
    porte: pontosPorte(p.porte),
  }
  const nota = partes.distancia + partes.servicos + partes.tempo + partes.porte
  return { nota, entra: true, km, partes }
}

export function etapaConhecida(v: unknown): v is EtapaFunil {
  return v === "descartado" || (ETAPAS_FUNIL as readonly string[]).includes(String(v)) || (ETAPAS_ENVIO as readonly string[]).includes(String(v))
}

/** A etapa só anda para frente. Descartado é a exceção: sai de qualquer etapa e não volta. Opt-out trava. */
export function podeTransicionar(atual: EtapaFunil, proxima: EtapaFunil, optOut: boolean): boolean {
  if (optOut || atual === "descartado") return false
  if (proxima === "descartado") return true
  const de = ORDEM_ETAPAS.indexOf(atual)
  const para = ORDEM_ETAPAS.indexOf(proxima)
  return de >= 0 && para > de
}

export function transicionar(estado: EstadoFunil, proxima: EtapaFunil, em: string, motivo?: string): EstadoFunil | null {
  if (!podeTransicionar(estado.etapa, proxima, estado.optOut)) return null
  return {
    etapa: proxima,
    optOut: false,
    historico: [...estado.historico, { etapa: proxima, em, ...(motivo ? { motivo } : {}) }],
  }
}

/** "Não quero receber": marca descartado, grava a data e não volta à fila. */
export function aplicarOptOut(estado: EstadoFunil, em: string): EstadoFunil & { optOutEm?: string } {
  if (estado.optOut) return { ...estado, etapa: "descartado" }
  return {
    etapa: "descartado",
    optOut: true,
    optOutEm: em,
    historico: [...estado.historico, { etapa: "descartado", em, motivo: "não quero receber" }],
  }
}

export const MOTIVO_CADASTRO_RECEBIDO = "cadastro recebido (aguardando aprovação do Felipe)"
export const MOTIVO_CADASTRO_APROVADO = "cadastro aprovado pelo Felipe"

/** Cadastro público em /parceiros com o mesmo CNPJ: só registra no histórico, a etapa não muda.
 *  Descartado, opt-out ou o mesmo cadastro já registrado: nada a fazer. */
export function registrarCadastroRecebido(estado: EstadoFunil, em: string, cadastroId: string): EstadoFunil | null {
  if (estado.optOut || estado.etapa === "descartado" || !cadastroId) return null
  if (estado.historico.some(h => h.cadastroId === cadastroId)) return null
  return { ...estado, historico: [...estado.historico, { etapa: estado.etapa, em, motivo: MOTIVO_CADASTRO_RECEBIDO, cadastroId }] }
}

/** O Felipe aprovou o cadastro do parceiro com o mesmo CNPJ: o funil vai para "cadastrou" quando a regra deixa. */
export function aoCadastrarComCnpj(estado: EstadoFunil, em: string, cadastroId?: string): EstadoFunil | null {
  const foi = transicionar(estado, "cadastrou", em, MOTIVO_CADASTRO_APROVADO)
  if (!foi || !cadastroId) return foi
  const historico = [...foi.historico]
  historico[historico.length - 1] = { ...historico[historico.length - 1], cadastroId }
  return { ...foi, historico }
}
