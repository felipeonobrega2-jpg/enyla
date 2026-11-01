// Dados fictícios: pedidos em várias etapas, cobranças, sobras e conta corrente
import { KanbanCard, LancamentoFinanceiro, FormData } from "@/app/types"
import { Configuracoes, CONFIG_PADRAO } from "@/app/config"
import { PRODUCAO_PADRAO } from "@/app/lib/producao"

const hoje = new Date()
const dia = (n: number) => { const d = new Date(hoje); d.setDate(d.getDate() + n); return d.toLocaleDateString("sv-SE") }
const br = (iso: string) => iso.split("-").reverse().join("/") + ", 10:00:00"

const FORM: FormData = {
  nomeCliente: "Cliente Teste", tipoCaixa: "simples", frente: 15, lateral: 8, alturaBox: 20, abaColagem: 1,
  incluirVerniz: true, vernizTipo: "UV Total", laminacao: false, laminacaoTipo: "",
  acompanhamentos: [], outrosAcabamentos: [], comFaca: true, valorFaca: 0,
  numSKUs: 1, numArtes: 1, quantidades: [1000, 3000, 6000], qualidades: {}, customPecasChapa: null, blankOverride: null,
  obsInterna: "", obsCliente: "", validadeDias: 7, materialId: "cartao300", materialNome: "Cartão 300g",
}

const cards: KanbanCard[] = [
  { id: "c1", numero: "ORC-001", nomeCliente: "Ana Cosméticos", dimensoes: "15×20×8", materialNome: "Cartão 300g", preco: 6540, quantidade: 3000, data: br(dia(-20)), coluna: 9, dataFechamento: dia(-20), dataEntregaPrevista: dia(-3), loteId: "L1", loteNumero: "ANA-001" },
  { id: "c2", numero: "ORC-002", nomeCliente: "Bruno Perfumes", dimensoes: "15×20×8", materialNome: "Cartão 300g", preco: 9540, quantidade: 6000, data: br(dia(-10)), coluna: 7, dataFechamento: dia(-10), dataEntregaPrevista: dia(3) },
  { id: "c3", numero: "ORC-003", nomeCliente: "Cliente Relacionamento", dimensoes: "15×20×8", materialNome: "Cartão 300g", preco: 3890, quantidade: 1000, data: br(dia(-5)), coluna: 5, dataFechamento: dia(-5), dataEntregaPrevista: dia(9) },
  { id: "r1", numero: "ORC-030", nomeCliente: "Ivo Sabonetes", dimensoes: "8×8×4", materialNome: "Kraft", preco: 2800, quantidade: 2000, data: br(dia(-100)), coluna: 9, dataFechamento: dia(-100), dataEntregaPrevista: dia(-85) },
  { id: "r2", numero: "ORC-031", nomeCliente: "Ivo Sabonetes", dimensoes: "8×8×4", materialNome: "Kraft", preco: 2800, quantidade: 2000, data: br(dia(-60)), coluna: 9, dataFechamento: dia(-60), dataEntregaPrevista: dia(-45) },
  { id: "p1", numero: "ORC-020", nomeCliente: "Eva Doces", dimensoes: "10×10×5", materialNome: "Cartão 300g", preco: 2100, quantidade: 1000, data: br(dia(0)), coluna: 10, motivoPerdido: "Preço — achou caro perto da gráfica do bairro" },
  { id: "p2", numero: "ORC-021", nomeCliente: "Fábio Café", dimensoes: "10×10×5", materialNome: "Kraft", preco: 3400, quantidade: 2000, data: br(dia(0)), coluna: 10, motivoPerdido: "Cliente sumiu e não respondeu mais contato." },
  { id: "p3", numero: "ORC-022", nomeCliente: "Gabi Joias", dimensoes: "8×8×4", materialNome: "Cartão 300g", preco: 1800, quantidade: 500, data: br(dia(0)), coluna: 10, motivoPerdido: "Preço" },
  { id: "p4", numero: "ORC-023", nomeCliente: "Hugo Chás", dimensoes: "8×8×4", materialNome: "Cartão 300g", preco: 900, quantidade: 300, data: br(dia(0)), coluna: 10, motivoPerdido: "Orçamento sem conclusão" },
  { id: "c4", numero: "ORC-004", nomeCliente: "Carla Velas", dimensoes: "15×20×8", materialNome: "Cartão 300g", preco: 6540, quantidade: 3000, data: br(dia(-2)), coluna: 0 },
  { id: "c6", numero: "ORC-006", nomeCliente: "Ana Cosméticos", dimensoes: "8×8×8", materialNome: "Cartão 300g", preco: 1200, quantidade: 1000, data: br(dia(-20)), coluna: 9, dataFechamento: dia(-20), dataEntregaPrevista: dia(-3), loteId: "L1", loteNumero: "ANA-001",
    opcoes: [{ quantidade: 500, preco: 800, unitario: 1.6 }, { quantidade: 1000, preco: 1200, unitario: 1.2 }] },
  { id: "c5", numero: "ORC-005", nomeCliente: "Davi Chás", dimensoes: "15×20×8", materialNome: "Cartão 300g", preco: 3890, quantidade: 1000, data: br(dia(-40)), coluna: 9, dataFechamento: dia(-40), dataEntregaReal: dia(-30) },
]

