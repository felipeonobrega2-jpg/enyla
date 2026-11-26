// Porta externa: ações do Prospector para a CCO e a CMO (importar_prospectos, responder_prospecto,
// decidir_cadastro_parceiro, verificar_whatsapp). Tudo fica no histórico do prospecto, com quem fez (campo `por`).
// Não toca em prospector_envio_ativo nem nos tetos de envio. Só responder_prospecto manda mensagem, e só a quem escreveu.
import { supabase } from "./supabase"
import { evo } from "./evolution"
import { enviarEmail } from "./email"
import { mudarConfig, lerCampos } from "./configAtomica"
import { podeAcionarComercial } from "./ordemComercial"
import { cnpjValido, paraFornecedor, type CadastroParceiro } from "./parceiros"
import {
  ASSUNTO_EMAIL, celularWhatsapp, chaveTelefone, dentroDoHorario, emailValido, replyToDoProspector, termoForaDoRamo,
} from "./prospectorEnvio"
import { COLUNAS, REMETENTE, gravar, historicoDe, reler, type Linha } from "./prospectorEnvioServidor"
import type { EtapaFunil, MudancaEtapa } from "./prospector"

const TABELA = "prospectos_parceiros"
export const MAX_ITENS_IMPORTACAO = 200
export const MAX_NUMEROS_VERIFICACAO = 50
export const MAX_TEXTO_RESPOSTA = 2000

export type Pedido = Record<string, unknown>
export type Resultado = { ok: true; corpo: Record<string, unknown> } | { ok: false; status: 400 | 403 | 404 | 409 | 502 | 503; erro: string }

const negar = (acao: string): Resultado => ({ ok: false, status: 403, erro: `${acao} é só para as chaves do CCO e da CMO.` })
const erro = (status: 400 | 404 | 409 | 502 | 503, msg: string): Resultado => ({ ok: false, status, erro: msg })
const txt = (v: unknown) => (typeof v === "string" ? v.trim() : "")
const soDigitos = (v: unknown) => String(v ?? "").replace(/\D/g, "")

/** Telefone brasileiro (com ou sem 55): DDD + 8 ou 9 dígitos. Devolve só os dígitos, sem o 55, ou null. */
export function telefoneValido(v: unknown): string | null {
  let d = soDigitos(v)
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2)
  return /^[1-9][1-9]\d{8,9}$/.test(d) ? d : null
}

/** Acrescenta uma linha ao histórico do prospecto (com quem fez), com trava otimista e releitura. Não muda a etapa. */
async function anotar(id: number, linha: Linha | null, quem: string, motivo: string, extra: Partial<MudancaEtapa> = {}, campos: Record<string, unknown> = {}): Promise<boolean> {
  let atual = linha ?? (await reler(id))
  for (let i = 0; i < 4 && atual; i++) {
    const g = await gravar(atual, { ...campos, historico_etapas: [...historicoDe(atual), { etapa: atual.etapa as EtapaFunil, em: new Date().toISOString(), motivo, por: quem, ...extra }] })
    if (g) return true
    atual = await reler(id)
  }
  return false
}

// ── 1. importar_prospectos ──────────────────────────────────────────────────
type Recusa = { indice: number; motivo: string; nome?: string }
type Duplicado = { indice: number; cnpj: string; motivo: string }

