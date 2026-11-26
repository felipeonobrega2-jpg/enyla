// Atendente no modo "prospecto parceiro": gráfica de prospectos_parceiros que responde no WhatsApp é atendida pela IA,
// com prompt próprio de parceria (nunca de venda ou orçamento). É o mesmo Atendente (agenteAuto), não um agente novo:
// os envios, o ritmo de gente, a reserva por mensagem e o registro são os dele, passados em `deps`.
// Regras do Felipe (26/11/2026): tudo automático; sim = link, dúvida = responde e conduz ao link, não = confirma uma vez e opt-out.
// Não cobra, não mexe em pagamento e não apaga nada. O envio só ocorre dentro da janela do Prospector (8h às 20h, seg-sex).
import { supabase } from "./supabase"
import { dentroDoHorario, ehRecusa, URL_CADASTRO_PARCEIROS } from "./prospectorEnvio"
import { conhecimentoNoPrompt, conhecimentoRelevante, type Conhecimento } from "./agenteLeads"
import type { ProspectoDoJid } from "./prospectorTrava"

export const POR_ATENDENTE = "atendente_auto"
export type Classe = "sim" | "nao" | "duvida"

const limpar = (t: string | null | undefined) => (t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9? ]+/g, " ").replace(/\s+/g, " ").trim()

/** sim / não / dúvida. Conservador: na dúvida entre as classes, é dúvida (a IA responde e conduz ao link). */
export function classificarMensagem(texto: string | null | undefined): Classe {
  const t = limpar(texto)
  if (!t) return "duvida"
  if (ehRecusa(texto)) return "nao"
  // Palavra solta de parada só vale em mensagem curta ("pare", "remover", "sair"); em frase longa é conversa
  if (t.length <= 40 && !t.includes("?") && /\b(pare|parem|parar|sair|remover|remova|remove|stop|descadastrar|cancelar)\b/.test(t)) return "nao"
  if (t.includes("?") || t.length > 60) return "duvida"
  if (/^(sim|s|quero|queremos|tenho|temos|tenho sim|temos sim|tenho interesse|temos interesse|pode|pode sim|pode mandar|manda|mande|manda sim|claro|com certeza|topo|vamos|bora|beleza|ok|certo|fechado|me manda|me envia|envia|envie|link|manda o link|me manda o link|pode enviar)\b/.test(t)) return "sim"
  return "duvida"
}

export const TEXTO_OPT_OUT = "Tudo bem, sem problema! Não vamos mais te mandar mensagens. Obrigado pela atenção e sucesso para vocês."
export const textoSim = (linkJaEnviado: boolean) => linkJaEnviado
  ? "Perfeito! É só preencher o cadastro pelo link que mandei antes, leva uns 5 minutos. O Felipe analisa e te chama aqui no WhatsApp. Se travar em alguma parte, é só falar."
  : `Que bom! O cadastro leva uns 5 minutos, é só preencher aqui: ${URL_CADASTRO_PARCEIROS}\nO Felipe analisa e te chama aqui no WhatsApp.`

// O que o Felipe já confirmou (26/11/2026). O que a CMO guardou em conhecimentoAgente vale sobre isto, se divergir.
const FATOS = [
  "O cadastro é feito em " + URL_CADASTRO_PARCEIROS + " e leva uns 5 minutos.",
  "Depois do cadastro o Felipe analisa e chama no WhatsApp.",
  "O cadastro é gratuito: não custa nada para entrar.",
  "Não há exclusividade: a gráfica continua livre para atender quem quiser.",
  "Não prometemos volume mínimo nem fixo de serviços.",
  "Pagamento: pagamos 50% antes do serviço e 50% na retirada, por PIX.",
]
const TEMA_PARCERIA = /parceir|cadastro|gr[aá]fica parceira|terceiriz|\/parceiros/i

export type Saida = { texto: string; enviarLink: boolean; perguntaPendente: string | null }

export const ESQUEMA = {
  type: "object", additionalProperties: false, required: ["texto", "enviar_link", "pergunta_pendente"],
  properties: {
    texto: { type: "string", description: "A resposta de WhatsApp, curta. Vazia se não há o que responder." },
    enviar_link: { type: "boolean", description: "true se faz sentido mandar o link de cadastro nesta resposta (não repita o link a cada mensagem)" },
    pergunta_pendente: { type: ["string", "null"], description: "A pergunta da gráfica que NÃO tem resposta no conhecimento (e só ela); null se tudo foi respondido" },
  },
} as const

