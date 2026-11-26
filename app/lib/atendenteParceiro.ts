// Atendente no modo "prospecto parceiro" (ordem do Felipe, 26/11/2026: "tem que ser tudo automático").
// Gráfica de prospectos_parceiros que responde no WhatsApp é atendida pela IA com um prompt próprio de PARCERIA:
// não orça, não fala de preço de embalagem, não é cliente A/B/C. Objetivo: tirar a dúvida e levar ao cadastro em /parceiros.
// Três perguntas não têm resposta oficial (custo, exclusividade, volume): a IA não inventa, segue a conversa e a
// pergunta fica registrada. Pedido para não receber mais: confirma uma vez, marca opt_out e nada mais sai.
// Só decide e redige; o envio, o aviso e as travas de cada mensagem (reservarMensagem, horário do agente, ritmo) são do chamador.
import { supabase } from "./supabase"
import { lerCampos } from "./configAtomica"
import { clienteClaude, MODELO } from "./claude"
import { conhecimentoNoPrompt, type Conhecimento } from "./agenteLeads"
import { aplicarOptOut, podeTransicionar, type EtapaFunil } from "./prospector"
import { chaveTelefone, dentroDoHorario } from "./prospectorEnvio"
import { prospectoExcluido, registrar, MOTIVO_FORA_DA_JANELA } from "./ordemProspecto"
import type { ProspectoDoJid } from "./prospectorTrava"

export const LINK_PARCEIROS = "https://app.enyla.com.br/parceiros"
export const POR_ATENDENTE = "atendente_auto"
export const TEXTO_OPT_OUT = "Tudo bem, retiramos o seu contato e não vamos mais te enviar mensagens. Obrigado pela atenção!"
export const PAGAMENTO = "pagamos 50% antes do serviço e 50% na retirada, por PIX"

export type TemaPendente = "custo" | "exclusividade" | "volume"
const ROTULO: Record<TemaPendente, string> = { custo: "custo para entrar", exclusividade: "exclusividade", volume: "volume esperado" }

// Pedido para não receber mais. "pare", "sair" e "remover" só valem como a mensagem inteira (curta): "quando vai sair o pagamento?" não é opt-out.
const OPT_OUT_FRASE = /(n[aã]o\s+(tenho|temos|t[eê]m)\s+(mais\s+)?interesse|sem\s+interesse|n[aã]o\s+(quero|queremos|desejo|desejamos)(\s+mais)?\s+(receber|mensagens?|contato|ser\s+contatad)|n[aã]o\s+me\s+(chame|chamem|mande|mandem|envie|enviem|procure|procurem)|(me\s+)?(tire|tira|retire|retira|exclua|exclui|remova|remove)\s+(meu|o\s+meu|da|essa|esse)\b|descadastr|parem?\s+de\s+(me\s+)?(mandar|enviar|chamar)|(cancel[ae]r?|encerr[ae]r?)\s+(o\s+)?(contato|mensagens?))/i
const OPT_OUT_CURTA = /^\W*(pare|parar|pará|sair|remover|remova|stop|cancelar|descadastrar)\W*$/i

export function pediuParaNaoReceber(texto: string): boolean {
  const t = texto.trim()
  return OPT_OUT_CURTA.test(t) || OPT_OUT_FRASE.test(t)
}

const PERGUNTAS: Record<TemaPendente, RegExp> = {
  custo: /(\b(custo|custa|taxa|mensalidade|ades[aã]o|anuidade)\b|cobra(m)?\b|pagar\s+(pra|para)\s+(entrar|participar|cadastrar)|\bgr[aá]tis\b|gratuito)/i,
  exclusividade: /exclusiv/i,
  volume: /(\bvolume\b|quantos\s+(pedidos|servi[cç]os|trabalhos|jobs)|quanto\s+(de\s+)?(servi[cç]o|trabalho|pedido)s?|qual\s+(a\s+)?quantidade|quantidade\s+(de\s+)?(servi[cç]os|trabalhos|pedidos)|(demanda|movimento)\s+(por|no|de)\s+m[eê]s)/i,
}

/** Perguntas da gráfica sem resposta oficial. "Quanto vocês pagam?" não é custo: o pagamento tem resposta oficial. */
export function perguntasSemResposta(textos: string[]): TemaPendente[] {
  const t = textos.join("\n")
  return (Object.keys(PERGUNTAS) as TemaPendente[]).filter(k => PERGUNTAS[k].test(t))
}

