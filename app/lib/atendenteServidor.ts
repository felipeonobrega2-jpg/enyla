// O atendente do WhatsApp no servidor: lê o guia, o filtro de leads e a conversa, e devolve a próxima mensagem
// no tom do Felipe, o que o cliente já contou do pedido e a avaliação do lead (ICP ou não).
// A tela usa para sugerir; o modo automático usa para responder sozinho (com as travas de agenteLeads).

import { lerConfigLinha } from "./configAtomica"
import { supabase } from "./supabase"
import { clienteClaude, FALLBACK, MODELO } from "./claude"
import { Vinculos } from "./vinculoWhatsapp"
import type { Atendimento } from "./atendente"
import { corrigirCumprimento } from "./atendente"
import { LeadAvaliado, filtroDoAgente, soAbertura, saudacaoDoFiltro } from "./agenteLeads"
import { aberturaPara, type TesteAbertura } from "./aberturaAB"
import { transcreverPendentes } from "./transcricao"
import { obterMidia } from "./midiaWhatsapp"
import { Conhecimento } from "./agenteAprende"
import { type EstiloFelipe } from "./estilo"
import { arquivosDoCliente, contextoDaConversa, historicoDaConversa, pedidoAtendente, type Bloco } from "./pedidoAtendente"


export type ResultadoAtendente = Atendimento & { momento?: "agora" | "com_ele" | "sem_pressa" | "nao_atende"; lead: LeadAvaliado; pode_enviar_sozinho: boolean; contraproposta?: { total: number | null; unitario: number | null } | null; uso?: { entrada: number; cache: number; gravouCache: number; saida: number } }

// Impressão digital curta (djb2) do que a IA leu
const assinar = (t: string) => { let h = 5381; for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0; return `${t.length}:${(h >>> 0).toString(36)}` }

export type ConversaLida = {
  nome: string | null
  clienteCadastrado: boolean
  primeiraEm: string | null          // primeira mensagem que temos desse contato
  mensagens: { id: string; from_me: boolean; corpo: string | null; tipo: string; ts: string }[]
}

type Cfg = { aberturaTeste?: TesteAbertura; apiKey?: string; guiaAtendimento?: string; filtroLeads?: string; agenteAuto?: { pequenoParceiro?: boolean }; vinculosWhatsapp?: Vinculos; conhecimentoAgente?: Conhecimento[]; estiloFelipe?: EstiloFelipe }

// Arquivos que o cliente mandou (foto do frasco com régua, desenho ou PDF da caixa): a IA vê junto da conversa,
// para tirar as medidas. Até 4, os mais recentes; o que não for imagem ou PDF (ex.: .cdr) fica de fora.

export async function lerConfigAtendente(): Promise<Cfg> {
  const { data } = await lerConfigLinha()
  return (data?.data ?? {}) as Cfg
}

