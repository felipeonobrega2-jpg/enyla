// Porta externa: o diretor abre um pedido ao Claude Code (issue no GitHub com @claude) e lê a resposta.
// fetch puro, sem dependência. O token (GITHUB_DIRETORES_TOKEN) nunca é registrado nem devolvido.
// Registro: dados_sistema, coleção pedidoClaude, uma linha por pedido (id = número da issue). Nada é apagado.
import { DIRETORES, type IdDiretor } from "./diretoria"
import { supabase } from "./supabase"

export const COLECAO_PEDIDO_CLAUDE = "pedidoClaude"
export const LIMITE_DIA = 20
const REPO = "felipeonobrega2-jpg/enyla"
const API = `https://api.github.com/repos/${REPO}`
const MAX_PERGUNTA = 4000
const MAX_CONTEXTO = 8000
export type Resultado = { status: number; corpo: Record<string, unknown> }
type Registro = { id: number; url: string; diretor: IdDiretor; tipo: string; em: string; dia: string }

export const ERRO_SEM_TOKEN = "Canal do Claude Code ainda não ligado: falta GITHUB_DIRETORES_TOKEN na Vercel (Production). O Felipe precisa criar o token."

export const REGRAS = `Regras para o Claude Code neste pedido de diretor:
- \`consulta\`: responda só comentando nesta issue, em português do Brasil e em linguagem simples. Não altere código, banco nem configuração.
- \`construcao\`: um PR pequeno e focado, que só é juntado com o CI e o preview da Vercel verdes. Explique no PR o que muda e como conferir.
- Nunca, sem o Aprovo explícito do Felipe: mandar mensagem a cliente ou lead, mexer em cobrança ou pagamento, apagar dados, criar, ler, trocar ou expor chaves e segredos. Se o pedido precisar disso, pare e comente aqui o que falta para o Felipe aprovar.
- Não leia nem escreva valores de variáveis de ambiente.`

const diaSP = (d = new Date()) => d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
const dataHoraSP = (d = new Date()) => d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })

function cabecalhos(token: string) {
  return { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "enyla-porta-externa", "Content-Type": "application/json" }
}
async function gh(token: string, caminho: string, init?: RequestInit): Promise<{ status: number; json: unknown }> {
  const r = await fetch(`${API}${caminho}`, { ...init, headers: cabecalhos(token), cache: "no-store" })
  return { status: r.status, json: await r.json().catch(() => null) }
}

async function registrosDe(diretor: IdDiretor): Promise<Registro[]> {
  const { data } = await supabase.from("dados_sistema").select("dados").eq("colecao", COLECAO_PEDIDO_CLAUDE).limit(5000)
  return (data ?? []).map(r => r.dados as Registro).filter(r => r && r.diretor === diretor)
}
const usadosHoje = async (diretor: IdDiretor) => (await registrosDe(diretor)).filter(r => r.dia === diaSP()).length