export async function importarProspectos(diretor: string, b: Pedido): Promise<Resultado> {
  if (!podeAcionarComercial(diretor as never)) return negar("importar_prospectos")
  if (!Array.isArray(b.itens) || !b.itens.length) return erro(400, "itens: lista não vazia de { nome, cnpj, email?, celular?, cidade?, origem }.")
  if (b.itens.length > MAX_ITENS_IMPORTACAO) return erro(400, `itens: no máximo ${MAX_ITENS_IMPORTACAO} por chamada.`)

  // Lista de exclusão: quem pediu para sair (opt-out) e os descartados, por CNPJ, telefone e e-mail.
  const saidas = await supabase.from(TABELA).select("cnpj, telefone, email, etapa, opt_out").or("opt_out.eq.true,etapa.eq.descartado").limit(5000)
  if (saidas.error) return erro(503, "Não consegui ler a lista de exclusão; nada foi importado.")
  const excluidos = new Map<string, string>()
  const telsExcl = new Set<string>(), mailsExcl = new Set<string>()
  for (const s of (saidas.data ?? []) as { cnpj: string; telefone: string | null; email: string | null; opt_out: boolean }[]) {
    excluidos.set(s.cnpj, s.opt_out ? "opt-out" : "descartado")
    if (s.opt_out) {
      const t = telefoneValido(s.telefone); if (t) telsExcl.add(chaveTelefone(t))
      const e = emailValido(s.email); if (e) mailsExcl.add(e)
    }
  }

  const criados: { indice: number; id: number; cnpj: string }[] = []
  const duplicados: Duplicado[] = []
  const recusados: Recusa[] = []
  const vistos = new Set<string>()
  const agora = new Date()

  for (let i = 0; i < b.itens.length; i++) {
    const it = b.itens[i]
    if (!it || typeof it !== "object" || Array.isArray(it)) { recusados.push({ indice: i, motivo: "item não é um objeto" }); continue }
    const x = it as Pedido
    const nome = txt(x.nome), origem = txt(x.origem)
    if (nome.length < 2 || nome.length > 200) { recusados.push({ indice: i, motivo: "nome: de 2 a 200 caracteres" }); continue }
    if (!origem || origem.length > 80) { recusados.push({ indice: i, nome, motivo: "origem: obrigatória, até 80 caracteres" }); continue }
    const cnpj = soDigitos(x.cnpj)
    if (!cnpj) { recusados.push({ indice: i, nome, motivo: "sem CNPJ: o Prospector identifica a gráfica pelo CNPJ" }); continue }
    if (!cnpjValido(cnpj)) { recusados.push({ indice: i, nome, motivo: "CNPJ inválido" }); continue }
    let email: string | null = null
    if (txt(x.email)) { email = emailValido(txt(x.email)); if (!email) { recusados.push({ indice: i, nome, motivo: "e-mail inválido" }); continue } }
    let telefone: string | null = null
    if (txt(x.celular)) { telefone = telefoneValido(x.celular); if (!telefone) { recusados.push({ indice: i, nome, motivo: "celular inválido (DDD + número)" }); continue } }
    const cidade = txt(x.cidade).slice(0, 80) || null

    const fora = excluidos.get(cnpj)
    if (fora) { recusados.push({ indice: i, nome, motivo: `na lista de exclusão (${fora})` }); continue }
    if ((telefone && telsExcl.has(chaveTelefone(telefone))) || (email && mailsExcl.has(email))) { recusados.push({ indice: i, nome, motivo: "contato na lista de exclusão (opt-out)" }); continue }
    if (termoForaDoRamo(nome, null)) { recusados.push({ indice: i, nome, motivo: "fora do ramo" }); continue }
    if (vistos.has(cnpj)) { duplicados.push({ indice: i, cnpj, motivo: "repetido na mesma lista" }); continue }
    vistos.add(cnpj)

    const ja = await supabase.from(TABELA).select("id").eq("cnpj", cnpj).maybeSingle()
    if (ja.error) { recusados.push({ indice: i, nome, motivo: "erro ao consultar a base" }); continue }
    if (ja.data) { duplicados.push({ indice: i, cnpj, motivo: "já está na base (nada foi alterado)" }); continue }

    const em = agora.toISOString()
    const ins = await supabase.from(TABELA).insert({
      cnpj, razao_social: nome, nome_fantasia: null, municipio: cidade, email, telefone,
      fonte: `porta externa (${diretor}): ${origem}`, coletado_em: em, etapa: "encontrado",
      historico_etapas: [{ etapa: "encontrado", em, motivo: `importado pela porta externa: ${origem}`, por: diretor }],
    }).select("id").maybeSingle()
    if (ins.error) {
      if ((ins.error as { code?: string }).code === "23505") duplicados.push({ indice: i, cnpj, motivo: "já está na base (nada foi alterado)" })
      else recusados.push({ indice: i, nome, motivo: "erro ao gravar" })
      continue
    }
    criados.push({ indice: i, id: (ins.data as { id: number } | null)?.id ?? 0, cnpj })
  }
  return { ok: true, corpo: { ok: true, criados, duplicados, recusados, resumo: { criados: criados.length, duplicados: duplicados.length, recusados: recusados.length } } }
}

// ── 2. responder_prospecto ──────────────────────────────────────────────────
const semHtml = (s: string) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string)

