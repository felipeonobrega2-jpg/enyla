export type TipoCaixa = "simples" | "aviao" | "fundo-automatico" | "americano"

export type FormatoPapel = {
  id: string
  nome: string
  largura: number // mm - folha inteira (interno)
  altura: number // mm - folha inteira (interno)
  precoPor100: number // R$
  larguraChapa: number // mm - meia folha (chapa real de impressão, interno)
  alturaChapa: number // mm - meia folha (chapa real de impressão, interno)
}

export type FormData = {
  nomeCliente: string
  tipoCaixa: TipoCaixa
  frente: number // cm
  lateral: number // cm
  alturaBox: number // cm
  abaColagem: number // cm
  incluirVerniz: boolean       // derivado de vernizTipo !== ""
  vernizTipo: string           // "UV Total" | "UV Localizado" | "Resinado" | "Holográfico" | ""
  laminacao: boolean
  laminacaoTipo: string        // "Fosca" | "Brilhante" | "Soft Touch" | "Holográfica" | ""
  acompanhamentos: string[]    // ["Berço interno", "Divisória", …]
  outrosAcabamentos: string[]  // ["Hot Stamping", "Alto Relevo", …]
  comFaca: boolean
  valorFaca: number
  numSKUs: number
  numArtes: number
  quantidades: number[]
  qualidades: Record<number, "Digital" | "Offset">
  customPecasChapa: number | null
  blankOverride: { largura: number; altura: number } | null  // mm — importado do DXF Pacdora
  obsInterna: string
  obsCliente: string
  validadeDias: number
  materialId: string
  materialNome: string
}

export type ResultadoFormato = {
  formatoId: string
  formatoNome: string
  larguraMM: number
  alturaMM: number
  precoPor100: number
  orientacao: "normal" | "rotacionada"
  colunas: number
  linhas: number
  pecasPorFolha: number
  aproveitamentoPct: number
}

export type LayoutChapa = {
  larguraChapa: number // mm
  alturaChapa: number // mm
  larguraDieline: number // mm (pode ser rotacionada)
  alturaDieline: number // mm (pode ser rotacionada)
  colunas: number
  linhas: number
  pecasPorChapa: number
  rotacionada: boolean
}

export type LinhaTabela = {
  quantidade: number
  folhasReais: number
  folhasComAcrescimo: number
  folhasPacote: number
  milheiroCorte: number
  custoPapel: number
  custoImpressao: number
  custoCorte: number
  custoVerniz: number
  custoColagem: number
  custoArte: number
  custoTotalSemFaca: number
  custoTotalComFaca: number
  precoSemFaca: number
  precoComFaca: number
  unitarioSemFaca: number
  unitarioComFaca: number
  lucroSemFaca: number
  lucroComFaca: number
  margemSemFaca: number
  margemComFaca: number
  parcela12xSemFaca: number
  parcela12xComFaca: number
}

export type Calculo = {
  dieline: {
    largura: number
    altura: number
    abaColagem: number
    abaSuperior: number
    abaInferior: number
    tipoCaixa: TipoCaixa
  }
  formData: {
    frente: number
    lateral: number
    alturaBox: number
  }
  formatos: ResultadoFormato[]
  melhorFormato: ResultadoFormato
  layoutChapa: LayoutChapa
  numChapas: number
  custoImpressaoFixo: number
  tabela: LinhaTabela[]
  sweetSpotMinimoQtd: number
  sweetSpotIdealQtd: number
}

export type LinhaPropostaCustom = {
  id: string
  quantidade: number
  unitario: number
  ativa: boolean
  isIdeal: boolean
}

export type ItemTerceirizado = {
  id: string
  nome: string
  descricao?: string
  fornecedor: string
  quantidade: number
  custoTotal: number   // custo total pago ao fornecedor
  precoTotal: number   // preço total cobrado ao cliente
  loteId?: string
  loteNumero?: string
}

export type PropostaCustom = {
  id: string
  numero: string
  nomeCliente: string
  descricao: string
  material: string
  dimensoes: string
  incluirVerniz: boolean
  comFaca: boolean
  valorFaca: number
  numSKUs: number
  validadeDias: number
  obsCliente: string
  data: string
  linhas: LinhaPropostaCustom[]
  parcFator: number
  cardId: string
  terceirizados?: ItemTerceirizado[]
}