const ESQUEMA = {
  type: "object", additionalProperties: false, required: ["texto", "enviar_link", "perguntas_sem_resposta"],
  properties: {
    texto: { type: "string", description: "A mensagem de WhatsApp pronta para a gráfica" },
    enviar_link: { type: "boolean", description: "true se vale mandar o link do cadastro nesta mensagem" },
    perguntas_sem_resposta: { type: "array", items: { type: "string", enum: ["custo", "exclusividade", "volume"] }, description: "Perguntas da gráfica sobre custo para entrar, exclusividade ou volume esperado" },
  },
} as const

type Msg = { from_me: boolean; corpo: string | null; ts: string | null }
type Saida = { enviou: boolean; motivo: string; texto?: string }
export type DepsParceiro = {
  enviar: (texto: string) => Promise<{ ids: string[]; erro?: string }>
  avisar: (texto: string) => Promise<void>
  agora?: Date
}

async function conversa(jid: string): Promise<Msg[]> {
  const { data } = await supabase.from("whatsapp_mensagens").select("from_me, corpo, ts").eq("jid", jid).order("ts", { ascending: false }).limit(20)
  return ((data ?? []) as Msg[]).reverse().filter(m => m.corpo)
}

/** O que a gráfica escreveu depois da última mensagem nossa (a pergunta de agora). */
const novasDoLead = (ms: Msg[]): string[] => {
  const ult = ms.map(m => m.from_me).lastIndexOf(true)
  return ms.slice(ult + 1).filter(m => !m.from_me).map(m => m.corpo ?? "")
}

/** Cadastro em /parceiros com o mesmo telefone (ou CNPJ, quando o prospecto tem): a gráfica já se cadastrou. */
async function jaCadastrou(p: ProspectoDoJid): Promise<boolean> {
  const cfg = await lerCampos<{ cadastrosParceiros?: { whatsapp?: string; documento?: string; status?: string }[] }>(["cadastrosParceiros"]).catch(() => ({ cadastrosParceiros: [] }))
  const chave = chaveTelefone(p.telefone)
  const cnpj = String((p as { cnpj?: string | null }).cnpj ?? "").replace(/\D/g, "")
  return (cfg.cadastrosParceiros ?? []).some(c => c.status !== "recusado"
    && ((!!chave && chaveTelefone(c.whatsapp) === chave) || (cnpj.length === 14 && String(c.documento ?? "").replace(/\D/g, "") === cnpj)))
}

