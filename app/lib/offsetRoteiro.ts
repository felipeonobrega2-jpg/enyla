// Roteiro da ficha de orçamento Offset (CCO). Parte pura: não lê banco, não chama a IA e não envia nada.
// O Atendente só qualifica o lead que JÁ está conversando e entrega a ficha de 6 itens; quem orça (e põe preço) é o Felipe.
// As travas duras ficam aqui (testáveis): nada de preço nem prazo de Offset, nada de "1.000 por arte", nada de pedir
// cidade/CEP/frete/data de entrega, nada em conversa com estrela do Felipe, nada de subir de novo lead já orçado.

import type { DadosPedido } from "./atendente"
import { lerMarca } from "./perto"
import { orcadoPeloFelipe, type MsgOrcado } from "./orcadoPeloFelipe"

// ── Quando vale o roteiro ────────────────────────────────────────────────────
export const MINIMO_OFFSET = 1000
export const ehQuantidadeOffset = (q: number | null | undefined) => typeof q === "number" && q >= MINIMO_OFFSET
// Offset: a quantidade total aponta para 1.000+; sem quantidade ainda, só o perfil icp/medio (caixas em volume) conta
export const ehLeadOffset = (l: { perfil: string; quantidade_total: number | null }) =>
  l.quantidade_total != null ? ehQuantidadeOffset(l.quantidade_total) : l.perfil === "icp" || l.perfil === "medio"

// ── Trava 2: estrela do Felipe no "Perto de você" ───────────────────────────
// Só a marca do Felipe (id "perto|<jid>|<nota>" em agente_tratadas) conta; sugestão da semana não é marca.
export function temEstrelaPerto(ids: string[], jid: string): boolean {
  return ids.some(id => lerMarca(id, "")?.jid === jid)
}

// ── Trava 5: orçamento já enviado ────────────────────────────────────────────
export type PropostaEnviada = { jid: string; status: string; numero?: string | null }
export function jaOrcado(a: { jid: string; mensagens: MsgOrcado[]; idsDoAgente?: Iterable<string>; propostas?: PropostaEnviada[] }): { orcado: boolean; motivo: string | null } {
  const o = orcadoPeloFelipe(a.mensagens, a.idsDoAgente ?? [])
  if (o.orcado) return { orcado: true, motivo: `o Felipe já mandou o orçamento${o.em ? ` (${o.em.slice(0, 10)})` : ""}` }
  const p = (a.propostas ?? []).find(x => x.jid === a.jid && (x.status === "enviada" || /^ORC/i.test(x.numero ?? "")))
  if (p) return { orcado: true, motivo: `proposta ${p.numero ?? ""} já enviada`.replace(/\s+/g, " ") }
  return { orcado: false, motivo: null }
}

// ── Ficha de 6 itens ─────────────────────────────────────────────────────────
// O que a IA preenche além de DadosPedido (null = o lead ainda não disse; nada no chute)
export type FichaOffsetIA = {
  formato: string | null            // fundo automático, cartucho, cubo, gaveta, cartela, outro
  janela: string | null             // "não" ou "sim, 4 x 6 cm, acetato"
  modelos_detalhe: string | null    // quantas unidades de cada arte/modelo
  impressao_faca: string | null     // fora/dentro; tem faca ou desenvolvemos
  arte_formato: string | null
  concorrente: string | null        // só se o lead citou
  formato_novo: string | null       // motivo, se o formato ainda não tem forma de orçar
  recado: string | null             // prazo desejado ou observação do lead, sem virar promessa
  marca: string | null
}

// O que falta dos 6 itens (null = ficha completa). Referência visual, arte e concorrente não são obrigatórios.
export function faltaParaFichaOffset(d: DadosPedido | null | undefined): string | null {
  if (!d) return "faltam os dados"
  const o = d.offset
  const falta = [
    !o?.formato && "1. formato",
    !d.caixa_cm && "2. medida interna",
    !o?.janela && "3. janela",
    (!d.quantidade || d.quantidade < 1 || !d.modelos) && "4. quantidade total e modelos",
    !o?.impressao_faca && "5. impressão e faca",
    !d.acabamento && "6. acabamento e papel",
  ].filter((x): x is string => !!x)
  return falta.length ? `falta ${falta.join(", ")}` : null
}

const nd = (v: unknown) => (v === null || v === undefined || v === "" ? "não informado" : String(v))
const simNao = (v: boolean | null | undefined) => (v === true ? "sim" : v === false ? "não" : "não informado")