export async function responderProspecto(diretor: string, b: Pedido, agora: Date = new Date()): Promise<Resultado> {
  if (!podeAcionarComercial(diretor as never)) return negar("responder_prospecto")
  const id = Number(b.id)
  if (!Number.isInteger(id) || id <= 0) return erro(400, "id: número do prospecto.")
  const texto = txt(b.texto)
  if (!texto) return erro(400, "texto: obrigatório.")
  if (texto.length > MAX_TEXTO_RESPOSTA) return erro(400, `texto: no máximo ${MAX_TEXTO_RESPOSTA} caracteres.`)

  const l = await reler(id)
  if (!l) return erro(404, `Prospecto ${id} não encontrado.`)
  if (l.opt_out || l.etapa === "descartado") return erro(409, "Prospecto em opt-out ou descartado: não recebe mensagem.")
  if (!dentroDoHorario(agora)) return erro(409, "Fora da janela de envio (segunda a sexta, 8h às 20h, America/Sao_Paulo). Nada foi enviado.")

  // Canal em que ele escreveu por último
  const numero = celularWhatsapp(l.telefone, l.whatsapp_verificado === true)
  let zap: { ts: string } | null = null
  if (numero) {
    const sem9 = numero.length === 13 ? numero.slice(0, 4) + numero.slice(5) : numero
    const r = await supabase.from("whatsapp_mensagens").select("ts").in("jid", [...new Set([`${numero}@s.whatsapp.net`, `${sem9}@s.whatsapp.net`])]).eq("from_me", false).order("ts", { ascending: false }).limit(1)
    const linha = (r.data ?? [])[0] as { ts?: string } | undefined
    if (!r.error && linha?.ts) zap = { ts: linha.ts }
  }
  let mail: { em: string; de: string; assunto: string | null } | null = null
  const m = await supabase.from("prospectos_emails_recebidos").select("de, assunto, recebido_em, criado_em").eq("prospecto_id", id).order("recebido_em", { ascending: false }).limit(1)
  const lm = (m.data ?? [])[0] as { de?: string; assunto?: string | null; recebido_em?: string | null; criado_em?: string } | undefined
  if (!m.error && lm?.de) mail = { em: lm.recebido_em ?? lm.criado_em ?? "", de: lm.de, assunto: lm.assunto ?? null }
  if (!zap && !mail) return erro(409, "Este prospecto ainda não escreveu por WhatsApp nem por e-mail: não há canal para responder.")
  const canal: "whatsapp" | "email" = zap && mail ? (Date.parse(zap.ts) >= Date.parse(mail.em || "0") ? "whatsapp" : "email") : zap ? "whatsapp" : "email"

  let ok = false, falha = ""
  if (canal === "whatsapp") {
    const r = await evo<{ key?: { id?: string } }>("/message/sendText/{i}", { method: "POST", body: JSON.stringify({ number: numero, text: texto }) })
    ok = r.ok && !!r.corpo?.key?.id
    if (!ok) falha = `WhatsApp não enviou (${r.status})`
  } else {
    const para = emailValido(mail!.de) ?? emailValido(l.email)
    if (!para) falha = "e-mail inválido"
    else {
      const base = (mail!.assunto ?? "").trim()
      const assunto = base ? (/^re:/i.test(base) ? base : `Re: ${base}`) : ASSUNTO_EMAIL
      const r = await enviarEmail(para, { assunto, texto, html: `<p>${semHtml(texto).replace(/\n/g, "<br>")}</p>` }, [], { de: REMETENTE, responderPara: replyToDoProspector() })
      ok = r.ok
      if (!r.ok) falha = r.erro
    }
  }
  const gravado = await anotar(id, l, diretor, `resposta ${ok ? "enviada" : "não enviada"} por ${canal}`, { mensagem: { direcao: "enviada", canal, texto, status: ok ? "enviada" : "falhou", ...(ok ? {} : { erro: falha }) } })
  if (!ok) return erro(502, `${falha}. Nada foi entregue${gravado ? "; a tentativa ficou no histórico" : ""}.`)
  return { ok: true, corpo: { ok: true, canal, registrado: gravado } }
}

