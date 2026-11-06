// Agente de leads: filtra quem chega pelo anúncio como o Felipe faria e, no modo automático, responde sozinho.
// Aqui ficam só as travas duras (o que nunca sai sem você). O julgamento — quem é ICP, o que dizer —
// está no texto "Filtro de leads" das Configurações, que a IA lê antes de responder.

export type PerfilLead = "icp" | "medio" | "oportunidade" | "pequeno" | "indefinido" | "nao_lead"

export type LeadAvaliado = {
  perfil: PerfilLead
  quantidade_total: number | null   // quantidade total do lote que o lead disse
  motivo: string
  fornecedor?: boolean              // contato é fornecedor (papel, frasco, gráfica…), não cliente
}

export const ROTULO_PERFIL: Record<PerfilLead, string> = {
  icp: "ICP: 5 mil+",
  medio: "Lead 1 a 5 mil",
  oportunidade: "Oportunidade: outros produtos",
  pequeno: "Lead pequeno",
  indefinido: "Lead: falta volume",
  nao_lead: "Não é lead",
}

// Etiqueta que a conversa recebe (aparece na lista do WhatsApp e no funil)
export const ETIQUETA_PERFIL: Partial<Record<PerfilLead, string>> = { icp: "ICP", medio: "Lead médio", oportunidade: "Oportunidade", pequeno: "Lead pequeno" }

export type AgenteAuto = {
  ligado: boolean
  esperaSeg?: number          // espera o lead terminar de digitar antes de responder (padrão 20 s)
  maxPorDia?: number          // respostas automáticas por conversa em 24 h (padrão 6)
  vitrine?: string            // mensagem do Instagram, mandada uma vez a cada lead depois da primeira resposta
  avisoNumero?: string        // número que recebe o aviso de MQL no WhatsApp (vazio = o seu próprio chat "Você")
  pequenoParceiro?: boolean   // lead pequeno (menos de 1.000): indica o parceiro digital (padrão) · false: você vende em digital
}

// Aviso de lead bom, mandado no seu WhatsApp: quem é, o que quer e o link para abrir a conversa
export function textoAvisoMql(a: { nome: string | null; telefone: string | null; perfil: PerfilLead; quantidade: number | null; motivo: string; resumo?: string }) {
  const rotulo = a.perfil === "icp" ? "ICP" : a.perfil === "oportunidade" ? "Oportunidade" : "Lead médio"
  return [
    `🟢 *Novo MQL* · ${rotulo}${a.quantidade ? ` · ${a.quantidade.toLocaleString("pt-BR")} un` : ""}`,
    a.nome ? `*${a.nome}*` : null,
    a.resumo || null,
    a.motivo,
    a.telefone ? `wa.me/${a.telefone}` : null,
  ].filter(Boolean).join("\n")
}

export const VITRINE_PADRAO = "Dá uma olhada no nosso Instagram: instagram.com/enyla.embalagens"

// O lead já viu o Instagram? (você mandou, ou a mensagem de ausência do WhatsApp Business já trouxe o link)
export const jaViuVitrine = (minhas: (string | null)[]) => minhas.some(t => !!t && /instagram\.com\/enyla/i.test(t))

export type RegistroAgente = {
  em: string
  jid: string
  nome: string | null
  perfil: PerfilLead
  enviou: boolean
  texto: string
  motivo: string              // por que enviou ou por que segurou
  passo?: string              // "F1", "F2", "F3", "Sem resposta" (follow-up)
}

export type ContextoEnvio = {
  ligado: boolean
  resposta: string
  alerta: string
  podeSozinho: boolean        // a IA achou seguro mandar sem você
  lead: LeadAvaliado
  conversaNova: boolean       // primeira mensagem do contato há poucos dias (não é fornecedor/cliente antigo)
  clienteCadastrado: boolean
  manualRecente: boolean      // você mandou mensagem nos últimos minutos: você está na conversa
  enviadasHoje: number
  maxPorDia: number
  jaEncerrouPequeno: boolean  // o agente já explicou e indicou o parceiro para este lead pequeno
  emMql?: boolean             // já está em MQL: daqui em diante quem atende é você
  precosDoFiltro: string[]    // valores em R$ que estão escritos no filtro (os únicos que podem sair)
}