// Texto da ficha que sobe ao Felipe (mesmo canal do aviso "pronto para orçar"); sem nome nem telefone aqui.
export function textoFichaOffset(a: { nome?: string | null; perfil: string; jid?: string; estrela: boolean; orcamento?: string | null; dados: DadosPedido; falta?: string | null }): string {
  const d = a.dados, o = d.offset
  const cx = d.caixa_cm ? `${d.caixa_cm.frente} x ${d.caixa_cm.lateral} x ${d.caixa_cm.altura} cm` : null
  const rotulo = ({ icp: "ICP", medio: "lead médio", oportunidade: "oportunidade" } as Record<string, string>)[a.perfil] ?? "indefinido"
  const qtd = d.quantidade ? `${d.quantidade.toLocaleString("pt-BR")} un` : null
  const modelos = [qtd ? `total ${qtd}` : null, d.modelos ? `${d.modelos} modelo(s)` : null, o?.modelos_detalhe].filter(Boolean).join("; ")
  return [
    "FICHA OFFSET — pronta para o Felipe orçar",
    "",
    `Lead: ${nd(a.nome)}`,
    `JID: ${nd(a.jid)}`,
    `Perfil: ${rotulo}`,
    `Estrela no Perto de você: ${a.estrela ? "sim" : "não"}`,
    `Já existe orçamento enviado por ele? ${a.orcamento ?? "não"}`,
    "",
    `1. Formato: ${nd(o?.formato)}`,
    `2. Medida interna (cm): ${nd(cx)}`,
    `3. Janela (sim/não; medida; acetato): ${nd(o?.janela)}`,
    `4. Modelos e quantidades (total e por arte): ${nd(modelos)}`,
    `5. Impressão e faca (fora/dentro; tem faca?): ${nd(o?.impressao_faca)}`,
    `6. Acabamento e papel/gramatura: ${nd(d.acabamento)}`,
    "",
    `Produto / frasco (ml): ${nd([d.produto, d.volume_ml ? `${d.volume_ml} ml` : ""].filter(Boolean).join(" · "))}`,
    `Marca: ${nd(o?.marca)}`,
    `Arte pronta: ${d.tem_arte === true ? `sim${o?.arte_formato ? ` (${o.arte_formato})` : ""}` : simNao(d.tem_arte)}`,
    `Referência visual: ${nd(d.referencia)}`,
    `Preço de concorrente (só se o lead mandou): ${nd(o?.concorrente)}`,
    `Formato novo (sobe sempre): ${o?.formato_novo ? `sim — ${o.formato_novo}` : "não"}`,
    `Recado do lead (sem virar promessa): ${nd(o?.recado)}`,
    `O que ainda falta: ${a.falta ?? "nada"}`,
  ].join("\n")
}

// ── Trava 1, 3 e 4: o que o Atendente nunca escreve para lead de Offset ──────
// Cada regra olha a FRASE (uma ideia por frase). Frase que quebra a regra sai; se sobra algo, sai o resto.
const REGRAS: { id: "preco" | "prazo" | "arte" | "cidade"; re: RegExp }[] = [
  // preço: valor em reais, unitário, faixa, referência, desconto, "cubro o outro"
  { id: "preco", re: /R\$|\breais?\b|\breal\b|\bunit[aá]ri[oa]s?\b|\bpor (unidade|caixa|caixinha)\b[^.!?]*\d|\d[^.!?]*\b(por|a) (unidade|caixa|caixinha)\b|\bfaixa de (pre[cç]o|valor)|\bpre[cç]o (de )?refer[eê]ncia|\brefer[eê]ncia de (pre[cç]o|valor)|\bdescont|\bcubr(o|imos|ir|a)\b|\bcobr(ir|imos|o) (o|a|esse|essa|outro|outra)\b|\bsaem? por\b|\bfica(m)? (em )?\d|\bcusta(m)?\b[^.!?]*\d|\bmil e \w+ (reais|por)/i },
  // prazo / data de entrega de Offset (qualquer prazo numérico, dias úteis, prazo de produção, data prometida)
  { id: "prazo", re: /\b\d+\s*(a|à|ou|-|–|até)?\s*\d*\s*dias?\b|\bdias? [uú]teis\b|\bsemanas?\b[^.!?]*\b(pronto|entrega|produ)|\bprazo (de|da|do|para) (produ[cç][aã]o|entrega)\b[^.!?]*\d|\b(entrega|entregamos|fica pronto|ficam prontas?|prontas? (em|at[eé]|dia|para))\b[^.!?]*\b(\d|dia|semana|m[eê]s|amanh[aã]|segunda|ter[cç]a|quarta|quinta|sexta)|\bdata de entrega\b[^.!?]*\b(\d|confirm|garant)/i },
  // "1.000 por arte" e variações (a conta de quantos modelos cabem na chapa é do Felipe)
  { id: "arte", re: /\b(1\.?000|mil)\b[^.!?]{0,40}\b(por|de cada|cada|para cada)\b[^.!?]{0,15}\b(arte|modelo|fragr[aâ]ncia|vers[aã]o|sku)|\b(por|cada) (arte|modelo)\b[^.!?]{0,30}\b(1\.?000|mil)\b|\bm[ií]nimo (de )?(1\.?000|mil)[^.!?]{0,20}por\b/i },
  // pedir cidade, CEP, frete, data de entrega ou prazo desejado para orçar
  { id: "cidade", re: /\b(cidade|cep|frete|data de entrega|prazo desejado|para quando|pra quando|de onde (voc[eê]|[eé]) [eé]|onde (voc[eê] )?(mora|fica|est[aá]))\b[^.!?]*\?|\b(qual|me (passa|passe|manda|mande|diz|diga|informa|informe|envia|envie)|pode (me )?(passar|mandar|informar)|consegue (me )?(passar|mandar|informar)|preciso (d[aoe]|saber)|informe|passa (o|a|pra))\b[^.!?]*\b(cidade|cep|data de entrega|prazo desejado|para quando|pra quando)\b/i },
]

