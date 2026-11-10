// Notificação no seu celular pelo ntfy (app "ntfy", tópico em NTFY_TOPICO na Vercel). Não depende do WhatsApp:
// chega mesmo com o número caído. Só o mínimo no texto (nada de nome ou telefone de cliente): o toque abre o sistema.
// Sem NTFY_TOPICO, não faz nada.

export type Prioridade = "urgente" | "alta" | "normal"
const PRIORIDADE: Record<Prioridade, number> = { urgente: 5, alta: 4, normal: 3 }
export const LINK_SISTEMA = "https://app.enyla.com.br"

export async function notificar(titulo: string, texto: string, opcoes: { prioridade?: Prioridade; link?: string; tags?: string[] } = {}) {
  const topico = process.env.NTFY_TOPICO?.trim()
  if (!topico) return false
  const r = await fetch("https://ntfy.sh/", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic: topico, title: titulo, message: texto, priority: PRIORIDADE[opcoes.prioridade ?? "normal"], click: opcoes.link ?? LINK_SISTEMA, tags: opcoes.tags }),
    signal: AbortSignal.timeout(8000),
  }).catch(() => null)
  return !!r?.ok
}