/** O prompt do modo parceria: tira a dúvida e leva ao cadastro. Não orça, não fala de preço de embalagem. */
export function promptParceria(conhecimento: Conhecimento[] | undefined, conversa: string, linkJaEnviado: boolean): string {
  const base = conhecimento ?? []
  const doPrograma = base.filter(i => TEMA_PARCERIA.test(`${i.tema} ${i.texto}`))
  const escolhidos = [...new Map([...doPrograma, ...conhecimentoRelevante(base, conversa, 12000)].map(i => [i.id, i])).values()]
  const saber = conhecimentoNoPrompt(escolhidos)
  return `Você é o Atendente da ENYLA (gráfica de embalagens em Barueri-SP), no WhatsApp, falando com outra GRÁFICA que a ENYLA convidou para o programa de parceiros (a ENYLA contrata gráficas parceiras para serviços de produção).
Esta conversa NÃO é de venda: você não orça, não fala de preço de embalagem ao cliente final, não trata a gráfica como cliente e não pede medida, quantidade ou arte.
Objetivo de cada resposta: tirar a dúvida da gráfica e levá-la ao cadastro em ${URL_CADASTRO_PARCEIROS}. ${linkJaEnviado ? "O link JÁ foi enviado nesta conversa: não repita o link; no máximo lembre que ele está acima." : "Mande o link só quando fizer sentido (enviar_link = true); não escreva o endereço no texto, o sistema coloca o link."}
Como escrever: empresa falando ("nós"), cordial, curta (2 a 4 frases), sem pressão, sem emoji em excesso (no máximo um), português do Brasil. Não exponha nada interno (agentes, diretoria, sistema).
Responda SÓ com o que está nos fatos e no conhecimento abaixo. Nunca invente valor, prazo, volume, condição ou promessa. Se a gráfica perguntar algo que NÃO está lá: responda o resto da mensagem normalmente, diga que o Felipe confirma esse ponto e coloque a pergunta em pergunta_pendente. Se tudo foi respondido, pergunta_pendente = null.

Fatos confirmados pelo Felipe:
${FATOS.map(f => `- ${f}`).join("\n")}
${saber ? `\nConhecimento guardado sobre o programa de parceiros (vale sobre os fatos acima se divergir):\n${saber}\n` : ""}`
}

export type Deps = {
  agora?: () => Date
  /** mensagens da conversa, da mais antiga à mais nova */
  mensagens: (jid: string) => Promise<{ from_me: boolean; corpo: string | null }[]>
  conhecimento: () => Promise<Conhecimento[] | undefined>
  /** chama a IA com o prompt de sistema; devolve a saída estruturada ou lança erro */
  ia: (sistema: string, conversa: string) => Promise<{ texto: string; enviar_link: boolean; pergunta_pendente: string | null }>
  /** reserva atômica da mensagem (uma resposta por mensagem); false = outra execução já pegou */
  reservar: () => Promise<boolean>
  /** envia pelo número da ENYLA, com o ritmo de gente do Atendente */
  enviar: (texto: string) => Promise<{ ids: string[]; erro?: string }>
  /** linha no registro do Atendente (tela Configurações → Agente) */
  registrarLog: (r: { enviou: boolean; texto: string; motivo: string; ids?: string[] }) => Promise<void>
  /** aviso ao Felipe pelo canal de aviso que já existe */
  avisar: (motivo: string, sugestao: string) => Promise<void>
}

export type Resultado =
  | { ok: true; classe: Classe; texto: string; link: boolean; perguntaPendente: string | null; optOut: boolean }
  | { ok: false; motivo: "excluido" | "fora_da_janela" | "ja_tratada" | "sem_mensagem" | "sem_texto" | "ia_falhou" | "com_valor" | "nao_enviou"; erro?: string }

