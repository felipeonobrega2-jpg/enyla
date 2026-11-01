// Evolution API (WhatsApp na VPS): chamadas do servidor com a chave das variáveis de ambiente.
// Só roda no servidor; nada daqui devolve a chave para a tela.

const base = () => (process.env.EVOLUTION_API_URL ?? "").replace(/\/$/, "")
const instancia = () => encodeURIComponent(process.env.EVOLUTION_INSTANCE ?? "")

export async function evo<T = unknown>(caminho: string, init?: RequestInit): Promise<{ ok: boolean; status: number; corpo: T | null }> {
  if (!base() || !process.env.EVOLUTION_API_KEY) return { ok: false, status: 0, corpo: null }
  try {
    const r = await fetch(`${base()}${caminho.replace("{i}", instancia())}`, {
      ...init, headers: { apikey: process.env.EVOLUTION_API_KEY, "Content-Type": "application/json", ...init?.headers },
      signal: AbortSignal.timeout(8000),
    })
    return { ok: r.ok, status: r.status, corpo: await r.json().catch(() => null) as T | null }
  } catch {
    return { ok: false, status: 0, corpo: null }
  }
}

export type DiagnosticoEvolution = {
  configurado: boolean
  alcancavel: boolean
  autorizado: boolean
  conectado: boolean
  estado: string | null
  webhookOk: boolean
  webhookDestino: string | null   // só host + caminho, sem o token
  host: string | null
}

// Situação da integração: servidor no ar, chave aceita, número conectado e webhook apontando para cá
export async function diagnosticar(origem: string): Promise<DiagnosticoEvolution> {
  const configurado = !!(base() && process.env.EVOLUTION_API_KEY && process.env.EVOLUTION_INSTANCE)
  const host = base() ? new URL(base()).host : null
  if (!configurado) return { configurado, alcancavel: false, autorizado: false, conectado: false, estado: null, webhookOk: false, webhookDestino: null, host }
  const st = await evo<{ instance?: { state?: string } }>("/instance/connectionState/{i}")
  const estado = st.corpo?.instance?.state ?? null
  const wh = await evo<{ enabled?: boolean; url?: string; webhook?: { enabled?: boolean; url?: string } }>("/webhook/find/{i}")
  const w = wh.corpo?.webhook ?? wh.corpo
  let webhookDestino: string | null = null
  try { webhookDestino = w?.url ? `${new URL(w.url).host}${new URL(w.url).pathname}` : null } catch { webhookDestino = null }
  const esperado = `${new URL(origem).host}/api/whatsapp/webhook`
  return {
    configurado, host,
    alcancavel: st.status !== 0 && st.status !== 404,
    autorizado: st.status !== 401 && st.status !== 403 && st.status !== 0,
    conectado: estado === "open",
    estado,
    webhookOk: !!w?.enabled && webhookDestino === esperado && !!w?.url?.includes("token="),
    webhookDestino,
  }
}

// Aponta o webhook da instância para este sistema (mensagens novas e o histórico na conexão)
export async function configurarWebhook(origem: string) {
  const segredo = process.env.WHATSAPP_WEBHOOK_SECRET
  if (!segredo) return { ok: false, erro: "Falta WHATSAPP_WEBHOOK_SECRET na Vercel." }
  const url = `${origem}/api/whatsapp/webhook?token=${encodeURIComponent(segredo)}`
  const r = await evo("/webhook/set/{i}", {
    method: "POST",
    body: JSON.stringify({ webhook: { enabled: true, url, byEvents: false, base64: false, events: ["MESSAGES_UPSERT", "MESSAGES_SET"] } }),
  })
  return r.ok ? { ok: true } : { ok: false, erro: `O Evolution recusou (${r.status}).` }
}
