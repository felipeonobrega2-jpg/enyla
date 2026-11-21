// Gravação segura da configuração (AppConfig id 1, um JSON só). Várias tarefas gravam ao mesmo tempo (agente,
// conferência do Pix, follow-ups, a tela): ler tudo e regravar tudo fazia uma apagar a outra (o agente perdia o
// registro do que enviou e passava a achar que era você na conversa). Aqui cada gravação confere a versão (_v) que
// leu: se outra gravou no meio, lê de novo e reaplica a mudança.

import { supabase } from "./supabase"

type Dados = Record<string, unknown>
const pausa = (ms: number) => new Promise(r => setTimeout(r, ms))

// ── Coleções em tabela própria (Organizar 1, "gaveta única") ─────────────────
// Depois de migrada (o nome entra em _colecoes no AppConfig), a coleção mora na tabela dados_sistema, uma linha por
// item, com versão e histórico automático. Quem lê a configuração recebe a lista como antes; quem grava devolve a
// lista e aqui só os itens que mudaram são gravados (conferindo a versão de cada um). O resto do código não muda.
type Colecao = { id: (x: Dados) => string; ordem: (a: Dados, b: Dados) => number }
export const COLECOES: Record<string, Colecao> = {
  pedidosDigitais: { id: x => String(x.id), ordem: (a, b) => String(b.em ?? "").localeCompare(String(a.em ?? "")) },
}
type Foto = Map<string, { v: number; json: string }>
const migradas = (d: Dados) => ((d._colecoes as string[] | undefined) ?? []).filter(c => c in COLECOES)

async function lerColecao(col: string): Promise<{ itens: Dados[]; foto: Foto }> {
  const itens: Dados[] = [], foto: Foto = new Map()
  for (let i = 0; ; i += 1000) {
    const { data, error } = await supabase.from("dados_sistema").select("id, dados, v").eq("colecao", col).range(i, i + 999)
    if (error) throw new Error(`config/${col}: ${error.message}`)
    for (const r of data ?? []) { itens.push(r.dados as Dados); foto.set(r.id as string, { v: r.v as number, json: JSON.stringify(r.dados) }) }
    if (!data || data.length < 1000) break
  }
  return { itens: itens.sort(COLECOES[col].ordem), foto }
}
async function hidratar(d: Dados): Promise<{ d: Dados; fotos: Record<string, Foto> }> {
  const cols = migradas(d)
  if (!cols.length) return { d, fotos: {} }
  const lidas = await Promise.all(cols.map(lerColecao))
  const fotos: Record<string, Foto> = {}, h: Dados = { ...d }
  cols.forEach((c, i) => { h[c] = lidas[i].itens; fotos[c] = lidas[i].foto })
  return { d: h, fotos }
}
// Grava só o que mudou; false = outra gravação mexeu num desses itens no meio (refazer)
async function gravarColecao(col: string, novos: Dados[], foto: Foto): Promise<boolean> {
  const porId = new Map<string, Dados>()
  for (const x of novos ?? []) porId.set(COLECOES[col].id(x), x)
  for (const [id, x] of porId) {
    const antes = foto.get(id), json = JSON.stringify(x)
    if (!antes) {
      const { data, error } = await supabase.from("dados_sistema").upsert({ colecao: col, id, dados: x, v: 1 }, { onConflict: "colecao,id", ignoreDuplicates: true }).select("id")
      if (error) throw new Error(`config/${col}: ${error.message}`)
      if (!data?.length) return false
    } else if (antes.json !== json) {
      const { data, error } = await supabase.from("dados_sistema").update({ dados: x, v: antes.v + 1, atualizado_em: new Date().toISOString() }).eq("colecao", col).eq("id", id).eq("v", antes.v).select("id")
      if (error) throw new Error(`config/${col}: ${error.message}`)
      if (!data?.length) return false
    }
  }
  for (const [id, antes] of foto) if (!porId.has(id)) {
    const { data, error } = await supabase.from("dados_sistema").delete().eq("colecao", col).eq("id", id).eq("v", antes.v).select("id")
    if (error) throw new Error(`config/${col}: ${error.message}`)
    if (!data?.length) return false
  }
  return true
}

// Leitura completa da configuração, com as coleções migradas (mesmo formato do select direto: { data: { data } })
export async function lerConfigLinha(): Promise<{ data: { data: Dados } | null; error: { message: string } | null }> {
  const { data, error } = await supabase.from("AppConfig").select("data").eq("id", 1).maybeSingle()
  if (error || !data) return { data: null, error: error ? { message: error.message } : null }
  const { d } = await hidratar((data.data ?? {}) as Dados)
  return { data: { data: d }, error: null }
}
export const lerConfig = async <T extends Dados = Dados>() => ((await lerConfigLinha()).data?.data ?? {}) as T

