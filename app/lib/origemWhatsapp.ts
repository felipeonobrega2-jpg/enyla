// De onde veio cada conversa do WhatsApp, pela primeira mensagem do cliente:
//   anúncios de WhatsApp da Meta mandam uma frase pronta ("Olá, Gostaria se saber mais sobre as caixinhas.")
//   o botão do site manda outra ("Olá, gostaria de solicitar um orçamento.")
// A mesma frase pode estar em várias campanhas: vale a que mais gerou conversas naquele dia (marcada como provável
// quando havia mais de uma no ar). Só roda no servidor.

export type Entrada = { frase: string; canal: "anuncio" | "site" | "instagram" }

// Frases de entrada conhecidas (achadas nos anúncios da conta e no link do site em 02/11/2026)
export const ENTRADAS_PADRAO: Entrada[] = [
  { frase: "gostaria se saber mais sobre as caixinhas", canal: "anuncio" },
  { frase: "posso encomendar", canal: "anuncio" },
  { frase: "gostaria de solicitar um orcamento", canal: "site" },
]

export type OrigemConversa = { canal: Entrada["canal"]; campanhaId?: string; campanhaNome?: string; provavel?: boolean }

export const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim()

// Primeira mensagem do cliente → entrada (só se a frase estiver no começo da mensagem)
export function entradaDaMensagem(texto: string | null | undefined, entradas = ENTRADAS_PADRAO): Entrada | null {
  const t = normalizar(texto ?? "")
  if (!t) return null
  return entradas.find(e => t.startsWith(normalizar(e.frase)) || t.replace(/^(ola|oi|bom dia|boa tarde|boa noite) /, "").startsWith(normalizar(e.frase))) ?? null
}

// Campanha mais provável num dia: entre as candidatas (que têm a frase), a que mais gerou conversas naquele dia
export function campanhaDoDia(dia: string, candidatas: string[], conversasPorDia: Map<string, Map<string, number>>, nomes: Map<string, string>) {
  const doDia = conversasPorDia.get(dia)
  const ativas = candidatas.filter(c => (doDia?.get(c) ?? 0) > 0).sort((a, b) => (doDia!.get(b) ?? 0) - (doDia!.get(a) ?? 0))
  if (!ativas.length) return null
  return { campanhaId: ativas[0], campanhaNome: nomes.get(ativas[0]) ?? ativas[0], provavel: ativas.length > 1 }
}

export const lerOrigem = (campo: string | null | undefined): OrigemConversa | null => {
  if (!campo) return null
  try { const o = JSON.parse(campo); return o?.canal ? o : null } catch { return null }
}