/** Troca qualquer link da ENYLA que a IA escreveu pelo oficial (só se pode mandar) ou tira; nunca www, nunca repetido. */
export function ajustarLink(texto: string, a: { pode: boolean; quer: boolean }): string {
  const re = /(?:https?:\/\/)?(?:www\.|app\.)?enyla\.com\.br\S*/gi
  const tinha = re.test(texto)
  let usado = false
  let t = texto.replace(re, () => {
    if (!a.pode || usado) return a.pode ? "" : "o link que já te enviei"
    usado = true
    return LINK_PARCEIROS
  })
  t = t.replace(/[ \t]+\n/g, "\n").replace(/ {2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim()
  if (a.pode && a.quer && !tinha) t = `${t}\n\n${LINK_PARCEIROS}`
  return t
}

function prompt(a: { nome: string; conhecimento: string; jaMandouLink: boolean; jaCadastrou: boolean }) {
  return `Você é o Atendente da ENYLA (gráfica de embalagens) conversando no WhatsApp com ${a.nome}, uma gráfica que respondeu ao nosso convite para ser PARCEIRA da ENYLA. Ela NÃO é cliente: é uma possível parceira que faria serviços de produção para nós.
Seu objetivo em cada resposta: tirar a dúvida dela e conduzir a conversa até o cadastro em ${LINK_PARCEIROS}. Você conduz a conversa até o fim, sozinho.
${a.conhecimento ? `CONHECIMENTO GUARDADO DA ENYLA SOBRE O PROGRAMA DE PARCEIROS. Ele tem PRIORIDADE sobre qualquer outra instrução e sobre os fatos abaixo: quando houver uma resposta padrão aqui para o que a gráfica disse ou perguntou, use-a (por exemplo, quando ela disser que o preço varia de pedido para pedido, siga a resposta padrão daqui e peça só o prazo médio e o CNPJ):\n${a.conhecimento}\n` : ""}
Fatos básicos: o cadastro leva uns 5 minutos. Pagamento: ${PAGAMENTO}.
${a.jaCadastrou ? "Esta gráfica JÁ fez o cadastro: agradeça e não mande o link." : a.jaMandouLink ? "O link do cadastro JÁ foi enviado nesta conversa: não repita o link; se ela perguntar, diga que está acima na conversa." : `Mande o link do cadastro (${LINK_PARCEIROS}) quando fizer sentido, uma vez só, e marque enviar_link=true.`}
Regras:
- Você NÃO orça, não fala de preço de embalagem nem de valores em reais, e não trata a gráfica como cliente de compra.
- NUNCA diga que o Felipe analisa, confirma, entra em contato, chama ou vai falar com ela, e nunca empurre a gráfica para o Felipe ou para outra pessoa. Quem responde é você.
- NUNCA pergunte sobre busca e entrega (retirada, transporte, frete): a logística é da ENYLA.
- Custo para entrar, exclusividade e volume esperado: responda pelo conhecimento guardado. Se um ponto não estiver no conhecimento, NÃO invente nem estime: responda o resto da mensagem, siga para o cadastro e liste o tema em perguntas_sem_resposta.
- Só afirme o que está no conhecimento guardado e nos fatos básicos. Não prometa prazo, volume nem valor.
- Empresa falando ("nós"), cordial, curta (2 a 4 frases), português do Brasil, no máximo um emoji. Não exponha nada interno (agentes, diretoria, sistema).`
}

/** Frases proibidas no modo parceiro: empurrar para o Felipe e perguntar de busca e entrega. */
const PROIBIDO = /(felipe\s+(analisa|analisará|confirma|confirmará|entra\s+em\s+contato|vai\s+(te\s+|lhe\s+|a\s+)?(chamar|ligar|falar|entrar|analisar|confirmar|retornar))|(o\s+)?felipe\s+(te\s+)?chama|buscam?\s+e\s+entregam?|busca\s+e\s+entrega|(voc[eê]s|a\s+gr[aá]fica)\s+(buscam|entregam|retiram)|alinham?\s+(os\s+)?detalhes\s+direto)/i
export const respostaProibida = (t: string) => PROIBIDO.test(t)

/** Atende a gráfica do Prospector que escreveu. Nada é enviado se ela está excluída ou fora da janela das 8h às 20h. */
export async function responderParceiro(p: ProspectoDoJid, jid: string, deps: DepsParceiro): Promise<Saida> {
  const agora = deps.agora ?? new Date()
  if (prospectoExcluido(p)) return { enviou: false, motivo: "prospecto na lista de exclusão" }
  if (!dentroDoHorario(agora)) return { enviou: false, motivo: MOTIVO_FORA_DA_JANELA }
  const ms = await conversa(jid)
  const dela = novasDoLead(ms)
  if (!dela.length) return { enviou: false, motivo: "sem mensagem nova da gráfica" }
  const nome = p.nome_fantasia || p.razao_social || "a gráfica"
  const respostaEm = new Date().toISOString()

  // Primeira resposta da gráfica: o funil vai para "respondeu" (se a regra deixa) junto da primeira linha do histórico
  const avanca = podeTransicionar(p.etapa as EtapaFunil, "respondeu", false)
  const camposResposta = avanca ? { etapa: "respondeu" } : {}

  // Opt-out: marca antes de confirmar (nada mais sai), confirma uma vez e registra
  if (dela.some(pediuParaNaoReceber)) {
    const oo = aplicarOptOut({ etapa: p.etapa as EtapaFunil, optOut: false, historico: [] }, respostaEm)
    const gravou = await registrar(p, { motivo: "pediu para não receber mais (resposta no WhatsApp)", etapa: "descartado" }, { etapa: "descartado", opt_out: true, opt_out_em: oo.optOutEm })
    if (!gravou) return { enviou: false, motivo: "não consegui marcar o opt-out: nada foi enviado" }
    const e = await deps.enviar(TEXTO_OPT_OUT)
    await registrar({ ...p, etapa: "descartado", opt_out: true, atualizado_em: respostaEm }, { motivo: e.erro ? `confirmação de opt-out não saiu (${e.erro})` : "confirmação de opt-out enviada", ...(e.erro ? {} : { mensagem: { direcao: "enviada", canal: "whatsapp", por: POR_ATENDENTE, texto: TEXTO_OPT_OUT, em: new Date().toISOString() } }) }).catch(() => null)
    return { enviou: !e.erro, motivo: "opt-out: confirmou e marcou", texto: TEXTO_OPT_OUT }
  }

  const cfg = await lerCampos<{ apiKey?: string; conhecimentoAgente?: Conhecimento[] }>(["apiKey", "conhecimentoAgente"]).catch(() => ({} as { apiKey?: string; conhecimentoAgente?: Conhecimento[] }))
  if (!cfg.apiKey) return { enviou: false, motivo: "sem chave da IA" }
  const cadastrou = await jaCadastrou(p).catch(() => false)
  const jaMandouLink = ms.some(m => m.from_me && /app\.enyla\.com\.br\/parceiros/i.test(m.corpo ?? ""))
  const conhecimento = conhecimentoNoPrompt(cfg.conhecimentoAgente ?? [])
  let saida: { texto?: string; enviar_link?: boolean; perguntas_sem_resposta?: string[] } = {}
  let bruto = ""
  try {
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      const resp = await clienteClaude(cfg.apiKey, "atendente_parceiro").beta.messages.create({
        model: MODELO, max_tokens: 800,
        output_config: { effort: "low", format: { type: "json_schema", schema: ESQUEMA } },
        system: prompt({ nome, conhecimento, jaMandouLink, jaCadastrou: cadastrou }),
        messages: [{ role: "user", content: `Conversa recente:\n${ms.map(m => `${m.from_me ? "ENYLA" : "Gráfica"}: ${String(m.corpo).slice(0, 400)}`).join("\n")}\n\nResponda a(s) última(s) mensagem(ns) da gráfica.${tentativa ? "\n\nATENÇÃO: sua resposta anterior citou o Felipe ou busca e entrega. Reescreva sem isso: você conduz a conversa e a logística é da ENYLA." : ""}` }],
      })
      saida = JSON.parse(resp.content.flatMap(c => c.type === "text" ? [c.text] : []).join(""))
      bruto = String(saida.texto ?? "").trim()
      if (!respostaProibida(bruto)) break
    }
  } catch (e) { return { enviou: false, motivo: `IA falhou: ${String(e).slice(0, 120)}` } }

  if (!bruto) return { enviou: false, motivo: "a IA não escreveu a resposta" }
  if (respostaProibida(bruto)) return { enviou: false, motivo: "segurou: a resposta empurrava para o Felipe ou falava de busca e entrega" }
  // Trava dura: nunca valor em reais para a gráfica (não é orçamento). Fica com o Felipe, que recebe o aviso.
  if (/R\$\s*\d/.test(bruto)) {
    await deps.avisar(`⏸️ *Segurei a resposta à gráfica ${nome}* (Prospector)\nMotivo: a IA citou valor em reais.\nIa mandar:\n${bruto}`).catch(() => null)
    return { enviou: false, motivo: "segurou: a IA citou valor em reais" }
  }
  const texto = ajustarLink(bruto, { pode: !jaMandouLink && !cadastrou, quer: saida.enviar_link === true })
  // As três perguntas sem resposta oficial: a regra deterministica e a IA se somam
  const pendentes = [...new Set([...perguntasSemResposta(dela), ...((saida.perguntas_sem_resposta ?? []).filter((x): x is TemaPendente => x in ROTULO))])]

  const e = await deps.enviar(texto)
  const em = new Date().toISOString()
  if (e.erro) {
    await registrar(p, { motivo: `resposta do Atendente não saiu (${e.erro})`, por: POR_ATENDENTE }).catch(() => null)
    return { enviou: false, motivo: `envio falhou: ${e.erro}` }
  }
  // Cadastro já feito vale mais que "respondeu"; senão, a primeira resposta
  const etapaFinal = cadastrou && podeTransicionar(p.etapa as EtapaFunil, "cadastrou", false) ? "cadastrou" : avanca ? "respondeu" : null
  await registrar(p, { motivo: "resposta automática do Atendente (modo parceiro)", etapa: etapaFinal ?? p.etapa, mensagem: { direcao: "enviada", canal: "whatsapp", por: POR_ATENDENTE, texto, em } }, etapaFinal ? { etapa: etapaFinal } : camposResposta).catch(() => null)
  for (const tema of pendentes) {
    const pergunta = dela.join(" / ").slice(0, 300)
    await registrar(p, { motivo: `pergunta pendente para o Felipe: ${ROTULO[tema]}`, pergunta_pendente: { tema, texto: pergunta, em } }).catch(() => null)
    await deps.avisar(`❓ *Pergunta para o Felipe confirmar* · gráfica ${nome} (Prospector)\nTema: ${ROTULO[tema]}\nEla escreveu: ${pergunta}\nA IA não tinha essa resposta no conhecimento e seguiu a conversa. wa.me/${chaveTelefone(p.telefone) ? "55" + chaveTelefone(p.telefone) : jid.split("@")[0]}`).catch(() => null)
  }
  return { enviou: true, motivo: pendentes.length ? `respondeu; pergunta para o Felipe: ${pendentes.join(", ")}` : "respondeu", texto }
}