// Valores em reais citados num texto ("R$ 0,85", "R$500", "0,85 centavos")
export function valoresEmReais(t: string): string[] {
  const out = new Set<string>()
  for (const m of t.matchAll(/R\$\s*([\d.]+(?:,\d{1,2})?)/gi)) out.add(m[1].replace(/\./g, ""))
  for (const m of t.matchAll(/\b(\d+,\d{2})\s*centavos/gi)) out.add(m[1])
  return [...out]
}

// Pode sair sem você? Devolve o motivo quando não pode.
export function travaDoEnvio(c: ContextoEnvio): string | null {
  if (!c.ligado) return "modo automático desligado"
  if (!c.resposta.trim()) return "nada a responder"
  if (c.lead.perfil === "nao_lead") return "não é lead"
  if (c.emMql) return "MQL: você atende"
  if (ehQualificado(c.lead.perfil)) return "bom negócio: foi para MQL, você atende"
  if (c.clienteCadastrado) return "cliente cadastrado: fica com você"
  if (!c.conversaNova) return "contato antigo: fica com você"
  if (c.manualRecente) return "você está nessa conversa agora"
  if (c.alerta !== "nenhum" && c.alerta !== "preco") return `precisa de você (${c.alerta})`
  if (!c.podeSozinho) return "a IA pediu para você decidir"
  if (c.enviadasHoje >= c.maxPorDia) return `já respondeu ${c.enviadasHoje}× hoje`
  if (c.jaEncerrouPequeno && c.lead.perfil === "pequeno") return "lead pequeno já foi orientado"
  if (c.resposta.length > 900) return "resposta longa demais"
  const permitidos = new Set(c.precosDoFiltro)
  const fora = valoresEmReais(c.resposta).filter(v => !permitidos.has(v))
  if (fora.length) return `citou valor que não está no filtro (R$ ${fora.join(", ")})`
  return null
}

// ── Etiquetas e etapas que o agente organiza ─────────────────────────────────
// Lead bom → MQL (você atende, sem o contato perceber a troca). Lead ruim → Descartado.
// Sem resposta → F1, F2, F3 e, por fim, Sem resposta (vai para Perdido).

export const ETIQUETAS_AGENTE = {
  mql: "MQL", descartado: "Descartado", digital: "Digital", f1: "F1", f2: "F2", f3: "F3", semResposta: "Sem resposta",
} as const
export const COR_ETIQUETA_AGENTE: Record<string, string> = {
  "MQL": "#009351", "Descartado": "#a0a0aa", "Digital": "#c2410c", "F1": "#c57800", "F2": "#d56a00", "F3": "#d33a3c", "Sem resposta": "#7a7983",
  "ICP": "#009351", "Lead médio": "#8456e8", "Oportunidade": "#1f7ae0", "Lead pequeno": "#a0a0aa", "Reativação": "#0f8b8d",
}
const FOLLOW = ["F1", "F2", "F3"] as const
const DO_AGENTE: string[] = [...Object.values(ETIQUETAS_AGENTE), ...Object.values(ETIQUETA_PERFIL) as string[]]
export const ehEtiquetaDoAgente = (e: string) => DO_AGENTE.includes(e)

// Bom negócio: caixa em volume ou outros produtos do ramo em que você ganha (frasco, essência, válvula, envase)
export const ehQualificado = (p: PerfilLead) => p === "icp" || p === "medio" || p === "oportunidade"

// Depois de avaliar o lead: etiquetas novas (as suas ficam) e a etapa do funil (null = não mexe)
// digital: você vende o lead pequeno em impressão digital (etiqueta Digital, não vai para Descartado)
export function organizarLead(atuais: string[], perfil: PerfilLead, digital = false): { etiquetas: string[]; etapa: "mql" | "descartado" | null } {
  const suas = atuais.filter(e => !DO_AGENTE.includes(e))
  const perf = ETIQUETA_PERFIL[perfil]
  if (ehQualificado(perfil)) return { etiquetas: [...suas, ETIQUETAS_AGENTE.mql, perf!], etapa: "mql" }
  if (perfil === "pequeno" && digital) return { etiquetas: [...suas, ETIQUETAS_AGENTE.digital, perf!], etapa: null }
  if (perfil === "pequeno") return { etiquetas: [...suas, ETIQUETAS_AGENTE.descartado, perf!], etapa: "descartado" }
  // Indefinido: mantém o que já tinha (inclusive F1/F2/F3); não é lead: não mexe
  return { etiquetas: atuais, etapa: null }
}