const COLUNAS = "id, razao_social, nome_fantasia, telefone, etapa, opt_out, historico_etapas, atualizado_em"
const historicoDe = (p: Pick<ProspectoDoJid, "historico_etapas">) => (Array.isArray(p.historico_etapas) ? p.historico_etapas : []) as Record<string, unknown>[]
export const excluido = (p: Pick<ProspectoDoJid, "opt_out" | "etapa">) => p.opt_out || p.etapa === "descartado"
const jaMandouLink = (p: ProspectoDoJid) => historicoDe(p).some(h => h.link_enviado === true)

// Etapas de onde a resposta da gráfica leva a "respondeu" (só para frente: abriu e cadastrou ficam)
const ANTES_DE_RESPONDER = ["encontrado", "qualificado", "abordado", "encerrado_sem_resposta"]

/** Grava no histórico (e, se vier, a etapa) com trava otimista em atualizado_em; relê e tenta de novo se mudou. Nunca grava em opt-out. */
export async function gravarNoProspecto(p: ProspectoDoJid, montar: (atual: ProspectoDoJid, em: string) => { etapa?: string; entrada: Record<string, unknown> } | null, aposOptOut = false): Promise<ProspectoDoJid | null> {
  let atual = p
  for (let i = 0; i < 3; i++) {
    const em = new Date().toISOString()
    const m = montar(atual, em)
    if (!m) return atual
    const etapa = m.etapa ?? atual.etapa
    const campos = { ...(m.etapa ? { etapa: m.etapa } : {}), historico_etapas: [...historicoDe(atual), { etapa, em, ...m.entrada }], atualizado_em: em }
    // aposOptOut: só para registrar a confirmação que acabou de sair; a etapa não muda
    const q = supabase.from("prospectos_parceiros").update(campos).eq("id", atual.id).eq("atualizado_em", atual.atualizado_em)
    const { data } = await (aposOptOut ? q : q.eq("opt_out", false)).select("id")
    if (Array.isArray(data) && data.length) return { ...atual, ...campos } as ProspectoDoJid
    const { data: l } = await supabase.from("prospectos_parceiros").select(COLUNAS).eq("id", p.id).maybeSingle()
    if (!l) return null
    atual = l as ProspectoDoJid
    if (excluido(atual) && !aposOptOut) return null
  }
  return null
}

/** Chegou mensagem da gráfica: a etapa vai para "respondeu" (se ainda não está além) e a mensagem fica no histórico. Só grava; não envia. */
export async function registrarRecebida(p: ProspectoDoJid, texto: string | null | undefined): Promise<ProspectoDoJid> {
  if (excluido(p) || !ANTES_DE_RESPONDER.includes(p.etapa)) return p
  const g = await gravarNoProspecto(p, (atual, em) => !ANTES_DE_RESPONDER.includes(atual.etapa) || excluido(atual) ? null
    : { etapa: "respondeu", entrada: { motivo: "respondeu no WhatsApp", mensagem: { direcao: "recebida", canal: "whatsapp", texto: String(texto ?? "").slice(0, 500), em } } }).catch(() => null)
  return g ?? p
}

/** A gráfica pediu para parar: opt_out, etapa descartado e a data (a constraint do banco exige os três juntos). */
async function marcarOptOut(p: ProspectoDoJid, texto: string): Promise<boolean> {
  const { gravarOptOut } = await import("./prospectorEnvioServidor")
  const g = await gravarOptOut(p as never, new Date().toISOString(), `pediu para não receber mais (resposta automática do Atendente): "${texto.slice(0, 120)}"`).catch(() => null)
  return !!g
}

