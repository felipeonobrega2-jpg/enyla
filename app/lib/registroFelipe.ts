// Registro único do que o Felipe decide e conversa (tabela registro_felipe): WhatsApp (o que ele digita no celular),
// GitHub (issues e comentários dele), diretoria (o que ele diz aos diretores e o que os diretores citam dele).
// Só leitura do que já existe + registro. Nada é enviado a cliente, nada é apagado. Sem tabela (SQL não rodado),
// tudo falha em silêncio e o sistema segue como antes.
import { supabase } from "./supabase"

export type FonteRegistro = "whatsapp" | "github" | "diretoria" | "video"
export type TipoRegistro = "mensagem" | "decisao" | "promessa" | "ordem"
export type LinhaRegistro = { em: string; fonte: FonteRegistro; jid?: string | null; area?: string | null; tipo: TipoRegistro; texto: string; link?: string | null; ref_externa: string }

export const REPO = "felipeonobrega2-jpg/enyla"
export const LOGIN_FELIPE = "felipeonobrega2-jpg"
export const TAM_PAGINA = 30

// ---------- Filtros puros ----------

// Do Felipe = a conta dele SEM app. Os diretores usam a mesma conta, mas pelo app Cursor (performed_via_github_app).
export type ItemGithub = { id: number; number?: number; html_url?: string; body?: string | null; title?: string; created_at: string; updated_at?: string; user?: { login?: string } | null; performed_via_github_app?: { slug?: string } | null; pull_request?: unknown; issue_url?: string }
export const ehDoFelipeNoGithub = (i: ItemGithub) => i.user?.login === LOGIN_FELIPE && !i.performed_via_github_app

// Mensagem do celular do Felipe: from_me, id sem 3EB0 (envio do sistema) e que não está no registro do agente
export const ehDigitadaPeloFelipe = (m: { id: string; from_me: boolean; corpo?: string | null }, idsAgente: Set<string>) =>
  m.from_me && !!m.id && !/^3EB0/i.test(m.id) && !idsAgente.has(m.id) && !!m.corpo?.trim()

export const quatroDigitos = (jid: string) => (jid.split("@")[0].replace(/\D/g, "").slice(-4)) || "----"
const limpa = (t: string, n = 1500) => t.replace(/\s+\n/g, "\n").trim().slice(0, n)

export function linhasDoGithub(itens: ItemGithub[]): LinhaRegistro[] {
  const out: LinhaRegistro[] = []
  for (const i of itens) {
    if (!ehDoFelipeNoGithub(i)) continue
    const eComentario = !!i.issue_url
    const numero = eComentario ? Number(i.issue_url?.split("/").pop()) || 0 : i.number ?? 0
    const texto = limpa(eComentario ? (i.body ?? "") : `${i.title ?? ""}\n${i.body ?? ""}`)
    if (!texto) continue
    out.push({ em: i.created_at, fonte: "github", tipo: "mensagem", texto: `#${numero}: ${texto}`, link: i.html_url ?? null, ref_externa: `github:${eComentario ? "comentario" : "issue"}:${i.id}` })
  }
  return out
}

export function linhasDoWhatsapp(msgs: { id: string; jid: string; from_me: boolean; corpo?: string | null; ts: string }[], idsAgente: Set<string>): LinhaRegistro[] {
  return msgs.filter(m => ehDigitadaPeloFelipe(m, idsAgente)).map(m => ({ em: m.ts, fonte: "whatsapp" as const, jid: m.jid, tipo: "mensagem" as const, texto: limpa(m.corpo ?? ""), ref_externa: `whatsapp:${m.id}` }))
}

// Sem repetir ref_externa dentro do mesmo lote (o banco também barra: unique)
export const semRepetidos = (ls: LinhaRegistro[]) => [...new Map(ls.map(l => [l.ref_externa, l])).values()]

// Página sem cortar item: cada página tem TAM itens inteiros; "proxima" é null na última
export function paginar<T>(itens: T[], pagina: number, tam = TAM_PAGINA): { itens: T[]; pagina: number; total: number; paginas: number; proxima: number | null } {
  const paginas = Math.max(1, Math.ceil(itens.length / tam))
  const p = Math.min(Math.max(1, Math.floor(pagina) || 1), paginas)
  return { itens: itens.slice((p - 1) * tam, p * tam), pagina: p, total: itens.length, paginas, proxima: p < paginas ? p + 1 : null }
}

// ---------- Banco ----------

export async function gravarLinhas(ls: LinhaRegistro[]): Promise<number> {
  const linhas = semRepetidos(ls)
  if (!linhas.length) return 0
  const { data, error } = await supabase.from("registro_felipe").upsert(linhas.map(l => ({ ...l, jid: l.jid ?? null, area: l.area ?? null, link: l.link ?? null })), { onConflict: "ref_externa", ignoreDuplicates: true }).select("id")
  return error ? 0 : (data ?? []).length
}

