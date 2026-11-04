// Cliente da API da Pluggy (Open Finance). Só roda no servidor.
// Chaves na Vercel: PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET. A chave de acesso (apiKey) vale ~2 h e é reaproveitada.

const BASE = "https://api.pluggy.ai"
let cache: { chave: string; ate: number } | null = null

export const pluggyConfigurada = () => !!(process.env.PLUGGY_CLIENT_ID && process.env.PLUGGY_CLIENT_SECRET)

async function chaveAcesso(): Promise<string | null> {
  if (cache && cache.ate > Date.now()) return cache.chave
  const r = await fetch(`${BASE}/auth`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId: process.env.PLUGGY_CLIENT_ID, clientSecret: process.env.PLUGGY_CLIENT_SECRET }),
  }).catch(() => null)
  const j = r?.ok ? await r.json().catch(() => null) as { apiKey?: string } | null : null
  if (!j?.apiKey) return null
  cache = { chave: j.apiKey, ate: Date.now() + 100 * 60_000 }
  return j.apiKey
}

export async function pluggy<T>(caminho: string): Promise<{ ok: boolean; dados: T | null; erro?: string }> {
  if (!pluggyConfigurada()) return { ok: false, dados: null, erro: "Pluggy não configurada (chaves na Vercel)." }
  const chave = await chaveAcesso()
  if (!chave) return { ok: false, dados: null, erro: "A Pluggy recusou as chaves. Confira PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET na Vercel." }
  const r = await fetch(BASE + caminho, { headers: { "X-API-KEY": chave, Accept: "application/json" } }).catch(() => null)
  if (!r) return { ok: false, dados: null, erro: "Sem conexão com a Pluggy." }
  const j = await r.json().catch(() => null) as (T & { message?: string }) | null
  if (!r.ok) { if (r.status === 401) cache = null; return { ok: false, dados: null, erro: j?.message ?? `Pluggy respondeu ${r.status}.` } }
  return { ok: true, dados: j }
}

export type ItemPluggy = { id: string; status: string; connector?: { name?: string }; lastUpdatedAt?: string; executionStatus?: string }
export type ContaPluggy = { id: string; type: "BANK" | "CREDIT"; subtype?: string; name?: string; number?: string; balance?: number; owner?: string; taxNumber?: string }

export const item = (id: string) => pluggy<ItemPluggy>(`/items/${encodeURIComponent(id)}`)
export const contas = (itemId: string) => pluggy<{ results: ContaPluggy[] }>(`/accounts?itemId=${encodeURIComponent(itemId)}`)

// Transações de uma conta a partir de uma data (paginação por cursor da v2)
export async function transacoes<T>(contaId: string, desde: string): Promise<{ ok: boolean; lista: T[]; erro?: string }> {
  const lista: T[] = []
  let caminho: string | null = `/v2/transactions?accountId=${encodeURIComponent(contaId)}&dateFrom=${desde}&from=${desde}`
  for (let paginas = 0; caminho && paginas < 40; paginas++) {
    const r: { ok: boolean; dados: { results?: T[]; next?: string | null } | null; erro?: string } = await pluggy<{ results?: T[]; next?: string | null }>(caminho)
    if (!r.ok) return { ok: false, lista, erro: r.erro }
    lista.push(...(r.dados?.results ?? []))
    caminho = r.dados?.next ? `/v2/transactions${r.dados.next.startsWith("?") ? "" : "?"}${r.dados.next}` : null
  }
  return { ok: true, lista }
}