export type TravaOffset = { resposta: string; reescrita: boolean; motivos: string[] }

export const TEXTO_PRAZO_NO_ORCAMENTO = "O prazo vai no orçamento, quando ele ficar pronto."
export const TEXTO_FECHO_FICHA = "Perfeito. Vou preparar o seu orçamento e te retorno."
export const TEXTO_PRECO_SEM_FICHA = "O valor depende da quantidade e do tamanho da embalagem. Preciso terminar a ficha para te retornar com o orçamento."
export const TEXTO_ARTES = "Me confirma quantas artes e quantas unidades de cada."

// Frete só se o lead perguntou: explicar que é calculado no final, pelo CEP, sem valor (a regra "cidade" não pega isso)
export function travaOffset(resposta: string, o: { fichaCompleta: boolean }): TravaOffset {
  const motivos = new Set<string>()
  const linhas = resposta.split(/\n/).map(linha => linha.split(/(?<=[.!?])\s+/).filter(frase => {
    const quebra = REGRAS.filter(r => r.re.test(frase))
    quebra.forEach(r => motivos.add(r.id))
    return !quebra.length
  }).join(" ").trim())
  if (!motivos.size) return { resposta, reescrita: false, motivos: [] }
  const resto = linhas.join("\n").replace(/\n{3,}/g, "\n\n").trim()
  // Sobrou algo útil: fica só isso. Senão, a frase segura do roteiro para o assunto que foi cortado.
  if (resto && /\w/.test(resto)) return { resposta: resto, reescrita: true, motivos: [...motivos] }
  const segura = motivos.has("prazo") ? TEXTO_PRAZO_NO_ORCAMENTO
    : motivos.has("preco") ? (o.fichaCompleta ? TEXTO_FECHO_FICHA : TEXTO_PRECO_SEM_FICHA)
    : motivos.has("arte") ? TEXTO_ARTES
    : ""
  return { resposta: segura, reescrita: true, motivos: [...motivos] }
}