// mudar recebe a configuração atual e devolve só os campos que mudam (null = nada a gravar)
export async function mudarConfig<T extends Dados = Dados>(mudar: (d: T) => Partial<T> | Dados | null, tentativas = 10): Promise<T> {
  for (let i = 0; ; i++) {
    const { data, error: erroLer } = await supabase.from("AppConfig").select("data").eq("id", 1).maybeSingle()
    if (erroLer) throw new Error(`config: ${erroLer.message}`)
    const bruto = (data?.data ?? {}) as Dados
    const { d: hidratado, fotos } = await hidratar(bruto)
    const d = hidratado as T
    const m = mudar(d) as Dados | null
    if (!m) return d
    // Coleções migradas: grava só os itens que mudaram, na tabela; o AppConfig não leva a lista
    const cols = migradas(bruto).filter(c => c in m)
    let conflito = false
    for (const c of cols) if (!(await gravarColecao(c, m[c] as Dados[], fotos[c]))) { conflito = true; break }
    const resto = Object.fromEntries(Object.entries(m).filter(([k]) => !cols.includes(k)))
    if (!conflito && !Object.keys(resto).length) return { ...d, ...m } as T
    const v = typeof bruto._v === "number" ? bruto._v : null
    const novo = { ...bruto, ...resto, _v: (v ?? 0) + 1 } as unknown as T
    if (conflito) { /* outra gravação mexeu num item: refaz com a versão nova */ }
    else if (!data) {   // ainda não existe (banco novo)
      const { error } = await supabase.from("AppConfig").insert({ id: 1, data: novo })
      if (!error) return novo
    } else {
      const q = supabase.from("AppConfig").update({ data: novo }).eq("id", 1)
      const { data: ok, error } = await (v == null ? q.is("data->_v", null) : q.eq("data->>_v", String(v))).select("id")
      if (error) throw new Error(`config: ${error.message}`)
      if (ok?.length) return { ...novo, ...Object.fromEntries(cols.map(c => [c, m[c]])) } as T
    }
    if (i + 1 >= tentativas) throw new Error("config: muitas gravações ao mesmo tempo")
    await pausa(40 + Math.random() * 120 * (i + 1))
  }
}

// Atalho: grava estes campos por cima (sem depender do que está salvo)
export const gravarCampos = (campos: Dados) => mudarConfig(() => campos)

// Lê só estes campos do AppConfig (o registro inteiro tem 600 KB: lido a cada minuto por tela aberta, estourou a
// cota de tráfego do Supabase em 19/11). Use nas rotas chamadas com frequência.
export async function lerCampos<T extends Dados = Dados>(campos: string[]): Promise<T> {
  const { data, error } = await supabase.from("AppConfig").select([...campos, "_colecoes"].map(c => `${c}:data->${c}`).join(", ")).eq("id", 1).maybeSingle()
  if (error) throw new Error(`config: ${error.message}`)
  const d = Object.fromEntries(Object.entries((data ?? {}) as Record<string, unknown>).filter(([, v]) => v != null)) as Dados
  // Coleção migrada pedida: vem da tabela
  for (const c of migradas(d).filter(c => campos.includes(c))) d[c] = (await lerColecao(c)).itens
  delete d._colecoes
  return d as T
}

// Migra uma coleção do AppConfig para a tabela (uma vez): copia os itens, marca em _colecoes e tira a lista do JSON.
// Seguro para repetir. Devolve quantos itens foram para a tabela.
export async function migrarColecao(col: string): Promise<{ itens: number; ja?: boolean }> {
  if (!(col in COLECOES)) throw new Error(`coleção desconhecida: ${col}`)
  let itens = 0, ja = false
  for (let i = 0; i < 10; i++) {
    const { data } = await supabase.from("AppConfig").select("data").eq("id", 1).single()
    const bruto = (data!.data ?? {}) as Dados
    if (migradas(bruto).includes(col)) { ja = true; break }
    const lista = (bruto[col] as Dados[] | undefined) ?? []
    for (let k = 0; k < lista.length; k += 200) {
      const lote = lista.slice(k, k + 200).map(x => ({ colecao: col, id: COLECOES[col].id(x), dados: x, v: 1 }))
      const porId = new Map(lote.map(l => [l.id, l]))   // id repetido na lista antiga: fica o primeiro (o mais novo)
      const { error } = await supabase.from("dados_sistema").upsert([...porId.values()], { onConflict: "colecao,id", ignoreDuplicates: true })
      if (error) throw new Error(`migrar ${col}: ${error.message}`)
    }
    itens = lista.length
    const v = typeof bruto._v === "number" ? bruto._v : null
    const novo: Dados = { ...bruto, _colecoes: [...((bruto._colecoes as string[]) ?? []), col], _v: (v ?? 0) + 1 }
    delete novo[col]
    const q = supabase.from("AppConfig").update({ data: novo }).eq("id", 1)
    const { data: ok } = await (v == null ? q.is("data->_v", null) : q.eq("data->>_v", String(v))).select("id")
    if (ok?.length) break
    await pausa(100 + Math.random() * 200)
  }
  return { itens, ...(ja ? { ja } : {}) }
}
