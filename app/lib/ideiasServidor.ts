// Ideias que o sistema (ou o Claude, a pedido seu) põe no seu banco de ideias. Entra uma vez por lote (marca no
// servidor) e nunca duplica: o que você já apagou ou marcou não volta.
import { mudarConfig } from "./configAtomica"
import type { Ideia, GastoFixo } from "../config"

const LOTES: { v: number; ideias: string[] }[] = [
  { v: 1, ideias: [
    "Marketing: atribuição dos leads do WhatsApp. Com uma campanha só gastando, o lead já conta para ela no relatório. Com duas ou mais, mandar o anúncio com mensagem pronta diferente por campanha (ou um parâmetro no link) para cada lead cair na campanha certa.",
    "Marketing: 120 dos 191 leads da semana não disseram o volume. Testar no anúncio a mensagem pronta já com a quantidade (\"Quero orçamento de ___ caixinhas\") ou botões de quantidade (até 500 / 1.000 a 5.000 / 5.000+).",
    "Marketing: o F1 de quem não disse o volume pergunta direto a quantidade, com faixas para responder com um toque.",
    "Marketing: manter a verba da campanha TESTAR NOVAMENTE até ter uns 7 dias de dado limpo (custo por MQL caiu de R$ 43,94 para R$ 16,42, mas a semana anterior teve só 2 MQL).",
    "Marketing: dos 28 MQL da semana, 5 viraram orçamento. Ver por que os outros 23 não viraram (o Hoje já mostra \"Orçamento para fazer\"); meta de orçar todo MQL em até 24 h.",
    "Robustez: teste A/B de mensagens (abertura e F2). O agente alterna duas versões e fica com a de maior taxa de resposta.",
    "Robustez: alarme de queda. Taxa de resposta ou número de leads caindo 30% de um dia para o outro, anúncio parado ou WhatsApp desconectado viram aviso no seu WhatsApp.",
    "Robustez: vigia do WhatsApp. Mais de 10 min sem mensagem chegando no horário comercial: confere a conexão da Evolution e avisa.",
    "Robustez: revisão semanal das conversas que esfriaram. A IA aponta onde o agente errou e você aprova as correções na base de conhecimento.",
    "Robustez: backup diário da configuração crítica (pedidos digitais, aprendizado, guia, contatos) com histórico para voltar atrás.",
    "Digital: Asaas para o Pix confirmar na hora (webhook) e abrir cartão parcelado no sinal e no restante.",
    "Digital: recompra automática. 45 dias depois da entrega, o agente oferece repetir o pedido com a mesma arte e o mesmo preço.",
  ] },
  { v: 2, ideias: [
    "Robustez (prioridade): proteger o sistema. Cópia diária da configuração (preços, contatos, conhecimento da IA, próximos passos, pedidos digitais) guardando 30 dias, com botão \"voltar para ontem\" em Configurações. E aviso no seu WhatsApp quando algo para: WhatsApp 2 h sem receber mensagem no horário comercial, Asaas recusando o aviso de pagamento ou envio automático falhando.",
  ] },
  { v: 3, ideias: [
    "Robustez (prioridade): aviso de WhatsApp fora do ar. Em 10/11, das 05:50 às 08:58, o número caiu da Evolution (VPS evo.enyla.com.br) e nenhum lead foi respondido até você ler o QR de novo. Checar a Evolution a cada 5 min e, se não responder ou o número desconectar, avisar no seu e-mail e no WhatsApp pessoal (por fora da Evolution).",
  ] },
  { v: 4, ideias: [
    "PWA (app no celular): o sistema vira um ícone na tela do iPhone, com notificação do próprio sistema que abre direto na conversa ou no pedido (no lugar do ntfy). Começar por: Meta sem crédito, venda realizada do digital e novo MQL ou ICP.",
  ] },
  { v: 5, ideias: [
    // 12/11: extraídas das suas anotações (conversa "Felipe Nobrega" e grupo "Day Note")
    "Produção: bipar os pedidos. Ler o QR da OS com o celular avança o pedido de fase e avisa o cliente sozinho.",
    "Produção: foto do pedido em cada fase (impressão, corte, colagem, expedição), que aparece no acompanhamento do cliente.",
    "Produção: comentários dentro de cada pedido, para registrar combinados e conversar com quem ajuda.",
    "Produção: visão em tabela dos pedidos, escolhendo as colunas que aparecem.",
    "Produção: descrição de cada pedido (modelos, formato, referência), que aparece no portal do cliente para ele reconhecer e pedir de novo com um clique.",
    "Produção: estoque de papel e de facas, para saber o que tem antes de orçar e comprar.",
    "Produção: juntar pedidos pequenos de clientes diferentes na mesma chapa (lote coletivo), para atender tiragem menor sem perder margem.",
    "Produção (corrigir): o sistema trata cortes e vincos antigos como se todos tivessem sido no mesmo fornecedor (Fabiano). Conferir o histórico de fornecedores por etapa.",
    "Produção: controle de projetos e pessoas (estilo Monday) para freelancers, como designers.",
    "Fornecedores: hub de fornecedores (contatos, serviços, preços e prazos de cada um num lugar só).",
    "Orçamento: número de cores entrando no cálculo do orçamento.",
    "Orçamento: fazer vários orçamentos de uma vez (lote de orçamentos).",
    "Proposta: mockup 3D (Pacdora) e fotos de trabalhos já feitos dentro da proposta e da página de aprovação.",
    "Proposta: termos e condições também no offset, com aceite antes do sinal (como já é no digital).",
    "Vendas: previsão do dia e do mês com probabilidade por estágio (20%, 50%, 70%), oportunidades por dia e plano de receita do mês.",
    "Vendas: tempo que o cliente espera pelo orçamento (do pedido de preço até a proposta), para baixar ao máximo.",
    "Vendas: o agente reorganiza os leads toda semana (etiquetas, etapa, quem retomar).",
    "Vendas: página de captura de leads fora do WhatsApp (site/Google) que leva para a conversa.",
    "Pós-venda: pedir avaliação no Google depois da entrega e usar as avaliações na proposta (“veja nossas avaliações no Google”).",
    "Pós-venda: biblioteca com as artes de todos os modelos já feitos, por cliente.",
    "Clientes: e-mail do cliente para avisar quando o orçamento está para vencer e cobrar saldo em aberto com o link de pagamento pronto, até pagar.",
    "Financeiro: contas a pagar, cartão de crédito, saldo de cada conta e dívidas da empresa num lugar só (como o Conttigo, adaptado para a Enyla).",
    "Financeiro: lançar despesa mandando uma mensagem (WhatsApp ou Telegram); a IA entende e lança.",
    "Financeiro: exportar o DRE para planilha.",
    "Gestão: indicadores de saúde da empresa: quantos orçamentos para uma venda, ciclo financeiro (pagar fornecedor x receber do cliente), tempo médio de entrega e pedidos fechados por semana.",
    "Gestão: concentração do faturamento, quanto depende de um cliente só.",
    "Gestão: planejamento e fechamento do mês, com lembrete no penúltimo domingo para planejar o mês seguinte.",
    "Gestão: metas com capa visual (imagem por tema), editáveis.",
    "Gestão: assistente pessoal pelo WhatsApp: você manda a mensagem e o agente resolve (consulta, lança, avisa).",
    "Marketing: agente de posts que alimenta o Instagram da Enyla com os trabalhos.",
  ] },
]

