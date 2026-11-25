// Importador do Prospector: lê o dump oficial da Receita (Estabelecimentos0..9.zip) em fluxo, sem baixar o arquivo inteiro
// para a memória, e grava na prospectos_parceiros. Só lê e grava dados; não envia e-mail, WhatsApp nem outra mensagem.
//
// Cursor (AppConfig, campo prospectorImportador): { mes, arquivo, offset }. offset = bytes já tratados do CSV descompactado
// do arquivo. Cada execução reabre o arquivo, descarta esses bytes e continua. Para ao atingir o teto de CNPJs ou o tempo.
import { createInflateRaw } from "node:zlib"
import { lerCampos, gravarCampos } from "./configAtomica"
import { supabase } from "./supabase"
import { candidatoDaLinha, decidirGravacao, montarProspecto, type Candidato, type CadastroBrasilApi, type Existente } from "./prospectorImportador"

// A Receita publica os dados abertos de CNPJ num compartilhamento público do Nextcloud:
// https://arquivos.receitafederal.gov.br/index.php/s/YggdBLfdninEJX9
// O token do compartilhamento é público (não é segredo); no WebDAV ele vai como usuário do Basic Auth, com senha vazia.
export const TOKEN_RECEITA = "YggdBLfdninEJX9"
export const BASE_RECEITA = "https://arquivos.receitafederal.gov.br/public.php/webdav"
export const AUTH_RECEITA = `Basic ${Buffer.from(`${TOKEN_RECEITA}:`).toString("base64")}`
export const BASE_BRASILAPI = "https://brasilapi.com.br/api/cnpj/v1"
export const ARQUIVOS = 10
export const MAX_CNPJS_POR_EXECUCAO = 400
export const ORCAMENTO_MS = 240_000   // maxDuration da rota é 300 s: sobra folga para gravar e responder
const TABELA = "prospectos_parceiros"
const CAMPO = "prospectorImportador"
const PARALELO = 5

export type Cursor = { mes: string; arquivo: number; offset: number; concluido?: boolean }
export type Resultado = {
  ok: boolean; ja?: boolean; erro?: string; lidos: number; inseridos: number; atualizados: number; ignorados: number; semCadastro: number; falhasCadastro: number
  cursor: Cursor | null
}
type Deps = { fetch?: typeof fetch; agora?: () => Date; orcamentoMs?: number; maxCnpjs?: number; pausaMs?: number }

const mesDe = (d: Date, delta = 0) => { const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 1)); return x.toISOString().slice(0, 7) }

/** Conteúdo (descompactado) do primeiro arquivo do .zip, em pedaços. Lê só o cabeçalho local; o fim vem do próprio deflate. */
async function* conteudoDoZip(corpo: ReadableStream<Uint8Array>): AsyncGenerator<Buffer> {
  const leitor = corpo.getReader()
  let cabeca = Buffer.alloc(0)
  let inflate: ReturnType<typeof createInflateRaw> | null = null
  const saidas: Buffer[] = []
  let erro: Error | null = null
  let fim = false
  let acordar: (() => void) | null = null
  const avisar = () => { acordar?.(); acordar = null }
  try {
    for (;;) {
      if (!inflate) {
        const { done, value } = await leitor.read()
        if (value) cabeca = Buffer.concat([cabeca, value])
        if (cabeca.length >= 30) {
          if (cabeca.readUInt32LE(0) !== 0x04034b50) throw new Error("o arquivo da Receita não é um zip")
          if (cabeca.readUInt16LE(8) !== 8) throw new Error("o zip da Receita não usa deflate")
          const inicio = 30 + cabeca.readUInt16LE(26) + cabeca.readUInt16LE(28)
          if (cabeca.length >= inicio) {
            inflate = createInflateRaw()
            inflate.on("data", (b: Buffer) => { saidas.push(b); avisar() })
            inflate.on("end", () => { fim = true; avisar() })
            inflate.on("error", (e: Error) => { erro = e; avisar() })
            inflate.write(cabeca.subarray(inicio))
          }
        } else if (done) throw new Error("zip da Receita incompleto")
        continue
      }
      while (saidas.length) yield saidas.shift()!
      if (erro) throw erro
      if (fim) return
      const { done, value } = await leitor.read()
      if (done) { inflate.end(); await new Promise<void>(r => { acordar = r; if (fim || erro) r() }); continue }
      // contrapressão simples: espera o consumidor esvaziar as saídas antes de empurrar mais
      if (!inflate.write(value)) await new Promise<void>(r => inflate!.once("drain", () => r()))
    }
  } finally { leitor.cancel().catch(() => {}) }
}

