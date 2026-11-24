// Porta externa: dispensar/reabrir pendência e listar as pendências da área (com a chave) e as dispensadas à parte.
// A lógica fica aqui; o route só despacha. Nada é apagado (ver pendenciaDispensada).
import { dispensar, reabrir, listarDispensadas, vigente, type Dispensada } from "./pendenciaDispensada"
import type { Foto } from "./conversaDiretor"
import type { IdDiretor } from "./diretoria"

export type Resultado = { status: 200 | 400 | 404; corpo: Record<string, unknown> }
const POR: Record<IdDiretor, string> = { coo: "COO", cco: "CCO", cmo: "CMO", cfo: "CFO", cto: "CTO" }

// A foto guarda as decisões sem filtro; o filtro é na leitura, então dispensar/reabrir vale na hora
export function pendenciasDaArea(foto: Pick<Foto, "decisoes">, diretor: IdDiretor, dispensadas: Dispensada[], agora = Date.now()) {
  const vig = new Map(dispensadas.filter(d => vigente(d, agora)).map(d => [d.chave, d]))
  const todas = foto.decisoes?.[diretor] ?? []
  return {
    pendencias: todas.filter(x => !vig.has(x.chave)).map(x => ({ chave: x.chave, titulo: x.texto })),
    dispensadas: todas.filter(x => vig.has(x.chave)).map(x => { const d = vig.get(x.chave)!; return { chave: d.chave, titulo: d.titulo || x.texto, motivo: d.motivo, por: d.por, em: d.em, ate: d.ate ?? null } }),
  }
}

export async function lerPendenciasDaArea(foto: Pick<Foto, "decisoes">, diretor: IdDiretor) {
  return pendenciasDaArea(foto, diretor, await listarDispensadas().catch(() => []))
}

// POST { acao: "dispensar_pendencia", chave, motivo, titulo?, ate? } | { acao: "reabrir_pendencia", chave } (qualquer diretor)
export async function acaoPendencia(diretor: IdDiretor, b: Record<string, unknown>): Promise<Resultado> {
  if (b.acao === "dispensar_pendencia") {
    const r = await dispensar(b, POR[diretor])
    return r.ok ? { status: 200, corpo: { ok: true, resultado: `Pendência dispensada: ${r.dispensada.titulo}`, dispensada: r.dispensada } } : { status: r.status, corpo: { erro: r.erro } }
  }
  const r = await reabrir(b.chave, POR[diretor])
  return r.ok ? { status: 200, corpo: { ok: true, resultado: "Pendência reaberta.", chave: r.chave } } : { status: r.status, corpo: { erro: r.erro } }
}

// A foto é guardada por até 12 h: depois de dispensar ou reabrir, monta outra em segundo plano para a pauta e a conversa
export async function renovarFotoDepois() {
  try { await (await import("./conversaDiretor")).renovarFoto() } catch { /* a foto velha continua valendo; a leitura já filtra */ }
}