type Linha = LinhaRegistro & { id: number }
export async function lerRegistro(f: { desde?: string; fonte?: string; area?: string; tipos?: TipoRegistro[]; jid?: string; limite?: number }): Promise<Linha[]> {
  let q = supabase.from("registro_felipe").select("id, em, fonte, jid, area, tipo, texto, link, ref_externa").order("em", { ascending: false }).limit(f.limite ?? 1000)
  if (f.desde) q = q.gte("em", f.desde)
  if (f.fonte) q = q.eq("fonte", f.fonte)
  if (f.area) q = q.eq("area", f.area)
  if (f.tipos) q = q.in("tipo", f.tipos)
  if (f.jid) q = q.eq("jid", f.jid)
  const { data, error } = await q
  return error ? [] : (data ?? []) as Linha[]
}

// Saída da porta: sem telefone completo (só os 4 últimos dígitos) e sem a chave de deduplicação
export const paraSaida = (l: Linha) => ({ em: l.em, fonte: l.fonte, tipo: l.tipo, ...(l.area ? { area: l.area } : {}), ...(l.jid ? { lead: `…${quatroDigitos(l.jid)}` } : {}), texto: l.texto.replace(/\+?\d[\d\s().-]{8,}\d/g, m => `…${m.replace(/\D/g, "").slice(-4)}`), ...(l.link ? { link: l.link } : {}) })

export async function lerDecisoes(p: { desde?: string; fonte?: string; area?: string; pagina?: number; jid?: string }) {
  if (p.jid) {
    const [resumos, dele] = await Promise.all([lerRegistro({ jid: p.jid, tipos: ["promessa", "decisao"], limite: 5 }), lerRegistro({ jid: p.jid, tipos: ["mensagem"], limite: 15 })])
    return { lead: `…${quatroDigitos(p.jid)}`, resumo: resumos.map(paraSaida), ultimasMensagensDoFelipe: dele.map(paraSaida) }
  }
  const ls = await lerRegistro({ desde: p.desde, fonte: p.fonte, area: p.area })
  const pg = paginar(ls, p.pagina ?? 1)
  return { ...pg, itens: pg.itens.map(paraSaida) }
}

export async function decisoesRecentesDoFelipe(dias = 7) {
  const ls = await lerRegistro({ desde: new Date(Date.now() - dias * 86_400_000).toISOString(), tipos: ["decisao"], limite: 100 })
  return ls.map(paraSaida)
}

export const AJUDA_DECISOES = "Registro único do que o Felipe decidiu e conversou (WhatsApp que ele digita no celular, GitHub, conversas com os diretores). GET ?o=decisoes&desde=AAAA-MM-DD&fonte=whatsapp|github|diretoria|video&area=&pagina= (mais novos primeiro, 30 itens inteiros por página; proxima é null na última). GET ?o=decisoes&jid= devolve o resumo do lead (promessas e decisões do Felipe) e as últimas mensagens dele naquele lead. Sem telefone completo (só os 4 últimos dígitos). Só leitura. Ao citar palavras do Felipe, use guardar_conhecimento com marca:'decisao_felipe' (ou relatar com marca:'decisao_felipe') para entrar neste registro"

// ---------- Captura ----------

// Diretoria: o que o Felipe escreve a um diretor, e o que um diretor cita dele (marca decisao_felipe)
export async function registrarDiretoria(p: { diretor: string; de: "felipe" | "diretor"; texto: string; em: string; id: string; marca?: unknown; tipo?: TipoRegistro; area?: string }): Promise<void> {
  if (p.de === "diretor" && p.marca !== "decisao_felipe") return
  await gravarLinhas([{ em: p.em, fonte: "diretoria", area: p.area ?? p.diretor, tipo: p.de === "felipe" ? "ordem" : (p.tipo ?? "decisao"), texto: limpa(p.texto), ref_externa: `diretoria:${p.diretor}:${p.id}` }]).catch(() => 0)
}

// WhatsApp: o que o Felipe digitou no celular desde a última rodada (só lê o banco). Devolve os jids com mensagem nova.
export async function capturarWhatsapp(desde: string): Promise<{ gravadas: number; jids: string[] }> {
  const { data } = await supabase.from("whatsapp_mensagens").select("id, jid, from_me, corpo, ts").eq("from_me", true).not("jid", "like", "%@g.us").gt("ts", desde).order("ts", { ascending: true }).limit(500)
  const { lerIdsAgente } = await import("./registroAgente")
  const ids = new Set(await lerIdsAgente().catch(() => null) ?? [])
  const linhas = linhasDoWhatsapp((data ?? []) as never, ids)
  const gravadas = await gravarLinhas(linhas)
  return { gravadas, jids: [...new Set(linhas.map(l => l.jid!))] }
}

