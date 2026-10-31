// Dados fictícios que reproduzem situações reais do sistema (sem dados de clientes).
import { KanbanCard, LancamentoFinanceiro, FormData } from "@/app/types"
import { Configuracoes, CONFIG_PADRAO } from "@/app/config"
import { PRODUCAO_PADRAO } from "@/app/lib/producao"

let seq = 0
const id = () => `t${++seq}`

export function card(p: Partial<KanbanCard> & { numero: string; preco: number }): KanbanCard {
  return {
    id: id(), nomeCliente: "Cliente Teste", dimensoes: "10×10×10", materialNome: "Cartão 300g",
    quantidade: 1000, data: "01/09/2026, 10:00:00", coluna: 1, ...p,
  }
}

export function receita(p: Partial<LancamentoFinanceiro> & { valor: number }): LancamentoFinanceiro {
  return { id: id(), tipo: "receita", descricao: "Pagamento", dataVencimento: "2026-09-10", status: "pago", dataPagamento: "2026-09-10", criadoEm: "", ...p }
}

export function despesa(p: Partial<LancamentoFinanceiro> & { valor: number }): LancamentoFinanceiro {
  return { id: id(), tipo: "despesa", descricao: "Custo", dataVencimento: "2026-09-10", status: "pago", dataPagamento: "2026-09-10", criadoEm: "", ...p }
}

export const FORM: FormData = {
  nomeCliente: "Cliente Teste", tipoCaixa: "simples", frente: 15, lateral: 8, alturaBox: 20, abaColagem: 1,
  incluirVerniz: true, vernizTipo: "UV Total", laminacao: false, laminacaoTipo: "",
  acompanhamentos: [], outrosAcabamentos: [], comFaca: false, valorFaca: 0,
  numSKUs: 1, numArtes: 1, quantidades: [1000, 3000], qualidades: {}, customPecasChapa: null, blankOverride: null,
  obsInterna: "", obsCliente: "", validadeDias: 7, materialId: "cartao300", materialNome: "Cartão 300g",
}

// Impressor com conta corrente (Jerograf), impressor pago na hora e acabamento
export function config(extra: Partial<Configuracoes> = {}): Configuracoes {
  return {
    ...CONFIG_PADRAO,
    fornecedores: [
      { id: "fin-jero", nome: "Gráfica Conta", categoria: "Impressão", conta: true, ativo: true },
      { id: "fin-acab", nome: "Acabamento", categoria: "Acabamento", ativo: true },
    ],
    producao: {
      ...PRODUCAO_PADRAO,
      fornecedores: [
        { id: "jero", nome: "Gráfica Conta", ativo: true, fornecedorId: "fin-jero", frete: 0, prazoDias: 5,
          maquina: { nome: "56×77", largura: 770, altura: 565, pinca: 10, margem: 5 },
          servicos: { impressao: { tipo: "fixo_chapa", valor: 350, proporcionalCavidades: true } } },
        { id: "acab", nome: "Acabamento", ativo: true, fornecedorId: "fin-acab", frete: 0, prazoDias: 4,
          servicos: { verniz: { tipo: "por_folha", valor: 0.25 }, corteVinco: { tipo: "acerto_milheiro", acerto: 70, milheiro: 70 }, colagem: { tipo: "por_unidade", valor: 0.12 } } },
      ],
      padroes: { acabamento: "acab", corteVinco: "acab", colagem: "acab" },
      movimentos: [], ocorrencias: [], ferramentais: [],
    },
    ...extra,
  }
}