type Lote = { candidatos: { c: Candidato; inicio: number }[]; offsetFinal: number; fimDoArquivo: boolean; lidos: number }

async function varrer(corpo: ReadableStream<Uint8Array>, offset: number, maxCnpjs: number, limite: number): Promise<Lote> {
  const candidatos: Lote["candidatos"] = []
  let pos = 0             // bytes descompactados vistos até o começo de `resto`
  let resto: Buffer = Buffer.alloc(0)
  let fimDoArquivo = true
  let lidos = 0
  let parouEm = -1
  externo: for await (const pedaco of conteudoDoZip(corpo)) {
    let buf = resto.length ? Buffer.concat([resto, pedaco]) : pedaco
    if (pos < offset) {
      const pular = Math.min(offset - pos, buf.length)
      buf = buf.subarray(pular); pos += pular
      if (!buf.length) { resto = Buffer.alloc(0); continue }
    }
    let ini = 0
    for (;;) {
      const nl = buf.indexOf(0x0a, ini)
      if (nl < 0) break
      lidos++
      const c = candidatoDaLinha(buf.toString("latin1", ini, nl).replace(/\r$/, ""))
      if (c) candidatos.push({ c, inicio: pos + ini })
      ini = nl + 1
      if (candidatos.length >= maxCnpjs || Date.now() > limite) { parouEm = pos + ini; fimDoArquivo = false; break externo }
    }
    pos += ini
    resto = buf.subarray(ini)
  }
  return { candidatos, offsetFinal: parouEm >= 0 ? parouEm : pos + resto.length, fimDoArquivo, lidos }
}

export const urlArquivo = (mes: string, arquivo: number) => `${BASE_RECEITA}/${mes}/Estabelecimentos${arquivo}.zip`

async function abrirArquivo(f: typeof fetch, mes: string, arquivo: number) {
  return f(urlArquivo(mes, arquivo), { headers: { "user-agent": "enyla-prospector-importador", authorization: AUTH_RECEITA } })
}

type Busca = { ok: true; cad: CadastroBrasilApi } | { ok: false; semCadastro: boolean; falha?: string }
const TENTATIVAS = 3
const dormir = (ms: number) => ms > 0 ? new Promise<void>(r => setTimeout(r, ms)) : Promise.resolve()
/** 404 = CNPJ sem cadastro. 429/5xx/erro de rede repetem com pausa curta; qualquer outra falha (ex.: 403) não repete. Guarda a primeira falha. */
async function buscarCadastro(f: typeof fetch, cnpj: string, pausaMs: number): Promise<Busca> {
  let falha: string | undefined
  for (let t = 1; t <= TENTATIVAS; t++) {
    let repetir = true
    try {
      const r = await f(`${BASE_BRASILAPI}/${cnpj}`, { headers: { accept: "application/json", "user-agent": "enyla-prospector-importador" }, signal: AbortSignal.timeout(15_000) })
      if (r.status === 404) return { ok: false, semCadastro: true }
      if (r.ok) return { ok: true, cad: (await r.json()) as CadastroBrasilApi }
      falha ??= `BrasilAPI respondeu ${r.status}`
      repetir = r.status === 429 || r.status >= 500
    } catch (e) { falha ??= `BrasilAPI falhou: ${e instanceof Error ? e.message : String(e)}` }
    if (!repetir) break
    if (t < TENTATIVAS) await dormir(pausaMs * t)
  }
  return { ok: false, semCadastro: false, falha }
}

