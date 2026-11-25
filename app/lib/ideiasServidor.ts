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
  { v: 6, ideias: [
    // 14/11: pedido seu
    "WhatsApp invertido: você manda mensagem (texto ou áudio) para o número da Enyla e o sistema executa. Ex.: \"pedido da Ana foi para impressão\" (move o pedido e avisa o cliente), \"recebi 500 do Bruno\" (lança o pagamento), \"orça 2.000 caixas 10x5x5 para a Perfumaria X\" (monta o orçamento), \"o WR é ICP\" (etiqueta), \"quanto falta receber essa semana?\" (responde). Só do seu número; o que mexe em dinheiro ou fala com cliente pede um \"ok\" antes; tudo fica no histórico. Base pronta: o assistente Forma já consulta, registra pagamento e move pedido com confirmação.",
  ] },
  { v: 7, ideias: [
    // 18/11: pedido seu (detalhes você passa depois)
    "Leads: separar o MQL em níveis (ex.: MQL forte, médio e fraco), inclusive para o digital, para priorizar o atendimento e medir o marketing por nível. Os critérios de cada nível você define depois.",
  ] },
  { v: 8, ideias: [
    // 18/11: pedido seu
    "Digital fora da A3 (caixa maior que a folha, quantidade acima da tabela, formato especial): o sistema manda mensagem ao Leandro em tom natural (\"Leandro, tem um cliente aqui querendo…\"), ele responde como dá para fazer e quanto custa, e cada resposta dele vira regra da tabela do digital. Assim o setor do digital vai sendo calibrado com o que a Villa realmente consegue fazer.",
  ] },
  { v: 9, ideias: [
    // 18/11: indicações do Claude, anotadas a pedido seu
    "PRIORIDADE — Dinheiro do digital no Financeiro: hoje o sinal e o restante pagos no digital (Asaas/InfinitePay) andam o pedido, mas nenhuma receita é lançada, então o DRE, o relatório gerencial em PDF e o Auditor de dados ficam sem o digital, e parte dos movimentos do banco sem conciliar deve ser isso. Fazer: (1) cada pagamento confirmado vira receita automática ligada ao DIG-xxxx, paga e com a data certa; (2) a taxa do cartão/Asaas entra como despesa, para a margem ser a real; (3) os pagamentos antigos do digital são lançados de uma vez (simulação primeiro, você roda); (4) a conciliação bancária sugere ligar o Pix do banco ao lançamento do digital; (5) DRE, relatório em PDF e Auditor passam a contar o digital.",
    "Parceiros: ao registrar um envio em Fornecedores, além do e-mail, sair a mensagem pronta no WhatsApp do parceiro com os dados e os arquivos do pedido (fecha o circuito da rede de parceiros).",
    "E-mails da ENYLA: definir qual e-mail recebe as respostas dos parceiros (hoje o remetente é parceiros@enyla.com.br, que pode não existir) ou criar o parceiros@ no Email Routing da Cloudflare; e gerar uma chave nova da Resend (a atual foi colada na conversa).",
    "Grandes negócios: deixar mais prático (você disse que ainda não está o ideal).",
    "Painel: juntar as listas de ação repetidas no topo (Para resolver agora, Precisa de você, Propostas) numa lista só.",
    "Parceiros ENYLA: os valores das notificações da página (R$ 2.480 / R$ 1.150) são ilustração; avaliar colocar um \"exemplo\" discreto e confirmar a promessa \"pagamento combinado antes de começar\". Trocar a foto do Unsplash por uma foto real da produção da ENYLA quando tiver.",
  ] },
  { v: 10, ideias: [
    // 19/11, anotadas a pedido seu
    "Digital maior que A3: pedir à Villa a tabela de preço para folha maior (SRA3 32×45 ou 33×48) e colocar no sistema. Hoje caixa que aberta passa do A3 (ex.: café 15×12×8, Master Bacth) fica \"sem preço na tabela\" e cai para você consultar; com a tabela, a IA cota sozinha.",
    "Proposta pronta na sua conversa: quando você responde um bom negócio e o cliente manda o dado que faltava (medida, quantidade, acabamento), o sistema lê, monta a proposta e ela volta para o topo da sua lista com \"Enviar\" (caso Samuel). Você só confirma.",
  ] },
  { v: 11, ideias: [
    // 20/11: plano "complexo organizado" (o Felipe: "vamos fazer tudo"), na ordem combinada: 3, 1, 2, 4, 5
    "ORGANIZAR 1 · Gaveta única: tirar do AppConfig (600 KB) o que não é configuração. Pedidos digitais, ideias, base de conhecimento, propostas e eventos em tabelas próprias; a configuração volta a ser só preços, metas e chaves. Mais rápido, mais barato e um erro numa tela não apaga o resto.",
    "ORGANIZAR 2 · Motores escondidos: um agendador único com a lista de rotinas (webhook de carona, vigia, relatório de segunda), frequência, última execução, duração e erro, numa tela do Escritório. Nada roda escondido nem em dobro.",
    "ORGANIZAR 3 · Uma caixa de entrada: juntar Para resolver agora, Precisa de você, Propostas e Hoje numa lista só por prioridade (dinheiro e bom negócio primeiro), com resolvido e lembrar depois; no WhatsApp, um resumo único em horários fixos no lugar dos avisos soltos.",
    "ORGANIZAR 4 · Um mundo de pedido: offset, digital e Cartuxo com as mesmas etapas (aprovado, arte, produção, pronto, enviado) e o dinheiro de todos no mesmo Financeiro.",
    "ORGANIZAR 5 · Etapa do lead num lugar só: status e etiquetas deixam de dizer coisas diferentes; as etiquetas viram consequência da etapa.",
  ] },
  { v: 12, ideias: [
    // 23/11, a pedido seu: celular deixa de travar melhoria; depois, uma rodada só dele
    "Versão otimizada para celular: uma rodada só para o celular das telas internas (caixa de entrada, Hoje, conversas, pedidos, Financeiro e o prédio em 2D), pensada para o uso rápido no dia a dia, com toque fácil e o essencial primeiro. Até lá, as melhorias saem pensando no computador.",
  ] },
  { v: 13, ideias: [
    "Custo de carga e descarga em pedido grande (Felipe, 25/11): quando o pedido é muito grande e vai em vários pallets, o motorista costuma cobrar ajudante de carga e descarga. Esse custo precisa entrar no orçamento junto do frete. O Felipe ainda vai pensar como fazer no sistema.",
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


// Subcategorias que o sistema cadastra uma vez (16/11, a pedido seu, tiradas dos seus lançamentos): só acrescenta,
// nunca tira o que você já tem. Depois disso você edita em Financeiro → Cadastros → Categorias.
const SUBCATEGORIAS: { v: number; despesa: Record<string, string[]>; receita: Record<string, string[]> } = {
  v: 1,
  despesa: {
    materiais: ["Papel", "Chapa", "Faca", "Clichê", "Kraft e fitas", "Cola", "Embalagem de envio"],
    aluguel: ["Galpão (produção)", "Escritório (Brás)", "Condomínio", "IPTU"],
    impostos: ["Simples Nacional (DAS)", "ISS", "ICMS", "IOF", "Outros tributos"],
    servicos: ["Contabilidade", "Designer", "Faquista (desenho)", "Jurídico", "Manutenção", "Tarifas bancárias"],
    outros: ["Refeição e lanche", "Mercado e mantimentos", "Ferramentas e equipamentos", "Diversos"],
    "gastos-fixos": ["Internet", "Telefone", "Energia", "Água", "Sistemas e softwares"],
    compras: ["Equipamentos", "Eletrônicos", "Móveis", "Material de escritório"],
    "pagamento-fornecedor": ["Conta Jerograf", "Gráfica", "Papel", "Acabamento", "Outros fornecedores"],
    "repassar-felipe": ["Alimentação", "Mercado", "Assinaturas", "Outros"],
    assinaturas: ["IA (Anthropic)", "Hospedagem e domínio (Vercel)", "Servidor do WhatsApp (VPS)"],
  },
  receita: {
    pedido: ["Offset", "Digital", "Revenda (frascos e essências)"],
    sinal: ["Offset", "Digital"],
    "saldo-final": ["Offset", "Digital"],
    parcela: ["Offset", "Digital"],
    outros: ["Rendimento", "Estorno", "Reembolso"],
    "comisses-de-parcerias": ["Frascos", "Essências", "Indicação"],
  },
}
type CatFin = { id: string; nome: string; subcategorias?: string[] }
export async function talvezCadastrarSubcategorias() {
  await mudarConfig((d: Record<string, unknown> & { categoriasDespesa?: CatFin[]; categoriasReceita?: CatFin[]; subcategoriasDoSistemaV?: number }) => {
    if ((d.subcategoriasDoSistemaV ?? 0) >= SUBCATEGORIAS.v) return null
    const juntar = (lista: CatFin[] | undefined, extra: Record<string, string[]>) => (lista ?? []).map(c => extra[c.id]
      ? { ...c, subcategorias: [...new Set([...(c.subcategorias ?? []), ...extra[c.id].filter(n => !(c.subcategorias ?? []).some(x => x.toLowerCase() === n.toLowerCase()))])] }
      : c)
    if (!d.categoriasDespesa && !d.categoriasReceita) return null
    return {
      categoriasDespesa: juntar(d.categoriasDespesa, SUBCATEGORIAS.despesa),
      categoriasReceita: juntar(d.categoriasReceita, SUBCATEGORIAS.receita),
      subcategoriasDoSistemaV: SUBCATEGORIAS.v, subcategoriasDoSistemaEm: new Date().toISOString(),
    }
  })
}