export async function atender(jid: string, opts: { cfg?: Cfg; automatico?: boolean; followUp?: 1 | 2 | 3; outra?: boolean; reativar?: { dias: number; motivo: string }; coletandoMql?: string; atrasoMin?: number; assumir?: boolean } = {}): Promise<{ ok: true; r: ResultadoAtendente; conversa: ConversaLida } | { ok: false; erro: string; status: number }> {
  const cfg = opts.cfg ?? await lerConfigAtendente()
  if (!cfg.apiKey) return { ok: false, erro: "Chave da IA não configurada (Configurações).", status: 400 }

  // Áudios recentes sem transcrição: transcreve antes (você fala muito por áudio; sem isso a IA fica cega)
  const { data: recentes } = await supabase.from("whatsapp_mensagens").select("id, tipo, corpo").eq("jid", jid).order("ts", { ascending: false }).limit(12)
  const audios = (recentes ?? []).filter(m => (m.tipo === "audio" || m.tipo === "audioMessage") && !m.corpo).map(m => m.id)
  if (audios.length) await transcreverPendentes({ ids: audios }, 6).catch(() => null)

  const [{ data: conv }, { data: msgs }, { data: cards }, { data: primeira }] = await Promise.all([
    supabase.from("whatsapp_conversas").select("jid, nome, campanha, proxima_acao").eq("jid", jid).maybeSingle(),
    supabase.from("whatsapp_mensagens").select("id, from_me, corpo, tipo, ts").eq("jid", jid).order("ts", { ascending: false }).limit(50),
    supabase.from("KanbanCard").select("numero, nomeCliente, coluna, preco, quantidade, dimensoes, data"),
    supabase.from("whatsapp_mensagens").select("ts").eq("jid", jid).order("ts", { ascending: true }).limit(1).maybeSingle(),
  ])
  const mensagens = (msgs ?? []).reverse()
  if (!mensagens.length) return { ok: false, erro: "Conversa sem mensagens.", status: 404 }
  // Memória da conversa inteira: das mensagens mais antigas que as 50 de cima, só as que importam (valor, quantidade,
  // medida, prazo, pagamento, arte, proposta), para a IA não esquecer o que já foi combinado semanas atrás
  const historicoAnterior = (msgs?.length ?? 0) >= 50 ? await (async () => {
    const { data: antigas } = await supabase.from("whatsapp_mensagens").select("from_me, corpo, ts").eq("jid", jid).lt("ts", mensagens[0].ts).order("ts", { ascending: false }).limit(400)
    return resumoDoHistorico((antigas ?? []).reverse() as { from_me: boolean; corpo: string | null; ts: string }[])
  })().catch(() => "") : ""

  const { contexto, origem, clienteAtivo } = contextoDaConversa({ conv, cards: cards ?? [], vinculos: cfg.vinculosWhatsapp, mensagens, primeiraTs: primeira?.ts })

  // Tudo o que a IA lê (conversa inteira, cliente/pedidos, guia, filtro, o que aprendeu): se qualquer coisa
  // mudar, a resposta guardada não vale mais
  const assinatura = assinar(JSON.stringify([
    mensagens.map(m => [m.id, m.corpo]), contexto, cfg.guiaAtendimento ?? "", filtroDoAgente(cfg),
    (cfg.conhecimentoAgente ?? []).map(i => i.id), conv?.campanha ?? null,
  ]))
  const conversaLida: ConversaLida = { nome: conv?.nome ?? null, clienteCadastrado: clienteAtivo, primeiraEm: primeira?.ts ?? null, mensagens }
  const ultimaId = mensagens[mensagens.length - 1].id

  // 1. Já respondida para esta mesma última mensagem (pelo agente ou pela tela): reaproveita, sem pagar de novo
  const outraPergunta = !!opts.followUp || !!opts.reativar   // follow-up e retomada não reaproveitam nem guardam
  if (!outraPergunta && !opts.outra && conv?.proxima_acao) {
    try {
      const g = JSON.parse(conv.proxima_acao) as { assinatura?: string; auto?: boolean; r?: ResultadoAtendente }
      if (g.assinatura === assinatura && g.r?.lead && (g.auto || !opts.automatico)) return { ok: true, r: { ...g.r, uso: undefined }, conversa: conversaLida }
    } catch { /* texto antigo nesse campo: ignora */ }
  }
  // 2. Lead novo que só mandou a mensagem do anúncio (ou "oi"): a resposta é sempre a sua saudação do filtro
  // (teste A/B ligado: metade dos leads recebe a desafiante; cada lead sempre a mesma)
  const saudacaoA = saudacaoDoFiltro(filtroDoAgente(cfg))
  const saudacao = saudacaoA ? aberturaPara(jid, saudacaoA, cfg.aberturaTeste).texto : null
  if (!outraPergunta && !opts.outra && saudacao && !clienteAtivo && soAbertura(mensagens)) {
    const r: ResultadoAtendente = {
      resposta: saudacao, etapa: "primeiro_contato", alerta: "nenhum", motivo_alerta: "", sugere_video: false,
      dados: { itens: [], produto: "", volume_ml: null, caixa_cm: null, frasco_cm: null, quantidade: null, tem_arte: null, referencia: null, acabamento: null, modelos: null, resumo: "" },
      lead: { perfil: "indefinido", quantidade_total: null, motivo: "Primeiro contato (mensagem do anúncio): saudação do filtro, sem IA.", fornecedor: false },
      pode_enviar_sozinho: true, ultimaId,
    }
    return { ok: true, r, conversa: conversaLida }
  }

  const anexos = await arquivosDoCliente(mensagens, obterMidia).catch(() => ({ blocos: [] as Bloco[], numero: new Map<string, number>() }))
  const historico = historicoDaConversa(mensagens, anexos)


  const origemIA = opts.followUp ? "followup" : opts.reativar ? "retomada" : opts.assumir ? "assumir" : opts.atrasoMin ? "atendente-atrasada" : opts.automatico ? "atendente" : "tela-whatsapp"
  const pedido = pedidoAtendente({ modelo: MODELO, cfg, opts, contexto, origem, historico, historicoAnterior, blocos: anexos.blocos, nomeConversa: conv?.nome })
  const r = await clienteClaude(cfg.apiKey, origemIA).beta.messages.create({ ...pedido, ...FALLBACK })
  if (r.stop_reason === "refusal") return { ok: false, erro: "A IA não pôde responder a esse pedido.", status: 422 }
  const texto = r.content.flatMap(b => b.type === "text" ? [b.text] : []).join("")
  let a: Omit<ResultadoAtendente, "ultimaId">
  try { a = JSON.parse(texto) } catch { return { ok: false, erro: "A IA respondeu fora do formato. Tente de novo.", status: 502 } }
  if (a.resposta) a.resposta = corrigirCumprimento(a.resposta)
  const resultado: ResultadoAtendente = { ...a, ultimaId, uso: { entrada: r.usage.input_tokens, cache: r.usage.cache_read_input_tokens ?? 0, gravouCache: r.usage.cache_creation_input_tokens ?? 0, saida: r.usage.output_tokens } }
  // Guarda para reaproveitar enquanto não chegar mensagem nova (follow-up e retomada não: são outra pergunta)
  if (!outraPergunta) await supabase.from("whatsapp_conversas").update({ proxima_acao: JSON.stringify({ assinatura, ultimaId, auto: !!opts.automatico, em: new Date().toISOString(), r: { ...resultado, uso: undefined } }) }).eq("jid", jid)
  return { ok: true, r: resultado, conversa: conversaLida }
}

// Das mensagens antigas, as que carregam o que foi combinado (números, valores, medidas, prazos, pagamento, arte)
const IMPORTA = /\d|r\$|or[çc]amento|proposta|medida|tamanho|\bcm\b|\bml\b|unidade|caixa|prazo|entrega|frete|pix|sinal|pag|arte|logo|aprov|acabamento|verniz|lamina|hot|fosc|brilho|modelo/i
export function resumoDoHistorico(ms: { from_me: boolean; corpo: string | null; ts: string }[], maxLinhas = 60): string {
  const linhas = ms.filter(m => m.corpo && m.corpo.trim().length > 2 && IMPORTA.test(m.corpo)).map(m => {
    const quando = new Date(m.ts).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit" })
    return `${quando} ${m.from_me ? "EU" : "CLIENTE"}: ${m.corpo!.replace(/\s+/g, " ").slice(0, 220)}`
  })
  return linhas.slice(-maxLinhas).join("\n")
}