// O lead respondeu: sai do follow-up
export const semFollowUp = (atuais: string[]) => atuais.filter(e => !(FOLLOW as readonly string[]).includes(e) && e !== ETIQUETAS_AGENTE.semResposta)

// Horas desde a sua última mensagem para o próximo passo (F1 3 h; F2 1 dia depois; F3 3 dias depois; Sem resposta 4 dias depois)
export const HORAS_FOLLOW = { F1: 3, F2: 24, F3: 72, fim: 96 }

export type PassoFollowUp = { tipo: "mensagem"; nivel: 1 | 2 | 3; etiquetas: string[] } | { tipo: "encerrar"; etiquetas: string[] }

export function proximoFollowUp(atuais: string[], horasDesdeSuaUltima: number): PassoFollowUp | null {
  const nivel = FOLLOW.reduce((n, f, i) => atuais.includes(f) ? i + 1 : n, 0)
  const resto = atuais.filter(e => !(FOLLOW as readonly string[]).includes(e))
  if (atuais.includes(ETIQUETAS_AGENTE.semResposta)) return null
  if (nivel === 3) return horasDesdeSuaUltima >= HORAS_FOLLOW.fim ? { tipo: "encerrar", etiquetas: [...resto, ETIQUETAS_AGENTE.semResposta] } : null
  const proximo = (nivel + 1) as 1 | 2 | 3
  const espera = [HORAS_FOLLOW.F1, HORAS_FOLLOW.F2, HORAS_FOLLOW.F3][nivel]
  return horasDesdeSuaUltima >= espera ? { tipo: "mensagem", nivel: proximo, etiquetas: [...resto, FOLLOW[nivel]] } : null
}

// Follow-up só em horário comercial (8h às 20h de São Paulo)
export const horarioDeFollowUp = (d = new Date()) => {
  const h = Number(d.toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false }))
  return h >= 8 && h < 20
}

// Mensagens separadas por linha em branco viram envios separados (no máximo 3)
export const partesDaResposta = (r: string) => r.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean).slice(0, 3)

// Respostas automáticas do WhatsApp Business ("fora do horário") não contam como você na conversa
export const ehMensagemAutomaticaDoWhatsapp = (t: string | null) => !!t && /^estou fora do hor[aá]rio/i.test(t.trim())

