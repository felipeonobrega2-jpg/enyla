// Guarda do perfil diretor, chamada pelo proxy.ts antes de qualquer rota de /api. Pura: o proxy busca os dados
// (interruptores, configuração salva) e passa aqui; assim cada bloqueio tem teste sem banco.
import { CAMPOS_CONFIG_VIGIADOS, classificar, classificarConfig, decidir, soAdmin, type Decisao, type Interruptores, type InterruptorId, type Papel } from "./acesso"

export type EntradaGuarda = {
  papel: Papel | undefined
  metodo: string
  caminho: string
  corpo?: unknown                       // JSON do corpo, quando houver
  configSalva?: Record<string, unknown> // só os CAMPOS_CONFIG_VIGIADOS, para POST /api/config
  interruptores?: Interruptores | null
}
export type ResultadoGuarda = { decisao: Decisao; ids: InterruptorId[]; auditar: boolean; antesDepois?: { antes: unknown; depois: unknown } }

const escrita = (m: string) => !["GET", "HEAD", "OPTIONS"].includes(m.toUpperCase())
const ehConfig = (c: string) => /^\/api\/config\/?$/.test(c)

export const TAMANHO_MAX_AUDITORIA = 4000
// Campo cujo nome parece segredo: o valor nunca vai para o log, só a marca de que existe ou não
const NOME_SEGREDO = /senha|password|hash|key|token|secret|segredo|chave/i
export function mascararSegredos(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(mascararSegredos)
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) =>
      [k, NOME_SEGREDO.test(k) ? (x === null || x === undefined || x === "" ? "(vazia)" : "(definida)") : mascararSegredos(x)]))
  }
  return v
}
// Corpo grande não entra inteiro na auditoria (cortado, com a marca). Segredos são mascarados antes de cortar.
export function enxugar(bruto: unknown): unknown {
  if (bruto === undefined) return null
  const v = mascararSegredos(bruto)
  const s = JSON.stringify(v)
  if (s.length <= TAMANHO_MAX_AUDITORIA) return v
  return { _cortado: true, inicio: s.slice(0, TAMANHO_MAX_AUDITORIA) }
}

export function avaliarGuarda(e: EntradaGuarda): ResultadoGuarda {
  if (e.papel === "admin") return { decisao: { permitido: true }, ids: [], auditar: false }
  if (e.papel === "diretor" && soAdmin(e.caminho)) {
    return { decisao: { permitido: false, status: 403, interruptor: "configuracao", mensagem: "Usuários e papéis só o administrador mexe." }, ids: ["configuracao"], auditar: false }
  }
  let ids = classificar(e.metodo, e.caminho)
  let antesDepois: ResultadoGuarda["antesDepois"]
  if (ehConfig(e.caminho) && e.metodo.toUpperCase() === "POST" && e.corpo && typeof e.corpo === "object") {
    const corpo = e.corpo as Record<string, unknown>, salvo = e.configSalva ?? {}
    ids = [...new Set([...ids, ...classificarConfig(corpo, salvo)])]
    const chaves = CAMPOS_CONFIG_VIGIADOS.filter(k => k in corpo && JSON.stringify(corpo[k] ?? null) !== JSON.stringify(salvo[k] ?? null))
    // Chave de API nunca vai para o log: só a marca de que mudou
    const sem = (o: Record<string, unknown>) => Object.fromEntries(chaves.map(k => [k, k === "apiKey" ? (o[k] ? "(definida)" : "(vazia)") : o[k]]))
    if (chaves.length) antesDepois = { antes: sem(salvo), depois: sem(corpo) }
  }
  const decisao = decidir(e.papel, e.interruptores, ids)
  return { decisao, ids, auditar: e.papel === "diretor" && escrita(e.metodo) && decisao.permitido, antesDepois }
}