// POST { acao:'perguntar_claude', pergunta, contexto?, tipo }
export async function perguntarClaude(diretor: IdDiretor, b: Record<string, unknown>): Promise<Resultado> {
  const pergunta = typeof b.pergunta === "string" ? b.pergunta.trim() : ""
  if (!pergunta) return { status: 400, corpo: { erro: "pergunta: obrigatória (texto)." } }
  if (pergunta.length > MAX_PERGUNTA) return { status: 400, corpo: { erro: `pergunta: no máximo ${MAX_PERGUNTA} caracteres.` } }
  if (b.contexto != null && typeof b.contexto !== "string") return { status: 400, corpo: { erro: "contexto: texto." } }
  const contexto = typeof b.contexto === "string" ? b.contexto.trim() : ""
  if (contexto.length > MAX_CONTEXTO) return { status: 400, corpo: { erro: `contexto: no máximo ${MAX_CONTEXTO} caracteres.` } }
  if (b.tipo !== "consulta" && b.tipo !== "construcao") return { status: 400, corpo: { erro: "tipo: 'consulta' ou 'construcao'." } }
  const token = process.env.GITHUB_DIRETORES_TOKEN
  if (!token) return { status: 503, corpo: { erro: ERRO_SEM_TOKEN } }
  if (await usadosHoje(diretor) >= LIMITE_DIA) return { status: 429, corpo: { erro: `Limite de ${LIMITE_DIA} pedidos ao Claude Code por dia (horário de São Paulo). Nada foi criado.` } }

  const info = DIRETORES.find(d => d.id === diretor)!
  const agora = new Date()
  const titulo = `[Diretor ${info.nome}] ${pergunta.replace(/\s+/g, " ").slice(0, 80)}`
  const corpo = `@claude

**Pedido de:** ${info.nome}, ${info.cargo} (${diretor})
**Em:** ${dataHoraSP(agora)} (America/Sao_Paulo)
**Tipo:** ${b.tipo}

### Pergunta
${pergunta}
${contexto ? `\n### Contexto\n${contexto}\n` : ""}
---
${REGRAS}
`
  let r: { status: number; json: unknown }
  try { r = await gh(token, "/issues", { method: "POST", body: JSON.stringify({ title: titulo, body: corpo, labels: [`diretor:${diretor}`, `tipo:${b.tipo}`] }) }) }
  catch { return { status: 502, corpo: { erro: "Não consegui falar com o GitHub." } } }
  const j = r.json as { number?: number; html_url?: string } | null
  if (r.status !== 201 || !j?.number || !j.html_url) return { status: 502, corpo: { erro: `O GitHub recusou o pedido (status ${r.status}).`, statusGithub: r.status } }

  const reg: Registro = { id: j.number, url: j.html_url, diretor, tipo: b.tipo, em: agora.toISOString(), dia: diaSP(agora) }
  await supabase.from("dados_sistema").insert({ colecao: COLECAO_PEDIDO_CLAUDE, id: String(j.number), dados: reg, v: 1, atualizado_em: reg.em })
  return { status: 200, corpo: { ok: true, id: j.number, url: j.html_url, resultado: `Pedido ao Claude Code aberto (${b.tipo}): ${j.html_url}` } }
}

type Rotulo = string | { name?: string }
type IssueGh = { number: number; html_url: string; title: string; state: string; created_at: string; comments: number; labels: Rotulo[]; pull_request?: unknown }
const nomes = (i: IssueGh) => i.labels.map(l => typeof l === "string" ? l : l.name ?? "")
const tipoDe = (i: IssueGh) => nomes(i).find(n => n.startsWith("tipo:"))?.slice(5) ?? null
const estado = (i: IssueGh) => i.state === "open" ? "aberta" : "fechada"

// GET ?o=claude  e  ?o=claude&id=<n>
export async function lerPedidosClaude(diretor: IdDiretor, idTxt: string | null): Promise<Resultado> {
  const token = process.env.GITHUB_DIRETORES_TOKEN
  if (!token) return { status: 503, corpo: { erro: ERRO_SEM_TOKEN } }
  try {
    if (idTxt == null) {
      const [r, usados] = await Promise.all([gh(token, `/issues?labels=${encodeURIComponent(`diretor:${diretor}`)}&state=all&sort=created&direction=desc&per_page=10`), usadosHoje(diretor)])
      if (r.status !== 200 || !Array.isArray(r.json)) return { status: 502, corpo: { erro: `O GitHub recusou a leitura (status ${r.status}).`, statusGithub: r.status } }
      const pedidos = (r.json as IssueGh[]).filter(i => !i.pull_request).map(i => ({ id: i.number, url: i.html_url, titulo: i.title, estado: estado(i), tipo: tipoDe(i), criadaEm: i.created_at, comentarios: i.comments }))
      return { status: 200, corpo: { pedidos, usadosHoje: usados, limiteDia: LIMITE_DIA } }
    }
    const n = Number(idTxt)
    if (!Number.isInteger(n) || n <= 0) return { status: 400, corpo: { erro: "id: número da issue." } }
    const naoAchou = { status: 404, corpo: { erro: `Pedido ${n} não encontrado entre os seus.` } }
    const ri = await gh(token, `/issues/${n}`)
    if (ri.status === 404) return naoAchou
    if (ri.status !== 200 || !ri.json) return { status: 502, corpo: { erro: `O GitHub recusou a leitura (status ${ri.status}).`, statusGithub: ri.status } }
    const i = ri.json as IssueGh
    const rotulos = nomes(i)
    const meu = diretor === "cto" ? rotulos.some(x => x.startsWith("diretor:")) : rotulos.includes(`diretor:${diretor}`)
    if (i.pull_request || !meu) return naoAchou
    const [rc, rt] = await Promise.all([gh(token, `/issues/${n}/comments?per_page=100`), gh(token, `/issues/${n}/timeline?per_page=100`).catch(() => ({ status: 0, json: null }))])
    type Com = { body?: string; created_at: string; user?: { login?: string; type?: string } }
    const claude = (u?: Com["user"]) => !!u && (u.type === "Bot" || u.login === "claude[bot]" || u.login === "github-actions[bot]")
    const comentarios = (Array.isArray(rc.json) ? rc.json as Com[] : []).filter(x => claude(x.user)).map(x => ({ autor: x.user?.login ?? "claude[bot]", em: x.created_at, texto: x.body ?? "" }))
    type Ev = { event?: string; source?: { issue?: { number: number; html_url: string; state: string; pull_request?: unknown } } }
    const prs = new Map<number, { numero: number; url: string; estado: string }>()
    for (const e of Array.isArray(rt.json) ? rt.json as Ev[] : []) {
      const s = e.event === "cross-referenced" ? e.source?.issue : undefined
      if (s?.pull_request) prs.set(s.number, { numero: s.number, url: s.html_url, estado: s.state })
    }
    return { status: 200, corpo: { id: i.number, url: i.html_url, titulo: i.title, estado: estado(i), criadaEm: i.created_at, comentarios, prs: [...prs.values()] } }
  } catch { return { status: 502, corpo: { erro: "Não consegui falar com o GitHub." } } }
}