// Filtro inicial, tirado das conversas reais do Felipe com os leads do anúncio (04/11/2026). Fica editável em Configurações.
export const FILTRO_PADRAO = `OBJETIVO
Descobrir os bons negócios e poupar o meu tempo. Bom negócio é caixa em volume OU os outros produtos do ramo em que eu também ganho: frasco, essência, válvula, envase, produto pronto (frasco + essência + caixa). Lead ruim eu não quero ver; lead bom eu quero receber já qualificado.

QUEM É O NOSSO CLIENTE
- Somos gráfica offset. O ponto ótimo é 5.000 unidades no lote total; dentro de 5 mil dá para fazer de 4 a 6 modelos diferentes (depende de quantos cabem numa chapa).
- Referência que eu passo: a caixinha padrão de 100ml (fundo automático, verniz, papel 300g) em 5 mil unidades sai R$ 0,85 a unidade. Não passe nenhum outro valor.
- Pedido mínimo: em torno de 1.000 no total. Regra: quanto menor a caixa, maior precisa ser a quantidade (caixinha de 15ml: umas 1.000 de cada modelo).

FAIXAS
- Menos de 1.000 no total (10, 30, 50, 100, 500…): não é nosso cliente. É a maioria dos leads do anúncio.
- 1.000 a 4.999: atendemos, mas deixe claro que o custo unitário fica mais alto ("é padrão de indústria: quanto menor a quantidade, maior o custo unitário"). Siga levantando os dados.
- 5.000 ou mais, ou recorrente (ex.: 3 mil por semana, 20 mil por mês): cliente ideal. Levante os dados e me chame (decisao_sua): eu assumo.
- Quer frasco, essência, válvula, envase ou o produto pronto em volume (1.000 unidades ou mais, ou recorrente): é oportunidade, mesmo que a caixa seja pouca. Levante o que ele precisa (o quê, quantos, com que frequência, quanto paga hoje) e me chame.
- Outros produtos em pouca quantidade (100 frascos, 300 essências…) NÃO são oportunidade: nesses produtos eu também só ganho em volume. Continua lead pequeno.
- Rótulo/etiqueta não conta como oportunidade (não fazemos; ver O QUE NÃO FAZEMOS). "Comprei 750 rótulos" com 100 caixas é lead pequeno.
- "Estou começando/lançando agora" sozinho não desqualifica; o que desqualifica é o volume do negócio todo.

PRIMEIRA MENSAGEM (lead que chega: "gostaria de saber mais sobre as caixinhas", "posso encomendar?", "boa tarde")
Oi, tudo bem? aqui é o Luiz Felipe, da Jerograf / ENYLA👋 Você já tá vendendo seu produto ou tá lançando agora? E que volume você precisa?

RESPOSTAS QUE EU USO
- Pedido mínimo / quantidade mínima: "O pedido mínimo depende do tamanho da caixa, mas geralmente fica em torno de 1.000. A regra é: quanto menor a caixa, maior precisa ser a quantidade. Qual volume você precisa?"
- Preço sem quantidade: "O valor depende da quantidade e do tamanho da embalagem. O que você precisa?" Se insistir numa média, passe a referência de R$ 0,85 em 5 mil da caixinha de 100ml.
- Tabela de preço / catálogo: não temos. Fabricamos sob demanda: qualquer tamanho, material, acabamento e fecho. Só preciso das medidas e da quantidade.
- Outros produtos (cueca, vela, cosmético, café…): fazemos qualquer tipo de embalagem personalizada.
- Arte: a gente cria a arte também.
- A pergunta que importa é a QUANTIDADE TOTAL. Sem ela, não avance para medidas e acabamentos.

LEAD PEQUENO (menos de 1.000)
- Não gaste tempo. Uma mensagem só, cordial e curta: nossa impressão é offset e não roda essa quantidade; para isso o ideal é impressão digital, e eu tenho um parceiro que faz poucas unidades (com verniz à base d'água).
- Na mesma mensagem, deixe a porta aberta para o resto: se ele precisar de frasco, essência, válvula ou envase, eu tenho fornecedor direto e consigo ajudar. Só vira oportunidade se for em volume (1.000+ ou recorrente); pouca quantidade continua lead pequeno.
- Contato do parceiro de impressão digital (faz poucas unidades): (11) 96843-7324. Passe o número na mensagem.
- Diga para ele falar que veio pelo Luiz, da ENYLA, e pedir o meu cupom quando for fechar. Deseje boa sorte ("todo começo é assim mesmo").
- Depois disso não insista e não faça follow-up. Se ele topar 1.000 ("1000 então"), vira lead normal.

O QUE NÃO FAZEMOS
- Só rótulo/etiqueta: não. Se for caixa + rótulo, fazemos a caixa e ajudamos com o rótulo por parceiro.
- Hot stamping em poucas unidades: nenhuma gráfica offset faz (só o clichê já encarece). Sugira simular o hot stamping na arte, em impressão digital.

LEVANTAR DADOS (1.000 ou mais)
- O que vai na caixa (ml), medidas do frasco ou da caixa (altura x largura x profundidade), quantos modelos/artes, quantidade total, acabamento (verniz, hot stamping, papel metalizado ou triplex 300g), se já tem arte.
- Uma ou duas perguntas por vez. Com tudo em mãos: "vou preparar o seu orçamento" e decisao_sua.

O QUE EU FALO PARA CLIENTE BOM
- Somos um hub comercial: tenho o fornecedor de frasco mais barato do país (importa direto da China), essência (um químico que importa a matéria-prima), válvula e envase. Consigo montar o produto completo: frasco, essência, envase e caixa.
- Prazo médio de produção: de 7 a 14 dias úteis.
- Estamos em São Paulo: Barueri e Brás.
- Amostra, visita, ligação: só eu decido (decisao_sua).

NÃO É LEAD
- Fornecedor (papel, frasco, válvula, essência, gráfica, colagem), parceiro, cliente com pedido em andamento, conversa pessoal: não responda (decisao_sua). Se for fornecedor, marque fornecedor = true.`