// ── 3. decidir_cadastro_parceiro ────────────────────────────────────────────
export async function decidirCadastroParceiro(diretor: string, b: Pedido): Promise<Resultado> {
  if (!podeAcionarComercial(diretor as never)) return negar("decidir_cadastro_parceiro")
  const id = txt(b.id)
  if (!id) return erro(400, "id: id do cadastro (ex.: PAR-...), em ?o=parceiros.")
  if (b.decisao !== "aprovar" && b.decisao !== "recusar") return erro(400, "decisao: aprovar ou recusar.")
  const motivo = txt(b.motivo)
  if (motivo.length > 300) return erro(400, "motivo: no máximo 300 caracteres.")

  const cfg = await lerCampos<{ cadastrosParceiros?: CadastroParceiro[] }>(["cadastrosParceiros"])
  const cad = (cfg.cadastrosParceiros ?? []).find(c => c.id === id)
  if (!cad) return erro(404, `Cadastro ${id} não encontrado.`)
  if (cad.status !== "novo") return erro(409, `Cadastro ${id} já está ${cad.status}: nada foi alterado.`)

  const aprovar = b.decisao === "aprovar"
  const em = new Date().toISOString()
  const { mudarStatus } = await import("./parceirosServidor")
  let fornecedorId: string | undefined
  if (aprovar) {
    // Mesmo que o botão "Aprovar e cadastrar": vira fornecedor de produção (id fixo por cadastro, então não duplica) e só então o status.
    fornecedorId = `f-${id.toLowerCase()}`
    const fid = fornecedorId
    await mudarConfig<{ producao?: { fornecedores?: { id: string }[] } & Record<string, unknown> }>(d => {
      const prod = d.producao ?? {}
      const lista = prod.fornecedores ?? []
      if (lista.some(f => f.id === fid)) return null
      return { producao: { ...prod, fornecedores: [...lista, paraFornecedor(cad, fid)] } }
    })
  }
  await mudarStatus(id, aprovar ? "aprovado" : "recusado", fornecedorId)
  await mudarConfig<{ cadastrosParceiros?: CadastroParceiro[] }>(d => ({
    cadastrosParceiros: (d.cadastrosParceiros ?? []).map(c => c.id === id ? { ...c, decisao: { por: diretor, em, decisao: b.decisao as "aprovar" | "recusar", ...(motivo ? { motivo } : {}) } } : c),
  }))

  // Histórico do prospecto com o mesmo CNPJ (se existir e não estiver em opt-out), com quem decidiu
  let registrado = false
  const doc = cad.tipoDocumento === "cnpj" ? soDigitos(cad.documento) : ""
  if (doc.length === 14) {
    const r = await supabase.from(TABELA).select(COLUNAS).eq("cnpj", doc).maybeSingle()
    const p = r.data as Linha | null
    if (p && !p.opt_out) registrado = await anotar(p.id, p, diretor, `cadastro ${id} ${aprovar ? "aprovado" : "recusado"} por ${diretor}${motivo ? `: ${motivo}` : ""}`, { cadastroId: id })
  }
  return { ok: true, corpo: { ok: true, id, status: aprovar ? "aprovado" : "recusado", ...(fornecedorId ? { fornecedorId } : {}), registradoNoProspecto: registrado } }
}

// ── 4. verificar_whatsapp ───────────────────────────────────────────────────
export async function verificarWhatsapp(diretor: string, b: Pedido): Promise<Resultado> {
  if (!podeAcionarComercial(diretor as never)) return negar("verificar_whatsapp")
  if (!Array.isArray(b.numeros) || !b.numeros.length) return erro(400, "numeros: lista não vazia de telefones (até 50).")
  if (b.numeros.length > MAX_NUMEROS_VERIFICACAO) return erro(400, `numeros: no máximo ${MAX_NUMEROS_VERIFICACAO} por chamada.`)
  if (b.numeros.some(n => typeof n !== "string")) return erro(400, "numeros: só texto.")

  const validos = new Map<string, string>()   // dígitos sem 55 → número como veio
  const invalidos: string[] = []
  for (const n of b.numeros as string[]) {
    const d = telefoneValido(n)
    if (d) validos.set(d, n); else invalidos.push(n)
  }
  if (!validos.size) return { ok: true, corpo: { ok: true, resultados: [], invalidos } }

  const r = await evo<{ exists?: boolean; number?: string; jid?: string }[]>("/chat/whatsappNumbers/{i}", { method: "POST", body: JSON.stringify({ numbers: [...validos.keys()].map(d => `55${d}`) }) })
  if (!r.ok || !Array.isArray(r.corpo)) return erro(r.status === 0 ? 503 : 502, `A Evolution não respondeu à checagem (${r.status}). Nada foi gravado.`)
  const tem = new Set<string>(), nao = new Set<string>()
  for (const x of r.corpo) {
    const k = chaveTelefone(String(x.number ?? x.jid ?? "").split("@")[0])
    if (k) (x.exists === true ? tem : nao).add(k)
  }

  const resultados: { numero: string; whatsapp: boolean | null; prospectosAtualizados: number }[] = []
  for (const [d, original] of validos) {
    const k = chaveTelefone(d)
    if (!tem.has(k)) { resultados.push({ numero: original, whatsapp: nao.has(k) ? false : null, prospectosAtualizados: 0 }); continue }
    const achados = await supabase.from(TABELA).select(COLUNAS).in("telefone", [d, `55${d}`]).eq("opt_out", false).limit(20)
    let n = 0
    for (const p of (achados.data ?? []) as Linha[]) {
      if (p.whatsapp_verificado === true) continue
      if (await anotar(p.id, p, diretor, `WhatsApp verificado por ${diretor}`, {}, { whatsapp_verificado: true })) n++
    }
    resultados.push({ numero: original, whatsapp: true, prospectosAtualizados: n })
  }
  return { ok: true, corpo: { ok: true, resultados, invalidos } }
}