const L = (p: Partial<LancamentoFinanceiro> & { valor: number; tipo: LancamentoFinanceiro["tipo"] }): LancamentoFinanceiro =>
  ({ id: Math.random().toString(36).slice(2), descricao: "Lançamento", dataVencimento: dia(-5), status: "pago", dataPagamento: dia(-5), criadoEm: "", ...p })

const lancamentos: LancamentoFinanceiro[] = [
  { id: "aj1", tipo: "receita", descricao: "Ajuste de saldo — Jerograf", valor: 2500, dataVencimento: dia(0), dataPagamento: dia(0), status: "pago", formaPagamento: "conta", fornecedorId: "f1", criadoEm: "" },
  L({ tipo: "receita", valor: 3270, loteId: "L1", descricao: "Sinal ANA-001" }),
  L({ tipo: "receita", valor: 650, loteId: "L1", cardId: "c1", categoria: "sobra", status: "pendente", dataPagamento: undefined, dataVencimento: dia(-2), descricao: "Sobra ANA-001" }),
  L({ tipo: "receita", valor: 4770, cardId: "c2", descricao: "Sinal ORC-002" }),
  L({ tipo: "receita", valor: 3890, cardId: "c5", descricao: "Pagamento ORC-005" }),
  L({ tipo: "despesa", valor: 1300, cardId: "c1", loteId: "L1", descricao: "Papel", subcategoria: "Papel", formaPagamento: "conta", fornecedorId: "fin-graf", status: "pendente", dataPagamento: undefined }),
  L({ tipo: "despesa", valor: 700, cardId: "c1", loteId: "L1", descricao: "Impressão", subcategoria: "Impressão", formaPagamento: "conta", fornecedorId: "fin-graf", status: "pendente", dataPagamento: undefined }),
  L({ tipo: "despesa", valor: 2600, cardId: "c2", descricao: "Impressão + Papel", subcategoria: "Impressão", formaPagamento: "conta", fornecedorId: "fin-graf", status: "pendente", dataPagamento: undefined }),
  L({ tipo: "despesa", valor: 420, cardId: "c1", loteId: "L1", descricao: "Verniz", subcategoria: "Verniz", fornecedorId: "fin-acab" }),
  L({ tipo: "despesa", valor: 1500, cardId: "c5", descricao: "Papel + Impressão", subcategoria: "Impressão" }),
  L({ tipo: "despesa", valor: 350, cardId: "c5", descricao: "Papel", subcategoria: "Papel" }),
  L({ tipo: "receita", valor: 2000, formaPagamento: "conta", fornecedorId: "fin-graf", descricao: "Abatimento" }),
]

export const config: Configuracoes = {
  ...CONFIG_PADRAO,
  metaMensal: 40000,
  contas: [{ id: "cc", nome: "Conta corrente", banco: "Banco", tipo: "corrente", cor: "#8456e8", saldo: 5000, ativa: true }],
  gastosFixos: [{ id: "g1", nome: "Escritório", categoriaId: "aluguel", valor: 799.9, diaVencimento: 3, ativa: true }],
  clientesRelacionamento: [{ nome: "Cliente Relacionamento", diasAposEntrega: 30 }],
  fornecedores: [
    { id: "fin-graf", nome: "Gráfica Parceira", categoria: "Impressão", conta: true, ativo: true },
    { id: "fin-acab", nome: "Acabamentos", categoria: "Acabamento", ativo: true },
  ],
  producao: {
    ...PRODUCAO_PADRAO,
    fornecedores: [
      { id: "graf", nome: "Gráfica Parceira", ativo: true, fornecedorId: "fin-graf", frete: 0, prazoDias: 5,
        maquina: { nome: "56×77", largura: 770, altura: 565, pinca: 10, margem: 5 }, servicos: { impressao: { tipo: "fixo_chapa", valor: 350, proporcionalCavidades: true } } },
      { id: "acab", nome: "Acabamentos", ativo: true, fornecedorId: "fin-acab", frete: 30, prazoDias: 4,
        servicos: { verniz: { tipo: "por_folha", valor: 0.25 }, corteVinco: { tipo: "acerto_milheiro", acerto: 70, milheiro: 70 }, colagem: { tipo: "por_unidade", valor: 0.12 } } },
    ],
    padroes: { acabamento: "acab", corteVinco: "acab", colagem: "acab" },
    movimentos: [
      { id: "m1", pedidoKey: "card-c2", pedidoLabel: "ORC-002 · Bruno Perfumes", fornecedorId: "acab", etapa: "acabamento", servicos: ["verniz", "corteVinco", "colagem"], enviadoEm: dia(-2), prazoPrevisto: dia(3) },
    ],
    ocorrencias: [], ferramentais: [],
  },
}

export const dados = {
  kanban: cards,
  lancamentos,
  historico: cards.map(c => ({ numero: c.numero, form: { ...FORM, nomeCliente: c.nomeCliente, quantidades: [c.quantidade] } as FormData })),
}