export const filtroEfetivo = (t?: string | null) => t?.trim() || FILTRO_PADRAO

// Você vende o lead pequeno em impressão digital: troca a regra de indicar o parceiro por levantar os dados do orçamento
export const SECAO_DIGITAL = `LEAD PEQUENO (menos de 1.000): VENDEMOS EM IMPRESSÃO DIGITAL
- Poucas unidades a gente também faz, em impressão digital: triplex 300g com laminação fosca ou brilhante, arte inclusa (nossa designer cria). Não indique outra gráfica e não passe contato de parceiro.
- Pedido mínimo: em offset fica em torno de 1.000; abaixo disso, de 20 a 500 caixas, a gente faz em impressão digital.
- O que precisa para o orçamento: a quantidade e o ml do frasco (ou as medidas da caixa: altura x largura x profundidade). Pergunte o que faltar, uma coisa por vez.
- Não escreva preço da impressão digital: com a quantidade e o ml (ou as medidas), o sistema manda o orçamento com o link do sinal de 50% pelo Pix. Depois que ele foi, você pode repetir os valores que estão nele.
- Frete: calculado no final do pedido, pelo CEP. Prazo: começa depois do sinal; a designer manda a arte para ele aprovar antes de imprimir.
- Hot stamping em digital não dá: sugira simular o hot stamping na arte.
- Deixe a porta aberta para frasco, essência, válvula ou envase (só vira oportunidade em volume: 1.000+ ou recorrente).
- Se ele topar 1.000 ou mais, vira lead normal (offset).`
export function filtroDoModo(filtro: string, parceiro: boolean): string {
  if (parceiro) return filtro
  const faixa = filtro.replace(/^- Menos de 1\.000 no total[^\n]*$/m, "- Menos de 1.000 no total: atendemos em impressão digital (ver LEAD PEQUENO).")
  const sec = /^LEAD PEQUENO[^\n]*\n[\s\S]*?(?=\n\n[A-ZÇÃÕÉÊÍÓÚ][A-ZÇÃÕÉÊÍÓÚ ]+\n|(?![\s\S]))/m
  return sec.test(faixa) ? faixa.replace(sec, SECAO_DIGITAL) : `${faixa}\n\n${SECAO_DIGITAL}\n(Esta regra vale sobre qualquer outra sobre lead pequeno acima.)`
}
export const filtroDoAgente = (cfg: { filtroLeads?: string; agenteAuto?: { pequenoParceiro?: boolean } }) =>
  filtroDoModo(filtroEfetivo(cfg.filtroLeads), cfg.agenteAuto?.pequenoParceiro !== false)

// ── Conhecimento que o agente aprende com os seus atendimentos (agenteAprende) ──
export type Conhecimento = { id: string; tema: string; texto: string; em: string }

export const TEMAS = ["preco", "produto", "fornecedor", "prazo", "processo", "venda", "objecao", "recusa", "outro"] as const
export const ROTULO_TEMA: Record<string, string> = {
  preco: "Preço", produto: "Produto", fornecedor: "Fornecedor", prazo: "Prazo", processo: "Processo",
  venda: "Como vende", objecao: "Objeção", recusa: "O que recusa", outro: "Outro",
}
// Texto que vai no prompt do atendente
export function conhecimentoNoPrompt(itens: Conhecimento[] | undefined) {
  if (!itens?.length) return ""
  const porTema = new Map<string, string[]>()
  for (const i of itens) porTema.set(i.tema, [...(porTema.get(i.tema) ?? []), i.texto])
  return [...porTema].map(([t, l]) => `${ROTULO_TEMA[t] ?? t}:\n${l.map(x => `- ${x}`).join("\n")}`).join("\n\n")
}