export async function importar(deps: Deps = {}): Promise<Resultado> {
  const f = deps.fetch ?? fetch
  const agora = deps.agora ?? (() => new Date())
  const limite = Date.now() + (deps.orcamentoMs ?? ORCAMENTO_MS)
  const zero = { lidos: 0, inseridos: 0, atualizados: 0, ignorados: 0, semCadastro: 0, falhasCadastro: 0 }
  const salvo = (await lerCampos<Record<string, unknown>>([CAMPO]))[CAMPO] as Cursor | undefined
  const mesAtual = mesDe(agora())
  if (salvo?.concluido && salvo.mes >= mesAtual) return { ok: true, ja: true, ...zero, cursor: salvo }
  let cursor: Cursor = salvo && !salvo.concluido ? salvo : { mes: mesAtual, arquivo: 0, offset: 0 }

  let resp = await abrirArquivo(f, cursor.mes, cursor.arquivo)
  if (resp.status === 404 && cursor.arquivo === 0 && cursor.offset === 0) {
    // a Receita publica o mês com atraso: cai para o mês anterior
    cursor = { mes: mesDe(agora(), -1), arquivo: 0, offset: 0 }
    resp = await abrirArquivo(f, cursor.mes, 0)
  }
  if (!resp.ok || !resp.body) return { ok: false, erro: `Receita respondeu ${resp.status}`, ...zero, cursor }

  const lote = await varrer(resp.body, cursor.offset, deps.maxCnpjs ?? MAX_CNPJS_POR_EXECUCAO, limite)
  const r = { ...zero, lidos: lote.lidos }

  // Razão social e porte ficam em Empresas*.zip, outro conjunto de arquivos. Só para quem passou no filtro, a BrasilAPI (gratuita, sem chave) completa.
  // Se ela falha (não 404), grava com os dados do arquivo da Receita e conta em falhasCadastro; a importação não depende dela.
  let parou: number | null = null
  let primeiraFalha: string | undefined
  const linhas: NonNullable<ReturnType<typeof montarProspecto>>[] = []
  for (let i = 0; i < lote.candidatos.length && parou == null; i += PARALELO) {
    const grupo = lote.candidatos.slice(i, i + PARALELO)
    const buscas = await Promise.all(grupo.map(g => buscarCadastro(f, g.c.cnpj, deps.pausaMs ?? 500)))
    for (let k = 0; k < grupo.length; k++) {
      const b = buscas[k]
      if (b.ok) { const l = montarProspecto(grupo[k].c, b.cad, agora()); if (l) linhas.push(l); else r.semCadastro++ }
      else if (b.semCadastro) r.semCadastro++
      else {
        r.falhasCadastro++; primeiraFalha ??= b.falha
        const l = montarProspecto(grupo[k].c, {}, agora(), true); if (l) linhas.push(l)
      }
    }
    if (Date.now() > limite) { const prox = lote.candidatos[i + PARALELO]; if (prox && parou == null) parou = prox.inicio; break }
  }

  await gravar(linhas, agora, r)

  const proximo: Cursor = parou != null ? { ...cursor, offset: parou }
    : !lote.fimDoArquivo ? { ...cursor, offset: lote.offsetFinal }
    : cursor.arquivo + 1 < ARQUIVOS ? { mes: cursor.mes, arquivo: cursor.arquivo + 1, offset: 0 }
    : { ...cursor, offset: lote.offsetFinal, concluido: true }
  await gravarCampos({ [CAMPO]: proximo })
  if (r.falhasCadastro > 0 && r.inseridos + r.atualizados + r.ignorados === 0) return { ok: false, erro: primeiraFalha ?? "BrasilAPI falhou", ...r, cursor: proximo }
  return { ok: true, ...r, cursor: proximo }
}

async function gravar(linhas: NonNullable<ReturnType<typeof montarProspecto>>[], agora: () => Date, r: { inseridos: number; atualizados: number; ignorados: number }) {
  if (!linhas.length) return
  const { data, error } = await supabase.from(TABELA).select("id, cnpj, etapa, opt_out").in("cnpj", linhas.map(l => l.cnpj))
  if (error) throw new Error(error.message)
  const existentes = new Map((data ?? []).map(x => [x.cnpj as string, x as Existente]))
  const novos: object[] = []
  for (const l of linhas) {
    const g = decidirGravacao(existentes.get(l.cnpj) ?? null, l, agora())
    if (g.tipo === "ignorar") { r.ignorados++; continue }
    if (g.tipo === "inserir") { novos.push(g.linha); continue }
    // Só dados cadastrais e nota. Etapa, histórico e opt_out não entram no update; a trava no opt_out cobre corrida com o "não quero receber".
    const cadastro: Partial<typeof g.campos> = { ...g.campos }
    delete cadastro.cnpj
    // Linha parcial (BrasilAPI falhou): não apaga o que já está gravado com vazio.
    if (!cadastro.razao_social) for (const k of Object.keys(cadastro) as (keyof typeof cadastro)[]) if (k === "razao_social" || cadastro[k] == null) delete cadastro[k]
    const { data: ok, error: e } = await supabase.from(TABELA).update({ ...cadastro, atualizado_em: agora().toISOString() }).eq("id", g.id).eq("opt_out", false).neq("etapa", "descartado").select("id")
    if (e) throw new Error(e.message)
    if (ok?.length) r.atualizados++; else r.ignorados++
  }
  if (novos.length) {
    // ignoreDuplicates: se outro processo inseriu o mesmo CNPJ no meio, não sobrescreve nada.
    const { data: ins, error: e } = await supabase.from(TABELA).upsert(novos, { onConflict: "cnpj", ignoreDuplicates: true }).select("id")
    if (e) throw new Error(e.message)
    r.inseridos += ins?.length ?? 0
    r.ignorados += novos.length - (ins?.length ?? 0)
  }
}