// Gastos fixos que o sistema põe uma vez (marca no servidor); apagou ou editou, não volta
const GASTOS_FIXOS: { v: number; gastos: GastoFixo[] }[] = [
  { v: 1, gastos: [
    { id: "sis-railway", nome: "Railway (servidor do WhatsApp)", categoriaId: "assinaturas", valor: 30, diaVencimento: 10, ativa: true,
      obs: "Plano Hobby, US$ 5/mês no cartão (valor em reais aproximado, com IOF). Roda a Evolution, que liga o WhatsApp ao sistema: se a cobrança falhar, o agente para de responder." },
  ] },
]

// Textos de ideias do sistema corrigidos depois de entrar (a tela mostra o texto novo; o resto da ideia fica igual)
const CORRECOES: { id: string; texto: string }[] = [
  { id: "sis-3-0", texto: novoTexto(3, 0) },
]
function novoTexto(v: number, i: number) { return LOTES.find(l => l.v === v)!.ideias[i] }
const CORRECAO_V = 1

export async function talvezAdicionarIdeias() {
  const ultimo = LOTES.at(-1)!.v
  await mudarConfig((d: Record<string, unknown> & { ideias?: Ideia[]; ideiasDoSistemaV?: number; ideiasCorrecaoV?: number }) => {
    if ((d.ideiasCorrecaoV ?? 0) < CORRECAO_V && (d.ideiasDoSistemaV ?? 0) >= ultimo) {
      const map = new Map(CORRECOES.map(c => [c.id, c.texto]))
      return { ideias: (d.ideias ?? []).map(i => map.has(i.id) ? { ...i, texto: map.get(i.id)! } : i), ideiasCorrecaoV: CORRECAO_V }
    }
    const v = d.ideiasDoSistemaV ?? 0
    if (v >= ultimo) return null
    const ja = new Set((d.ideias ?? []).map(i => i.texto))
    const agora = new Date().toISOString()
    const novas: Ideia[] = LOTES.filter(l => l.v > v).flatMap(l => l.ideias.filter(t => !ja.has(t)).map((texto, i) => ({ id: `sis-${l.v}-${i}`, texto, status: "ideia" as const, criadaEm: agora })))
    return { ideias: [...novas, ...(d.ideias ?? [])], ideiasDoSistemaV: ultimo, ideiasCorrecaoV: CORRECAO_V }
  })
}

export async function talvezAdicionarGastosFixos() {
  const ultimo = GASTOS_FIXOS.at(-1)!.v
  await mudarConfig((d: Record<string, unknown> & { gastosFixos?: GastoFixo[]; gastosFixosDoSistemaV?: number; gastosFixosDoSistemaEm?: string }) => {
    const v = d.gastosFixosDoSistemaV ?? 0
    if (v >= ultimo) return null
    const ja = new Set((d.gastosFixos ?? []).map(g => g.id))
    const novos = GASTOS_FIXOS.filter(l => l.v > v).flatMap(l => l.gastos.filter(g => !ja.has(g.id)))
    return { gastosFixos: [...(d.gastosFixos ?? []), ...novos], gastosFixosDoSistemaV: ultimo, gastosFixosDoSistemaEm: new Date().toISOString() }
  })
}