// GitHub (API pública, sem segredo; 60 chamadas/h sem token: no máximo 2 por rodada)
export async function capturarGithub(desde: string, buscar: typeof fetch = fetch): Promise<{ gravadas: number; chamadas: number }> {
  const url = (p: string) => `https://api.github.com/repos/${REPO}/${p}?since=${encodeURIComponent(desde)}&per_page=100&sort=created&direction=desc`
  const h = { Accept: "application/vnd.github+json", "User-Agent": "enyla-registro" }
  const itens: ItemGithub[] = []
  let chamadas = 0
  for (const p of ["issues", "issues/comments"]) {
    chamadas++
    const r = await buscar(url(p), { headers: h }).catch(() => null)
    if (!r?.ok) continue
    const j = await r.json().catch(() => []) as ItemGithub[]
    // issues traz PRs também; só entra o que o Felipe criou depois do "desde" (o since da API olha a atualização)
    itens.push(...j.filter(i => !i.pull_request && i.created_at > desde))
  }
  return { gravadas: await gravarLinhas(linhasDoGithub(itens)), chamadas }
}

// Resumo por lead (IA só com mensagem nova do Felipe naquele jid; uma chamada por lead, no máximo MAX_LEADS por rodada)
const MAX_LEADS = 3
export async function resumirLeads(jids: string[], apiKey: string): Promise<number> {
  if (!apiKey) return 0
  const { clienteClaude, MODELO } = await import("./claude")
  const cli = clienteClaude(apiKey, "registro-felipe")
  let feitos = 0
  for (const jid of jids.slice(0, MAX_LEADS)) {
    const { data } = await supabase.from("whatsapp_mensagens").select("from_me, corpo, ts").eq("jid", jid).order("ts", { ascending: false }).limit(40)
    const conversa = (data ?? []).reverse().filter(m => m.corpo?.trim()).map(m => `${m.from_me ? "FELIPE" : "LEAD"}: ${String(m.corpo).slice(0, 400)}`).join("\n")
    if (!conversa) continue
    try {
      const r = await cli.messages.create({ model: MODELO, max_tokens: 400, messages: [{ role: "user", content: `Conversa de WhatsApp entre o Felipe (gráfica de embalagens) e um lead. Resuma SÓ o que o Felipe prometeu ou decidiu: promessas com data, preço citado, próximo passo. Máximo 4 linhas curtas. Se ele não prometeu nem decidiu nada, responda exatamente: NADA.\n\n${conversa}` }] })
      const t = r.content.map(b => b.type === "text" ? b.text : "").join("").trim()
      if (!t || /^NADA\b/i.test(t)) continue
      const em = new Date().toISOString()
      // ref por jid + hora da última mensagem dele: sem mensagem nova, não repete (nem gasta IA de novo)
      await gravarLinhas([{ em, fonte: "whatsapp", jid, tipo: /prometeu|até|dia \d|amanhã|enviar|mand/i.test(t) ? "promessa" : "decisao", texto: limpa(t, 800), ref_externa: `resumo:${jid}:${data?.[0]?.ts ?? em}` }])
      feitos++
    } catch { /* tenta na próxima rodada com mensagem nova */ }
  }
  return feitos
}

// Rotina (vigia, a cada 5 min): WhatsApp sempre; GitHub no máximo a cada 15 min. Marca "desde" na configuração.
export async function rotinaRegistroFelipe(): Promise<string> {
  const { lerCampos, mudarConfig } = await import("./configAtomica")
  const cfg = await lerCampos<{ registroFelipe?: { whatsapp?: string; github?: string }; apiKey?: string }>(["registroFelipe", "apiKey"])
  const agora = new Date()
  const marca = cfg.registroFelipe ?? {}
  const novo = { ...marca }
  const { error } = await supabase.from("registro_felipe").select("id").limit(1)
  if (error) return "tabela registro_felipe ainda não existe"
  const wDesde = marca.whatsapp ?? new Date(agora.getTime() - 3_600_000).toISOString()
  const w = await capturarWhatsapp(wDesde)
  novo.whatsapp = agora.toISOString()
  let g = "github: aguardando 15 min"
  if (!marca.github || agora.getTime() - new Date(marca.github).getTime() >= 15 * 60_000) {
    const r = await capturarGithub(marca.github ?? new Date(agora.getTime() - 3_600_000).toISOString())
    novo.github = agora.toISOString()
    g = `github ${r.gravadas}`
  }
  const resumos = w.gravadas ? await resumirLeads(w.jids, cfg.apiKey ?? "").catch(() => 0) : 0
  await mudarConfig(() => ({ registroFelipe: novo }))
  return `whatsapp ${w.gravadas}, ${g}, resumos ${resumos}`
}
