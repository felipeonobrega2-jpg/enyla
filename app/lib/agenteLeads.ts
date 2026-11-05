// Agente de leads: filtra quem chega pelo anúncio como o Felipe faria e, no modo automático, responde sozinho.
// Aqui ficam só as travas duras (o que nunca sai sem você). O julgamento — quem é ICP, o que dizer —
// está no texto "Filtro de leads" das Configurações, que a IA lê antes de responder.

export type PerfilLead = "icp" | "medio" | "pequeno" | "indefinido" | "nao_lead"

export type LeadAvaliado = {
  perfil: PerfilLead
  quantidade_total: number | null   // quantidade total do lote que o lead disse
  motivo: string
}

export const ROTULO_PERFIL: Record<PerfilLead, string> = {
  icp: "ICP: 5 mil+",
  medio: "Lead 1 a 5 mil",
  pequeno: "Lead pequeno",
  indefinido: "Lead: falta volume",
  nao_lead: "Não é lead",
}

// Etiqueta que a conversa recebe (aparece na lista do WhatsApp e no funil)
export const ETIQUETA_PERFIL: Partial<Record<PerfilLead, string>> = { icp: "ICP", medio: "Lead médio", pequeno: "Lead pequeno" }

export type AgenteAuto = {
  ligado: boolean
  esperaSeg?: number          // espera o lead terminar de digitar antes de responder (padrão 20 s)
  maxPorDia?: number          // respostas automáticas por conversa em 24 h (padrão 6)
}

export type RegistroAgente = {
  em: string
  jid: string
  nome: string | null
  perfil: PerfilLead
  enviou: boolean
  texto: string
  motivo: string              // por que enviou ou por que segurou
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

// Mensagens separadas por linha em branco viram envios separados (no máximo 3)
export const partesDaResposta = (r: string) => r.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean).slice(0, 3)

// Respostas automáticas do WhatsApp Business ("fora do horário") não contam como você na conversa
export const ehMensagemAutomaticaDoWhatsapp = (t: string | null) => !!t && /^estou fora do hor[aá]rio/i.test(t.trim())

// Filtro inicial, tirado das conversas reais do Felipe com os leads do anúncio (04/11/2026). Fica editável em Configurações.
export const FILTRO_PADRAO = `QUEM É O NOSSO CLIENTE
- Somos gráfica offset. O ponto ótimo é 5.000 unidades no lote total; dentro de 5 mil dá para fazer de 4 a 6 modelos diferentes (depende de quantos cabem numa chapa).
- Referência que eu passo: a caixinha padrão de 100ml (fundo automático, verniz, papel 300g) em 5 mil unidades sai R$ 0,85 a unidade. Não passe nenhum outro valor.
- Pedido mínimo: em torno de 1.000 no total. Regra: quanto menor a caixa, maior precisa ser a quantidade (caixinha de 15ml: umas 1.000 de cada modelo).

FAIXAS
- Menos de 1.000 no total (10, 30, 50, 100, 500…): não é nosso cliente. É a maioria dos leads do anúncio.
- 1.000 a 4.999: atendemos, mas deixe claro que o custo unitário fica mais alto ("é padrão de indústria: quanto menor a quantidade, maior o custo unitário"). Siga levantando os dados.
- 5.000 ou mais, ou recorrente (ex.: 3 mil por semana, 20 mil por mês): cliente ideal. Levante os dados e me chame (decisao_sua): eu assumo.
- "Estou começando/lançando agora" sozinho não desqualifica; o que desqualifica é a quantidade.

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
- Contato do parceiro de impressão digital: (preencha aqui nome e telefone). Se estiver sem contato, diga que vou passar o contato dele e marque decisao_sua.
- Diga para falar que veio através de mim, Felipe da ENYLA, que ele dá desconto. Deseje boa sorte ("todo começo é assim mesmo").
- Depois disso não insista e não faça follow-up. Se ele topar 1.000 ("1000 então"), vira lead normal.

O QUE NÃO FAZEMOS
- Só rótulo/etiqueta: não. Se for caixa + rótulo, fazemos a caixa e ajudamos com o rótulo por parceiro.
- Hot stamping em poucas unidades: nenhuma gráfica offset faz (só o clichê já encarece). Sugira simular o hot stamping na arte, em impressão digital.

LEVANTAR DADOS (1.000 ou mais)
- O que vai na caixa (ml), medidas do frasco ou da caixa (altura x largura x profundidade), quantos modelos/artes, quantidade total, acabamento (verniz, hot stamping, papel metalizado ou triplex 300g), se já tem arte.
- Uma ou duas perguntas por vez. Com tudo em mãos: "vou preparar o seu orçamento" e decisao_sua.

O QUE EU FALO PARA CLIENTE BOM
- Somos um hub comercial: tenho o fornecedor de frasco mais barato do país (importa direto da China), essência (um químico que importa a matéria-prima), válvula e envase. Não coloco nenhum centavo em cima; ganho só nas caixas.
- Prazo médio de produção: de 7 a 14 dias úteis.
- Estamos em São Paulo: Barueri e Brás.
- Amostra, visita, ligação: só eu decido (decisao_sua).

NÃO É LEAD
- Fornecedor (papel, frasco, válvula, essência, gráfica, colagem), parceiro, cliente com pedido em andamento, conversa pessoal: não responda (decisao_sua).`

export const filtroEfetivo = (t?: string | null) => t?.trim() || FILTRO_PADRAO
