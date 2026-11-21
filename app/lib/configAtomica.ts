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
// Três formatos: lista de objetos (cada um com um id), mapa "chave → valor" (ex.: contato → memória do agente) e
// conjunto de marcas (lista de textos, a mais nova primeiro: "já tentei esta mensagem").
type Linhas = Map<string, unknown>
type Colecao = { paraLinhas: (v: unknown) => Linhas; deLinhas: (l: { id: string; dados: unknown }[]) => unknown; soPresenca?: boolean }
const lista = (id: (x: Dados) => string, ordem?: (a: Dados, b: Dados) => number): Colecao => ({
  paraLinhas: v => new Map(((v as Dados[] | undefined) ?? []).filter(x => x && typeof x === "object").map(x => [id(x), x] as [string, unknown]).reverse()),   // id repetido: fica o primeiro (o mais novo)
  deLinhas: l => { const xs = l.map(r => r.dados as Dados); return ordem ? xs.sort(ordem) : xs },
})
const mapa: Colecao = {
  paraLinhas: v => new Map(Object.entries((v as Dados | undefined) ?? {})),
  deLinhas: l => Object.fromEntries(l.map(r => [r.id, r.dados])),
}
// Conjunto: guarda a ordem de chegada (número decrescente = mais novo primeiro); item que já existe não é regravado
const conjunto: Colecao = {
  paraLinhas: v => { const xs = ((v as string[] | undefined) ?? []).filter(x => typeof x === "string"); const agora = Date.now(); return new Map(xs.map((x, i) => [x, agora - i] as [string, unknown]).reverse()) },
  deLinhas: l => [...l].sort((a, b) => Number(b.dados) - Number(a.dados)).map(r => r.id),
  soPresenca: true,
}
const porEm = (a: Dados, b: Dados) => String(b.em ?? b.criadaEm ?? b.dia ?? "").localeCompare(String(a.em ?? a.criadaEm ?? a.dia ?? ""))
export const COLECOES: Record<string, Colecao> = {
  pedidosDigitais: lista(x => String(x.id), porEm),
  conhecimentoAgente: lista(x => String(x.id)),
  propostasProntas: lista(x => String(x.id), porEm),
  ideias: lista(x => String(x.id), porEm),
  marketingRelatorios: lista(x => String(x.dia ?? x.semana ?? JSON.stringify(x).slice(0, 60)), porEm),
  fechadasPelaIA: lista(x => `${x.jid}|${x.em}`, porEm),
  licoesBanco: lista(x => String(x.id)),
  cadastrosParceiros: lista(x => String(x.id), porEm),
  agenteMarcos: mapa, apelidosWhatsapp: mapa, esperaAvisada: mapa, agenteFollowupTentados: mapa, proximosPassos: mapa,
  mqlEsperandoAvisado: mapa, visitasProposta: mapa, propostaLidaEm: mapa,
  agenteRetomadas: conjunto, vigiaTentou: conjunto, vigiaTentouV2: conjunto, vigiaTentouV3: conjunto,
}
type Foto = Map<string, { v: number; json: string }>
const migradas = (d: Dados) => ((d._colecoes as string[] | undefined) ?? []).filter(c => c in COLECOES)

// Leitura guardada por 2 s na mesma execução (o agente lê a configuração várias vezes numa resposta). Seguro: a
// gravação confere a versão de cada item e refaz se outra mexeu; e quem grava limpa o guardado daquela coleção.
const guardado = new Map<string, { em: number; valor: unknown; foto: Foto }>()
async function lerColecao(col: string, fresco = false): Promise<{ valor: unknown; foto: Foto }> {
  const g = guardado.get(col)
  if (!fresco && g && Date.now() - g.em < 2000) return { valor: structuredClone(g.valor), foto: g.foto }
  const r = await lerColecaoDoBanco(col)
  guardado.set(col, { em: Date.now(), valor: r.valor, foto: r.foto })
  return { valor: structuredClone(r.valor), foto: r.foto }
}
async function lerColecaoDoBanco(col: string): Promise<{ valor: unknown; foto: Foto }> {
  const linhas: { id: string; dados: unknown }[] = [], foto: Foto = new Map()
  for (let i = 0; ; i += 1000) {
    const { data, error } = await supabase.from("dados_sistema").select("id, dados, v").eq("colecao", col).range(i, i + 999)
    if (error) throw new Error(`config/${col}: ${error.message}`)
    for (const r of data ?? []) { linhas.push({ id: r.id as string, dados: r.dados }); foto.set(r.id as string, { v: r.v as number, json: JSON.stringify(r.dados) }) }
    if (!data || data.length < 1000) break
  }
  return { valor: COLECOES[col].deLinhas(linhas), foto }
}
async function hidratar(d: Dados, fresco = false): Promise<{ d: Dados; fotos: Record<string, Foto> }> {
  const cols = migradas(d)
  if (!cols.length) return { d, fotos: {} }
  const lidas = await Promise.all(cols.map(c => lerColecao(c, fresco)))
  const fotos: Record<string, Foto> = {}, h: Dados = { ...d }
  cols.forEach((c, i) => { h[c] = lidas[i].valor; fotos[c] = lidas[i].foto })
  return { d: h, fotos }
}
// Grava só o que mudou; false = outra gravação mexeu num desses itens no meio (refazer)
async function gravarColecao(col: string, valor: unknown, foto: Foto): Promise<boolean> {
  guardado.delete(col)
  const def = COLECOES[col]
  const porId = def.paraLinhas(valor)
  const novos: { colecao: string; id: string; dados: unknown; v: number }[] = []
  for (const [id, x] of porId) {
    const antes = foto.get(id)
    if (!antes) { novos.push({ colecao: col, id, dados: x, v: 1 }); continue }
    if (def.soPresenca) continue
    if (antes.json !== JSON.stringify(x)) {
      const { data, error } = await supabase.from("dados_sistema").update({ dados: x, v: antes.v + 1, atualizado_em: new Date().toISOString() }).eq("colecao", col).eq("id", id).eq("v", antes.v).select("id")
      if (error) throw new Error(`config/${col}: ${error.message}`)
      if (!data?.length) return false
    }
  }
  if (novos.length) {
    const { data, error } = await supabase.from("dados_sistema").upsert(novos, { onConflict: "colecao,id", ignoreDuplicates: true }).select("id")
    if (error) throw new Error(`config/${col}: ${error.message}`)
    if ((data?.length ?? 0) < novos.length) return false
  }
  const sair = [...foto.keys()].filter(id => !porId.has(id))
  for (const id of sair) {
    const { data, error } = await supabase.from("dados_sistema").delete().eq("colecao", col).eq("id", id).eq("v", foto.get(id)!.v).select("id")
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
    const { d: hidratado, fotos } = await hidratar(bruto, i > 0)   // tentativa de novo: lê fresco
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
  for (const c of migradas(d).filter(c => campos.includes(c))) d[c] = (await lerColecao(c)).valor
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
    const linhas = [...COLECOES[col].paraLinhas(bruto[col]).entries()]
    for (let k = 0; k < linhas.length; k += 200) {
      const lote = linhas.slice(k, k + 200).map(([id, dados]) => ({ colecao: col, id, dados, v: 1 }))
      const { error } = await supabase.from("dados_sistema").upsert(lote, { onConflict: "colecao,id", ignoreDuplicates: true })
      if (error) throw new Error(`migrar ${col}: ${error.message}`)
    }
    itens = linhas.length
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