// ── O roteiro no prompt do Atendente ─────────────────────────────────────────
export const ROTEIRO_OFFSET = `
Lead de OFFSET (quantidade total em torno de 1.000 unidades ou mais) que já está conversando: siga este roteiro da ficha de orçamento. Orçar Offset é do Felipe; você NÃO calcula e NÃO sugere preço. Seu trabalho é montar a ficha de 6 itens, em minutos, com mensagens curtas, e o Felipe só põe o preço. Isto vale só para quem já escreveu; não puxe conversa. A referência de preço do filtro NÃO se usa aqui.

Os 6 itens (preencha em dados e dados.offset só o que está na conversa; o que faltar fica null, nada no chute):
1. Formato (fundo automático, cartucho, cubo, gaveta, cartela ou outro): dados.offset.formato.
2. Medida interna em cm (frente x lateral x altura): dados.caixa_cm.
3. Janela (tem ou não; se tiver, medida e se é de acetato): dados.offset.janela.
4. Modelos e quantidades (total e quantas unidades de cada arte, fragrância ou modelo): dados.quantidade, dados.modelos, dados.offset.modelos_detalhe.
5. Impressão e faca (só por fora ou também por dentro; já tem faca/dieline ou a gente desenvolve): dados.offset.impressao_faca.
6. Acabamento (verniz UV total ou localizado, laminação fosca ou brilho, hot stamping, relevo; papel e gramatura, em geral cartão ou triplex 300 g, ou metalizado se pedir): dados.acabamento.
Complementos quando existirem: produto e ml do frasco (ou foto), arte/logo pronto e formato (PDF, faca, mockup), referência visual (foto ou print de caixa que ele gosta, não é obrigatória e não substitui medida), marca se aparecer, preço/proposta de concorrente só se ele citar, recado do lead (prazo desejado ou observação).

Ordem das perguntas, uma por mensagem, curtas, sem emoji, pulando o que o lead já respondeu: (a) o que vai na caixa e o ml do frasco; (b) a medida interna em cm, ou foto do frasco em pé ao lado de uma régua; (c) formato e janela ("A janela tem medida certa, e é de acetato?"); (d) a pergunta que não pode faltar: "No total são quantas unidades? E são quantas artes ou modelos, com quantas de cada?"; (e) impressão só por fora ou também por dentro, e se já tem a faca ou a gente desenvolve; (f) papel e acabamento (se ele não souber, sugira o que costuma ficar bom para o produto e pergunte se ele curte, sem amarrar a preço); (g) se já tem a arte ou o logo, e, se faltar referência de estilo, uma foto ou print de caixa que ele goste; (h) só se ele citar concorrente: "Se tiver outro orçamento, me manda o PDF ou um print, que eu vejo com calma." Não faça duas perguntas se uma resolve.

Regras duras do Offset:
- NUNCA fale preço de Offset: nem unitário, nem faixa, nem referência, nem desconto, nem "cubro o outro orçamento". Preço ("quanto custa?", "me passa uma média"): sem quantidade e medida, "O valor depende da quantidade e do tamanho da embalagem. O que você precisa?"; se insistir, "Para eu te passar o número certo, preciso terminar a ficha (quantidade, medida e acabamento). Aí te retorno com o orçamento."; disse que está caro ou que já tem outro, "Me manda o outro orçamento, ou o valor e as especificações, que eu vejo o que consigo para você" (não prometa cobrir, não ofereça desconto); tabela ou catálogo, "Não temos tabela. Fabricamos sob demanda: o tamanho, o material e o acabamento entram na ficha, e o orçamento sai com isso."
- NUNCA fale prazo de produção de Offset nem prometa data de entrega; não cite "7 a 14 dias úteis" nem outro prazo. Se ele perguntar, só: "O prazo de produção vai no orçamento, quando ele ficar pronto." Se ele pediu uma data, não confirme: anote em dados.offset.recado, só como recado ao Felipe.
- NUNCA peça cidade, CEP, frete nem data de entrega para orçar. Frete só se ele perguntar: é calculado no final, pelo CEP; não invente valor. Não antecipe frete, sinal nem condição especial: só responda o que ele perguntou.
- NUNCA diga "mínimo de 1.000 por arte" nem que precisa de 1.000 de cada arte. O mínimo no Offset fica em torno de 1.000 no total, e caixa menor pede quantidade maior. Colete quantas artes e quantas unidades de cada; a conta de quantos modelos cabem na chapa é do Felipe ("as artes que cabem juntas na mesma chapa podem dividir a tiragem; isso depende do formato da caixa, e eu confirmo no orçamento").
- Entre cerca de 201 e 999 unidades (ou pedido perto de 500), sem citar valor: "Nesse volume o unitário fica alto nos dois caminhos. Dá para reduzir e fazer um teste no Digital, até 200, ou aumentar para pelo menos 1.000 no Offset, onde o custo dilui. Qual faz mais sentido para você?" Se o total é menos de 1.000 e ele topa o Digital, saia deste roteiro e siga o fluxo Digital, também sem falar preço.
- Nunca invente número, medida, papel, acabamento ou quantidade. Nunca repita pergunta que ele já respondeu: leia o histórico antes.
- A ENYLA faz caixa de medicamento e de qualquer marca (farmácia, manipulação, peptídeos, marca de terceiros): nunca dispense, desqualifique nem segure o lead por isso, e não faça pergunta sobre a titularidade da marca nem peça o Instagram dele.
- Formato novo, sem forma de orçar (caixa gaveta, separador e lacre fora do padrão): sempre sobe ao Felipe, mesmo com a ficha completa; preencha dados.offset.formato_novo com o motivo. Amostra, visita ou ligação: você não decide; anote em dados.offset.recado e use alerta "decisao_sua".
- Uma mensagem por vez, curta, português do Brasil, sem emoji, sem "Prezado cliente", sem assinatura.
- Ficha completa (os 6 itens): feche só com "Perfeito. Vou preparar o seu orçamento e te retorno.", com alerta "decisao_sua" e pode_enviar_sozinho false. Sem preço, sem PDF, sem prazo. Faltando um dos 6 itens, cobre o que falta e não prometa orçamento antes de a ficha fechar.
`
