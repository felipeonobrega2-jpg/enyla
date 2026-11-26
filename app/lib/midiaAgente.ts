// Biblioteca de mídia do agente: vídeos e fotos de produção que você sobe (Configurações → Agentes) e que o
// follow-up usa (F2 leva um vídeo). Puro: a escolha do que mandar.
export const ETAPAS_MIDIA = ["F1", "F2", "F3", "reativacao"] as const
export type EtapaMidia = typeof ETAPAS_MIDIA[number]
export const etapaValida = (e: unknown): EtapaMidia | undefined => ETAPAS_MIDIA.find(x => x === e)
export type MidiaAgente = { id: string; url: string; mime: string; nome: string; descricao: string; tipo: "video" | "foto"; em: string; usos?: number; ativo?: boolean; etapa?: EtapaMidia }

// O menos usado (empate: o mais antigo), entre os ativos do tipo. Com `etapa`, só os cadastrados naquela etapa
export function escolherMidia(lista: MidiaAgente[] | undefined, tipo: MidiaAgente["tipo"], etapa?: EtapaMidia): MidiaAgente | null {
  const ok = (lista ?? []).filter(m => m.tipo === tipo && m.ativo !== false && (!etapa || m.etapa === etapa))
  if (!ok.length) return null
  return [...ok].sort((a, b) => (a.usos ?? 0) - (b.usos ?? 0) || a.em.localeCompare(b.em))[0]
}
export const tipoDaMidia = (mime: string): MidiaAgente["tipo"] | null => mime.startsWith("video/") ? "video" : mime.startsWith("image/") ? "foto" : null
