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
  frente: number // cm
  lateral: number // cm
  alturaBox: number // cm
  abaColagem: number // cm
  incluirVerniz: boolean
  comFaca: boolean
  valorFaca: number
  numSKUs: number
  numArtes: number
  quantidades: number[]
  customPecasChapa: number | null
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
}

export type Cliente = {
  id: string
  nome: string
  telefone?: string
  email?: string
  cnpj?: string
  notas?: string
  criadoEm: string
}

export type KanbanOpcao = {
  quantidade: number
  preco: number
  unitario: number
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
  dataEntregaPrevista?: string
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

export const COL_FECHADO  = 1
export const COL_ENTREGUE = 9
export const COL_PERDIDO  = 10

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
}