// ── Economia de IA sem mudar a resposta ──────────────────────────────────────
// Primeiro contato que é só a mensagem pronta do anúncio (ou um "oi"): a resposta é sempre a sua saudação do filtro.
// Sai sem chamar a IA. Qualquer coisa a mais (pergunta, quantidade, áudio, foto) vai para a IA normalmente.
const SO_ABERTURA = /^(ol[aá]|oi+|opa|e a[ií]|bom dia|boa tarde|boa noite|tudo bem\??|ol[aá],? gostaria (?:de|se) saber mais sobre as caixinhas\.?|posso encomendar\??|ol[aá],? gostaria de solicitar um or[cç]amento\.?|tenho interesse|quero saber mais|informa[cç][oõ]es)[\s!.,?]*$/i

export function saudacaoDoFiltro(filtro: string): string | null {
  const m = filtro.match(/PRIMEIRA MENSAGEM[^\n]*\n([^\n]+)/)
  const t = m?.[1]?.trim()
  return t && !t.startsWith("-") ? t : null
}

export function soAbertura(msgs: { from_me: boolean; corpo: string | null; tipo: string }[]) {
  const doLead = msgs.filter(m => !m.from_me)
  const minhas = msgs.filter(m => m.from_me && !ehMensagemAutomaticaDoWhatsapp(m.corpo))
  return doLead.length > 0 && doLead.length <= 3 && minhas.length === 0
    && doLead.every(m => m.tipo === "text" && !!m.corpo && SO_ABERTURA.test(m.corpo.trim()))
}

// Sem crédito na Anthropic (mensagem da API): o agente avisa você e segue só com o que não precisa de IA
// (também o limite de gasto que você configura no console: "You have reached your specified API usage limits")
export const ehSemCredito = (erro: string) => /credit balance is too low|billing|usage limit/i.test(erro)

// ── Marcos por conversa: o que as regras precisam lembrar por semanas ─────────
// O registro (agenteLog) guarda só os últimos eventos, para a tela; com o volume do anúncio ele cobre ~1 dia.
// Follow-up (14 dias), reativação (45 dias) e "já orientou o lead pequeno" leem daqui.
export type MarcoConversa = {
  em: string                                         // último evento do agente nesta conversa
  passos?: Record<string, string>                    // F1/F2/F3/Sem resposta (tentado), Reativação/Pequeno (enviado), Respondeu → quando
  segurou?: { em: string; motivo: string } | null    // resposta que o agente deixou para você (some quando ele envia)
}
export type Marcos = Record<string, MarcoConversa>
export const DIAS_MARCO = 15
export const DIAS_MARCO_REATIVACAO = 46

export function marcar(m: Marcos, r: RegistroAgente, agora = Date.now()): Marcos {
  const out: Marcos = {}
  for (const [jid, x] of Object.entries(m)) {
    const reativ = x.passos?.["Reativação"]
    if (agora - new Date(x.em).getTime() < DIAS_MARCO * 86_400_000 || (reativ && agora - new Date(reativ).getTime() < DIAS_MARCO_REATIVACAO * 86_400_000)) out[jid] = x
  }
  const e: MarcoConversa = { ...(out[r.jid] ?? {}), em: r.em, passos: { ...(out[r.jid]?.passos ?? {}) } }
  const p = r.passo
  if (p && /^F\d$|^Sem resposta$|^Respondeu$/.test(p)) e.passos![p] = r.em
  if (p === "Reativação" && r.enviou) e.passos!["Reativação"] = r.em
  if (r.enviou && r.perfil === "pequeno") e.passos!["Pequeno"] = r.em
  if (!p) e.segurou = r.enviou ? null : { em: r.em, motivo: r.motivo.slice(0, 80) }
  out[r.jid] = e
  return out
}

// Primeira vez: monta a partir do registro que existe (do mais velho para o mais novo)
export const marcosDoRegistro = (log: RegistroAgente[], agora = Date.now()) => [...log].reverse().reduce((m, r) => marcar(m, r, agora), {} as Marcos)
