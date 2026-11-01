import { ConfigProducao, PRODUCAO_PADRAO, normalizarProducao } from "./lib/producao"
import { ConfigMetas, METAS_PADRAO, normalizarMetas } from "./lib/metas"

export type Custos = {
  impressaoPorChapa: number
  corteAcerto: number
  corteMilheiro: number
  vernizPor2000: number
  colagemMilheiro: number
  arte: number
}

export type Multiplicadores = {
  semFaca: number
  comFaca: number
  parcelamento12x: number
}

export type Material = {
  id: string
  nome: string
  precos: { [formatoId: string]: number } // R$ por 100 folhas
}

export type CategoriaFinanceira = {
  id: string
  nome: string
  subcategorias?: string[]
}

export type ContaBancaria = {
  id: string
  nome: string
  banco: string
  tipo: "corrente" | "poupanca" | "credito" | "debito"
  cor: string
  limite?: number
  saldo?: number
  padrao?: boolean
  ativa: boolean
}

export type GastoFixo = {
  id: string
  nome: string
  categoriaId: string
  valor: number
  diaVencimento: number
  contaId?: string
  obs?: string
  ativa: boolean
}

export type Fornecedor = {
  id: string
  nome: string
  categoria: string
  contato?: string
  telefone?: string
  email?: string
  obs?: string
  conta?: boolean
  ativo: boolean
}

export type Configuracoes = {
  custos: Custos
  multiplicadores: Multiplicadores
  materiais: Material[]
  apiKey: string
  metaMensal: number
  baselineFaturamento: number
  categoriasReceita: CategoriaFinanceira[]
  categoriasDespesa: CategoriaFinanceira[]
  contas: ContaBancaria[]
  gastosFixos: GastoFixo[]
  fornecedores: Fornecedor[]
  producao: ConfigProducao
  metas: ConfigMetas
  aprovacoesOnline?: import("./types").AprovacaoOnline[]   // gravado pelo servidor
  avaliacoes?: import("./types").Avaliacao[]                // gravado pelo servidor (página do cliente)
  visitasProposta?: Record<string, import("./types").VisitaProposta>  // gravado pelo servidor (link de aprovação)
  caixa?: import("./lib/caixa").ConfigCaixa                // pagamentos planejados das contas de fornecedor
  sinalPct?: number                                        // sinal pedido na aprovação online (%)
  feriados?: import("./lib/diasUteis").ConfigFeriados      // feriados locais nos prazos
  clientesRelacionamento?: ClienteRelacionamento[]         // pagam depois da entrega
  origensClientes?: import("./lib/coleta").OrigensClientes   // como cada cliente chegou (nomeChave → canal)
  ideias?: Ideia[]                                         // anotações para implementar depois
  conciliacao?: import("./lib/conciliacao").MemoriaConciliacao  // quem paga por quem e entradas ignoradas
}

export type StatusIdeia = "ideia" | "andamento" | "feita"
export type Ideia = { id: string; texto: string; status: StatusIdeia; criadaEm: string }

// Cliente de confiança: recebe antes de quitar; o saldo é esperado alguns dias após a entrega
export type ClienteRelacionamento = { nome: string; diasAposEntrega: number }

const CATS_RECEITA_PADRAO: CategoriaFinanceira[] = [
  { id: "pedido",      nome: "Pedido" },
  { id: "sinal",       nome: "Sinal" },
  { id: "saldo-final", nome: "Saldo final" },
  { id: "parcela",     nome: "Parcela" },
  { id: "outros",      nome: "Outros" },
]

const CATS_DESPESA_PADRAO: CategoriaFinanceira[] = [
  { id: "aluguel",    nome: "Aluguel" },
  { id: "fornecedor", nome: "Fornecedor" },
  { id: "materiais",  nome: "Materiais" },
  { id: "salarios",   nome: "Salários" },
  { id: "impostos",   nome: "Impostos" },
  { id: "marketing",  nome: "Marketing" },
  { id: "servicos",   nome: "Serviços" },
  { id: "outros",     nome: "Outros" },
]

export const CONFIG_PADRAO: Configuracoes = {
  sinalPct: 50,
  ideias: [
    { id: "i3", texto: "Cada vez mais integração", status: "ideia", criadaEm: "2026-11-01" },
    { id: "i2", texto: "Agentes de IA dentro do sistema", status: "ideia", criadaEm: "2026-11-01" },
    { id: "i1", texto: "Média de cada etapa nos fornecedores, para saber o prazo médio de produção", status: "ideia", criadaEm: "2026-11-01" },
  ],
  feriados: { cidade: "sp", extras: [] },
  custos: {
    impressaoPorChapa: 350,
    corteAcerto: 50,
    corteMilheiro: 50,
    vernizPor2000: 55,
    colagemMilheiro: 39,
    arte: 200,
  },
  multiplicadores: {
    semFaca: 2.0,
    comFaca: 2.0,
    parcelamento12x: 1.2,
  },
  materiais: [
    { id: "couche115", nome: "Couchê 115g",  precos: { "66x96": 85,  "77x113": 120 } },
    { id: "couche250", nome: "Couchê 250g",  precos: { "66x96": 160, "77x113": 220 } },
    { id: "cartao300", nome: "Cartão 300g",  precos: { "66x96": 195, "77x113": 270 } },
    { id: "cartao350", nome: "Cartão 350g",  precos: { "66x96": 225, "77x113": 310 } },
  ],
  apiKey: "",
  metaMensal: 10000,
  baselineFaturamento: 0,
  categoriasReceita: CATS_RECEITA_PADRAO,
  categoriasDespesa: CATS_DESPESA_PADRAO,
  contas: [],
  gastosFixos: [],
  fornecedores: [],
  producao: PRODUCAO_PADRAO,
  metas: METAS_PADRAO,
}

export const defaultConfig = CONFIG_PADRAO

export function carregarConfig(): Configuracoes {
  try {
    const raw = localStorage.getItem("enyla-config")
    if (!raw) return CONFIG_PADRAO
    const saved = JSON.parse(raw) as Partial<Configuracoes>
    return {
      custos: { ...CONFIG_PADRAO.custos, ...saved.custos },
      multiplicadores: { ...CONFIG_PADRAO.multiplicadores, ...saved.multiplicadores },
      materiais: saved.materiais?.length ? saved.materiais : CONFIG_PADRAO.materiais,
      apiKey: saved.apiKey ?? "",
      metaMensal: saved.metaMensal ?? CONFIG_PADRAO.metaMensal,
      baselineFaturamento: saved.baselineFaturamento ?? 0,
      categoriasReceita: saved.categoriasReceita?.length ? saved.categoriasReceita : CATS_RECEITA_PADRAO,
      categoriasDespesa: saved.categoriasDespesa?.length ? saved.categoriasDespesa : CATS_DESPESA_PADRAO,
      contas: saved.contas ?? [],
      gastosFixos: saved.gastosFixos ?? [],
      fornecedores: saved.fornecedores ?? [],
      producao: normalizarProducao(saved.producao),
      metas: normalizarMetas(saved.metas),
    }
  } catch {
    return CONFIG_PADRAO
  }
}

export function salvarConfig(config: Configuracoes): void {
  try { localStorage.setItem("enyla-config", JSON.stringify(config)) } catch {}
}