export type Cliente = {
  id: string
  nome: string
  telefone?: string
  email?: string
  cnpj?: string
  notas?: string
  criadoEm: string
  origemCampanhaId?: string | null
  origemCampanhaNome?: string | null
}

export type KanbanOpcao = {
  quantidade: number
  preco: number
  unitario: number
}

export type CustoSnapshot = {
  quantidade: number
  papel: number
  impressao: number
  corte: number
  verniz: number
  colagem: number
  arte: number
  total: number
  preco: number
  margem: number
}

export type ProjecaoCustos = {
  papel?: number
  impressao?: number
  corte?: number
  verniz?: number
  colagem?: number
  arte?: number
  faca?: number
  hotstamping?: number
  corteVinco?: number
  outros?: number
  obs?: string
}

export type PrazoEtapas = {
  pedido_enviado?: string
  inicio_arte?: string
  arte_enviada?: string
  arte_aprovada?: string
  inicio_impressao?: string
  fim_impressao?: string
  inicio_verniz?: string
  fim_verniz?: string
  inicio_acabamento?: string
  fim_acabamento?: string
  expedicao?: string
}

export type KanbanCard = {
  id: string
  numero: string
  nomeCliente: string
  dimensoes: string
  materialNome: string
  preco: number
  quantidade: number
  data: string
  coluna: number
  motivoPerdido?: string
  opcoes?: KanbanOpcao[]
  custosSnapshot?: CustoSnapshot[]
  dataEntregaPrevista?: string
  dataEntregaReal?: string
  dataFechamento?: string
  prazoRecebimentoInterno?: string
  fornecedor?: string
  custoTerceiro?: number
  isTerceirizado?: boolean
  loteId?: string
  loteNumero?: string
  cores?: string
  acabamentos?: string[]
  observacoesOS?: string
  projecaoCustos?: ProjecaoCustos
  prazos?: PrazoEtapas
}

export type PedidoArquivo = {
  id: string
  card_id: string
  card_numero: string
  nome: string
  url: string
  tipo: "arte" | "faca" | "mockup" | "referencia" | "outro"
  tamanho?: number
  created_at: string
}

export type Lote = {
  id: string
  numero: string
  nomeCliente: string
  descricao?: string
  criadoEm: string
}

export const COLUNAS_KANBAN = [
  "Orçamento realizado",
  "Fechado",
  "Arte / Dieline",
  "Aprovação",
  "Fila de impressão",
  "Impressão",
  "Verniz",
  "Acabamento",
  "Expedição",
  "Entregue",
  "Perdido",
] as const

export const COL_FECHADO   = 1
export const COL_EXPEDICAO = 8
export const COL_ENTREGUE  = 9
export const COL_PERDIDO   = 10
export const COL_HOT       = 11

export type Parceiro = {
  id: string
  nome: string
  categoria: string
  contato?: string
  comissaoDefault: number
  criadoEm: string
}

export type TipoNegocio = "comissao" | "ganho"
export type StatusNegocio = "pendente" | "pago" | "cancelado"

export type TipoLancamento = "receita" | "despesa"
export type StatusLancamento = "pendente" | "pago" | "atrasado"
export type FormaPagamento = "pix" | "boleto" | "cartao_credito" | "cartao_debito" | "dinheiro" | "transferencia" | "outro" | "conta"

export type CategoriaDesp =
  | "aluguel" | "fornecedor" | "materiais" | "salarios"
  | "impostos" | "marketing" | "servicos" | "outros"

export type LancamentoFinanceiro = {
  id: string
  tipo: TipoLancamento
  descricao: string
  valor: number
  dataVencimento: string
  dataPagamento?: string
  status: StatusLancamento
  cardId?: string
  cardNumero?: string
  nomeCliente?: string
  loteId?: string
  loteNumero?: string
  categoria?: string
  subcategoria?: string
  contaId?: string
  fornecedorId?: string
  formaPagamento?: FormaPagamento
  obs?: string
  criadoEm: string
}

export type StatusLoteParceiro = "aguardando" | "em_producao" | "pronto" | "entregue"

export type NegocioParceiro = {
  id: string
  parceiroId: string
  parceiroNome: string
  descricao: string
  tipo: TipoNegocio
  valorVenda: number
  valorCusto?: number
  comissaoPerc: number
  comissaoValor: number
  dataOrcamento: string
  status: StatusNegocio
  obs?: string
  criadoEm: string
  loteId?: string
  loteNumero?: string
  statusLote?: StatusLoteParceiro
}