/** Responde uma mensagem da gráfica. A mensagem já está gravada em whatsapp_mensagens; aqui só se decide e se envia. */
export async function responderProspectoParceiro(jid: string, prospecto: ProspectoDoJid, textoRecebido: string | null, deps: Deps): Promise<Resultado> {
  if (excluido(prospecto)) return { ok: false, motivo: "excluido" }
  const agora = deps.agora?.() ?? new Date()
  if (!dentroDoHorario(agora)) return { ok: false, motivo: "fora_da_janela" }
  const msgs = await deps.mensagens(jid)
  const ultima = [...msgs].reverse().find(m => !m.from_me)?.corpo ?? textoRecebido
  const recebido = String(textoRecebido ?? ultima ?? "").trim()
  if (!recebido) return { ok: false, motivo: "sem_mensagem" }
  if (!await deps.reservar()) return { ok: false, motivo: "ja_tratada" }

  let p = await registrarRecebida(prospecto, recebido)
  const classe = classificarMensagem(recebido)
  let texto = ""
  let enviarLink = false
  let pergunta: string | null = null

  if (classe === "nao") {
    // Nada mais sai para ela depois disto (nem o Prospector, nem ordem de diretor): o opt-out vem antes da confirmação
    if (!await marcarOptOut(p, recebido)) { await deps.registrarLog({ enviou: false, texto: "", motivo: "prospecto parceiro pediu para parar, mas o opt-out não gravou: nada enviado" }); return { ok: false, motivo: "nao_enviou", erro: "opt-out não gravou" } }
    texto = TEXTO_OPT_OUT
  } else if (classe === "sim") {
    enviarLink = !jaMandouLink(p)
    texto = textoSim(!enviarLink)
  } else {
    const conversa = msgs.slice(-20).filter(m => m.corpo).map(m => `${m.from_me ? "ENYLA" : "Gráfica"}: ${String(m.corpo).slice(0, 400)}`).join("\n")
    let s: Awaited<ReturnType<Deps["ia"]>>
    try { s = await deps.ia(promptParceria(await deps.conhecimento(), conversa, jaMandouLink(p)), conversa || `Gráfica: ${recebido}`) }
    catch (e) { await deps.registrarLog({ enviou: false, texto: "", motivo: `prospecto parceiro: IA falhou (${String(e).slice(0, 100)})` }); return { ok: false, motivo: "ia_falhou", erro: String(e) } }
    // Link só o oficial, escrito pelo sistema: tira qualquer endereço que a IA tenha escrito (o www dá erro)
    texto = String(s.texto ?? "").replace(/https?:\/\/\S+|\bwww\.\S+|\bapp\.enyla\.com\.br\S*/gi, "").replace(/[ \t]+\n/g, "\n").replace(/ {2,}/g, " ").trim()
    pergunta = s.pergunta_pendente?.trim() || null
    if (!texto) { await deps.registrarLog({ enviou: false, texto: "", motivo: "prospecto parceiro: nada a responder" }); return { ok: false, motivo: "sem_texto" } }
    if (/R\$\s*\d/.test(texto)) { await deps.avisar("prospecto parceiro: a IA citou valor; segurei", texto).catch(() => null); await deps.registrarLog({ enviou: false, texto, motivo: "prospecto parceiro: resposta com valor, segurada" }); return { ok: false, motivo: "com_valor" } }
    enviarLink = !!s.enviar_link && !jaMandouLink(p)
    if (enviarLink) texto = `${texto}\n${URL_CADASTRO_PARCEIROS}`
  }

  const env = await deps.enviar(texto)
  if (env.erro || !env.ids.length) { await deps.registrarLog({ enviou: false, texto, motivo: `prospecto parceiro: não enviou (${env.erro ?? "sem id"})` }); return { ok: false, motivo: "nao_enviou", erro: env.erro } }

  const em = new Date().toISOString()
  // Depois do opt-out o prospecto já está excluído: a confirmação é gravada mesmo assim (aposOptOut), sem mudar a etapa
  if (classe === "nao") p = (await supabase.from("prospectos_parceiros").select(COLUNAS).eq("id", p.id).maybeSingle()).data as ProspectoDoJid ?? p
  p = await gravarNoProspecto(p, atual => ({ entrada: {
    motivo: classe === "nao" ? "confirmação de opt-out enviada pelo Atendente" : "resposta automática do Atendente",
    mensagem: { direcao: "enviada", canal: "whatsapp", por: POR_ATENDENTE, texto, em },
    ...(enviarLink && !jaMandouLink(atual) ? { link_enviado: true } : {}),
    ...(pergunta ? { pergunta_pendente: pergunta } : {}),
  } }), classe === "nao").catch(() => null) ?? p
  await deps.registrarLog({ enviou: true, texto, motivo: `prospecto parceiro (${classe})${enviarLink ? ", link enviado" : ""}${pergunta ? ", pergunta pendente para o Felipe" : ""}`, ids: env.ids })
  if (pergunta) await deps.avisar(`pergunta sem resposta oficial: "${pergunta.slice(0, 200)}"`, texto).catch(() => null)
  return { ok: true, classe, texto, link: enviarLink, perguntaPendente: pergunta, optOut: classe === "nao" }
}
