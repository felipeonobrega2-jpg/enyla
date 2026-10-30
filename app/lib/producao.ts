// Motor de rotas de produção.
//
// Uma rota = impressor (com sua máquina) × formato de papel × divisão da folha × faca.
// Para cada quantidade o motor custeia todas as rotas e devolve a mais barata
// junto com as alternativas, para comparar fornecedores e tamanhos de faca.
//
// Fluxo de uma rota:
//   folha de papel → dividida em peças (inteira / meia / quarto)
//   peça → cortada no tamanho da máquina (folha principal + sobra aproveitável)
//   cada tamanho de folha impressa = uma passada (chapa própria, cavidades próprias)
//   corte e vinco: batidas = folhas impressas de todas as passadas
//   acabamentos, colagem e frete por etapa / fornecedor
//   preço = custo total × multiplicador (sem imposto)

import type { TipoCaixa } from "../types"

// ── Cadastro ──────────────────────────────────────────────────────────────────

export type TipoRegra = "acerto_milheiro" | "fixo_chapa" | "por_folha" | "por_m2" | "por_unidade"

export type RegraCobranca = {
  tipo: TipoRegra
  acerto?: number                  // acerto_milheiro; opcional nos demais
  milheiro?: number                // acerto_milheiro: R$ por milheiro
  valor?: number                   // fixo_chapa / por_folha / por_m2 / por_unidade
  proporcionalCavidades?: boolean  // fixo_chapa: chapa de 2 numa máquina de 4 = metade
  precosPorTipo?: Record<string, number> // laminação/verniz: valor por tipo (substitui `valor`)
}

export type Servico = "impressao" | "laminacao" | "verniz" | "hotStamping" | "corteVinco" | "colagem"

export const SERVICOS: { id: Servico; nome: string }[] = [
  { id: "impressao",   nome: "Impressão" },
  { id: "laminacao",   nome: "Laminação" },
  { id: "verniz",      nome: "Verniz" },
  { id: "hotStamping", nome: "Hot stamping" },
  { id: "corteVinco",  nome: "Corte e vinco" },
  { id: "colagem",     nome: "Colagem" },
]

export type Maquina = {
  nome: string
  largura: number  // mm — maior folha que a máquina aceita
  altura: number   // mm
  pinca: number    // mm — borda de pinça (um lado)
  margem: number   // mm — demais bordas
}

export type FornecedorProducao = {
  id: string
  nome: string
  ativo: boolean
  fornecedorId?: string            // vínculo com o cadastro financeiro
  maquina?: Maquina                // só para quem imprime
  servicos: Partial<Record<Servico, RegraCobranca>>
  frete: number                    // custo de levar o material até ele
  prazoDias: number                // prazo combinado (para medir atraso)
  obs?: string
}

export type TipoFerramental = "faca" | "cliche" | "fotolito"

export type Ferramental = {
  id: string
  tipo: TipoFerramental
  cliente: string
  produto: string
  blankLargura: number  // mm
  blankAltura: number   // mm
  cavidades: number     // faca: nº de cavidades
  fornecedor?: string
  custo: number
  data: string          // ISO
}

export type EtapaPedido = "impressao" | "acabamento" | "corteVinco" | "colagem" | "outro"

export type MovimentoFornecedor = {
  id: string
  pedidoKey: string
  pedidoLabel: string
  fornecedorId: string
  etapa: EtapaPedido
  enviadoEm: string     // ISO yyyy-mm-dd
  recebidoEm?: string
  prazoPrevisto?: string
}

export type TipoOcorrencia = "atraso" | "cor" | "registro" | "perda" | "defeito" | "outro"

export const TIPOS_OCORRENCIA: { id: TipoOcorrencia; nome: string }[] = [
  { id: "atraso",   nome: "Atraso" },
  { id: "cor",      nome: "Erro de cor" },
  { id: "registro", nome: "Corte fora de registro" },
  { id: "perda",    nome: "Perda acima do normal" },
  { id: "defeito",  nome: "Defeito" },
  { id: "outro",    nome: "Outro" },
]

export type Ocorrencia = {
  id: string
  fornecedorId: string
  pedidoKey?: string
  pedidoLabel?: string
  tipo: TipoOcorrencia
  descricao: string
  prejuizo: number
  data: string          // ISO yyyy-mm-dd
}

export type ConfigProducao = {
  fornecedores: FornecedorProducao[]
  padroes: { acabamento?: string; hotStamping?: string; corteVinco?: string; colagem?: string }
  espacoEntrePecas: number      // mm
  perdaPct: number              // % de folhas a mais
  arredondarPacote: boolean     // papel comprado em pacotes de 100
  impostoPct: number            // % sobre o preço
  colagemManualUnit: number     // R$/un quando a colagem é feita à mão
  ferramentalPadrao: { facaBase: number; facaPorCavidade: number; cliche: number; fotolito: number }
  ferramentais: Ferramental[]
  movimentos: MovimentoFornecedor[]
  ocorrencias: Ocorrencia[]
}

export const PRODUCAO_PADRAO: ConfigProducao = {
  fornecedores: [
    {
      id: "tio", nome: "Impressor principal", ativo: true,
      maquina: { nome: "Máquina 33×66", largura: 660, altura: 330, pinca: 10, margem: 5 },
      servicos: { impressao: { tipo: "fixo_chapa", valor: 350, proporcionalCavidades: true } },
      frete: 0, prazoDias: 5,
      obs: "Valor fixo por chapa, não depende da tiragem. Confirme o tamanho da máquina.",
    },
    {
      id: "grafica-externa", nome: "Gráfica externa (média)", ativo: true,
      maquina: { nome: "Meia folha 56,5×77", largura: 770, altura: 565, pinca: 10, margem: 5 },
      servicos: { impressao: { tipo: "acerto_milheiro", acerto: 650, milheiro: 100 } },
      frete: 0, prazoDias: 7,
    },
    {
      id: "acabamento", nome: "Acabamento (média)", ativo: true,
      servicos: {
        corteVinco: { tipo: "acerto_milheiro", acerto: 70, milheiro: 70 },
        colagem:    { tipo: "acerto_milheiro", acerto: 70, milheiro: 70 },
      },
      frete: 0, prazoDias: 4,
      obs: "Laminação, verniz e hot stamping: cadastre a tabela de preços quando tiver.",
    },
  ],
  padroes: { acabamento: "acabamento", hotStamping: "acabamento", corteVinco: "acabamento", colagem: "acabamento" },
  espacoEntrePecas: 2,
  perdaPct: 10,
  arredondarPacote: true,
  impostoPct: 6,
  colagemManualUnit: 0.04,
  ferramentalPadrao: { facaBase: 150, facaPorCavidade: 60, cliche: 150, fotolito: 50 },
  ferramentais: [],
  movimentos: [],
  ocorrencias: [],
}

// Completa um cadastro salvo antes de existir algum campo novo
export function normalizarProducao(p?: Partial<ConfigProducao> | null): ConfigProducao {
  const d = PRODUCAO_PADRAO
  if (!p) return d
  return {
    ...d, ...p,
    fornecedores: p.fornecedores ?? d.fornecedores,
    padroes: { ...d.padroes, ...p.padroes },
    ferramentalPadrao: { ...d.ferramentalPadrao, ...p.ferramentalPadrao },
    ferramentais: p.ferramentais ?? [],
    movimentos: p.movimentos ?? [],
    ocorrencias: p.ocorrencias ?? [],
  }
}

// ── Entrada do orçamento ──────────────────────────────────────────────────────

export type ColagemModo = "fornecedor" | "manual" | "nenhuma"

export type OpcoesRota = {
  impressorId?: string | null          // null = automático (mais barato)
  facaCavidades?: number | null        // null = automático
  fornecedores?: Partial<Record<"acabamento" | "hotStamping" | "corteVinco" | "colagem", string>>
  colagemModo?: ColagemModo
  estimativaAcabamentoFolha?: number | null // R$ por folha impressa, quando não há tabela
}

export type FormatoPapelRota = { id: string; nome: string; largura: number; altura: number; precoPor100: number }

export type EntradaRotas = {
  blank: { largura: number; altura: number }  // mm
  quantidades: number[]
  numArtes: number
  tipoCaixa: TipoCaixa
  cliente: string
  comFaca: boolean
  valorFaca: number                    // valor informado pelo faquista (faca no tamanho cheio)
  laminacaoTipo: string | null
  vernizTipo: string | null
  hotStamping: boolean
  limitePecasMeiaFolha: number | null  // ajuste manual de peças por meia folha
  formatos: FormatoPapelRota[]
  arte: number
  multiplicador: number
  vernizPor2000Legado: number          // estimativa antiga, usada só sem tabela
  opcoes: OpcoesRota
  producao: ConfigProducao
}

// ── Resultado ─────────────────────────────────────────────────────────────────

export type Passada = {
  largura: number      // mm — folha impressa
  altura: number
  cavidades: number
  porPeca: number      // quantas folhas desse tamanho saem de cada peça de papel
  folhas: number       // folhas impressas nessa passada (preenchido por quantidade)
  batidasPorFolha: number
}

export type ItemCusto = {
  etapa: "papel" | "impressao" | "laminacao" | "verniz" | "hotStamping" | "corteVinco" | "colagem" | "arte" | "frete" | "faca" | "cliche" | "fotolito"
  descricao: string
  fornecedor?: string
  valor: number
  estimado: boolean
  ferramental?: boolean
}

export type Rota = {
  id: string
  impressorId: string
  impressorNome: string
  maquinaNome: string
  formatoId: string
  formatoNome: string
  divisao: 1 | 2 | 4
  divisaoNome: string
  passadas: Passada[]
  pecasPorPeca: number
  pecasPorFolhaPapel: number
  facaCavidades: number
  facaExistente: boolean
  quantidade: number
  pecasPapel: number           // peças de papel (com perda)
  folhasPapel: number          // folhas inteiras compradas
  folhasImpressas: number
  batidas: number
  jogos: number                // conjuntos de chapas (artes ÷ cavidades)
  itens: ItemCusto[]
  custoProducao: number        // sem ferramental
  custoFerramental: number
  custoTotal: number
  preco: number
  precoUnit: number
  imposto: number
  lucroLiquido: number
  margemLiquidaPct: number
  estimado: boolean
}

export type ResultadoRotas = {
  porQuantidade: { quantidade: number; melhor: Rota; alternativas: Rota[] }[]
  alertas: string[]
  facaRegistrada: Ferramental | null
}

// ── Geometria ─────────────────────────────────────────────────────────────────

const cabe = (L: number, x: number, esp: number) => (L >= x ? Math.floor((L + esp) / (x + esp)) : 0)

// Peças numa área livre: grade principal + faixa que sobra preenchida girada
export function encaixar(W: number, H: number, a: number, b: number, esp: number): number {
  let best = 0
  for (const [p, q] of [[a, b], [b, a]] as const) {
    const cols = cabe(W, p, esp)
    const rows = cabe(H, q, esp)
    const base = cols * rows
    const restW = W - cols * (p + esp)
    const restH = H - rows * (q + esp)
    const extraDireita = cabe(restW, q, esp) * cabe(H, p, esp)
    const extraBaixo   = cabe(W, q, esp) * cabe(restH, p, esp)
    best = Math.max(best, base + Math.max(extraDireita, extraBaixo))
  }
  return best
}

// Cavidades numa folha impressa: tira pinça de um lado e margem dos outros três
function cavidadesFolha(w: number, h: number, blank: { largura: number; altura: number }, m: Maquina, esp: number) {
  const opcoes = [
    [w - 2 * m.margem, h - m.pinca - m.margem],
    [w - m.pinca - m.margem, h - 2 * m.margem],
  ]
  let best = 0
  for (const [uw, uh] of opcoes) {
    if (uw <= 0 || uh <= 0) continue
    best = Math.max(best, encaixar(uw, uh, blank.largura, blank.altura, esp))
  }
  return best
}

const cabeNaMaquina = (w: number, h: number, m: Maquina) =>
  (w <= m.largura && h <= m.altura) || (w <= m.altura && h <= m.largura)

// Recorta um pedaço ao maior tamanho que a máquina aceita
function recortar(w: number, h: number, m: Maquina): [number, number] {
  const a = [Math.min(w, m.largura), Math.min(h, m.altura)]
  const b = [Math.min(w, m.altura), Math.min(h, m.largura)]
  return a[0] * a[1] >= b[0] * b[1] ? [a[0], a[1]] : [b[0], b[1]]
}

// Passadas que saem de uma peça de papel na máquina do impressor
export function passadasDaPeca(
  pw: number, ph: number, blank: { largura: number; altura: number }, m: Maquina, esp: number,
): Omit<Passada, "folhas" | "batidasPorFolha">[] {
  if (cabeNaMaquina(pw, ph, m)) {
    const c = cavidadesFolha(pw, ph, blank, m, esp)
    return c > 0 ? [{ largura: pw, altura: ph, cavidades: c, porPeca: 1 }] : []
  }
  let melhor: Omit<Passada, "folhas" | "batidasPorFolha">[] = []
  let melhorTotal = 0
  for (const [mw, mh] of [[m.largura, m.altura], [m.altura, m.largura]] as const) {
    const fw = Math.min(pw, mw)
    const fh = Math.min(ph, mh)
    // Corte guilhotina: primeiro vertical ou primeiro horizontal
    const sobras: [number, number][][] = [
      [[pw - fw, ph], [fw, ph - fh]],
      [[pw, ph - fh], [pw - fw, fh]],
    ]
    for (const faixas of sobras) {
      const pedacos: [number, number][] = [[fw, fh]]
      for (const [sw, sh] of faixas) if (sw > 0 && sh > 0) pedacos.push(recortar(sw, sh, m))
      const passadas = new Map<string, Omit<Passada, "folhas" | "batidasPorFolha">>()
      for (const [w, h] of pedacos) {
        const c = cavidadesFolha(w, h, blank, m, esp)
        if (c <= 0) continue
        const k = `${Math.round(w)}x${Math.round(h)}`
        const atual = passadas.get(k)
        if (atual) atual.porPeca += 1
        else passadas.set(k, { largura: w, altura: h, cavidades: c, porPeca: 1 })
      }
      const lista = [...passadas.values()].sort((x, y) => y.cavidades - x.cavidades)
      const total = lista.reduce((s, p) => s + p.cavidades * p.porPeca, 0)
      if (total > melhorTotal) { melhorTotal = total; melhor = lista }
    }
  }
  return melhor
}

// ── Cobrança ──────────────────────────────────────────────────────────────────

type BaseCobranca = { folhas: number; m2: number; unidades: number; fracaoChapa: number }

function cobrar(r: RegraCobranca, b: BaseCobranca, tipoAcabamento?: string | null): number {
  const v = (tipoAcabamento ? r.precosPorTipo?.[tipoAcabamento] : undefined) ?? r.valor ?? 0
  const acerto = r.acerto ?? 0
  switch (r.tipo) {
    case "acerto_milheiro": return acerto + (r.milheiro ?? 0) * b.folhas / 1000
    case "fixo_chapa":      return v * (r.proporcionalCavidades ? b.fracaoChapa : 1)
    case "por_folha":       return acerto + v * b.folhas
    case "por_m2":          return acerto + v * b.m2
    case "por_unidade":     return acerto + v * b.unidades
  }
}

export function descreverRegra(r?: RegraCobranca): string {
  if (!r) return "sem preço"
  const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
  switch (r.tipo) {
    case "acerto_milheiro": return `${brl(r.acerto ?? 0)} acerto + ${brl(r.milheiro ?? 0)}/milheiro`
    case "fixo_chapa":      return `${brl(r.valor ?? 0)} por chapa${r.proporcionalCavidades ? " (proporcional às cavidades)" : ""}`
    case "por_folha":       return `${brl(r.valor ?? 0)} por folha`
    case "por_m2":          return `${brl(r.valor ?? 0)} por m²`
    case "por_unidade":     return `${brl(r.valor ?? 0)} por unidade`
  }
}

// ── Ferramental ───────────────────────────────────────────────────────────────

const chave = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase()

export function ferramentalDoCliente(
  lista: Ferramental[], tipo: TipoFerramental, cliente: string, blank: { largura: number; altura: number },
): Ferramental | null {
  if (!cliente.trim()) return null
  const tol = 3
  const igual = (a: number, b: number) => Math.abs(a - b) <= tol
  return lista.find(f =>
    f.tipo === tipo && chave(f.cliente) === chave(cliente) &&
    ((igual(f.blankLargura, blank.largura) && igual(f.blankAltura, blank.altura)) ||
     (igual(f.blankLargura, blank.altura) && igual(f.blankAltura, blank.largura)))
  ) ?? null
}

// ── Cálculo ───────────────────────────────────────────────────────────────────

const DIVISOES: { d: 1 | 2 | 4; nome: string; dims: (W: number, H: number) => [number, number] }[] = [
  { d: 1, nome: "Folha inteira", dims: (W, H) => [W, H] },
  { d: 2, nome: "Meia folha",    dims: (W, H) => [W, H / 2] },
  { d: 4, nome: "Quarto de folha", dims: (W, H) => [W / 2, H / 2] },
]

type RotaBase = {
  impressor: FornecedorProducao
  formato: FormatoPapelRota
  divisao: (typeof DIVISOES)[number]
  passadas: Omit<Passada, "folhas" | "batidasPorFolha">[]
  pecasPorPeca: number
}

function rotasBase(e: EntradaRotas): RotaBase[] {
  const { producao: p } = e
  const impressores = p.fornecedores.filter(f => f.ativo && f.maquina && f.servicos.impressao)
  const out: RotaBase[] = []
  for (const impressor of impressores) {
    for (const formato of e.formatos) {
      for (const divisao of DIVISOES) {
        const [pw, ph] = divisao.dims(formato.largura, formato.altura)
        let passadas = passadasDaPeca(pw, ph, e.blank, impressor.maquina!, p.espacoEntrePecas)
        if (!passadas.length) continue
        // Limite manual de peças por meia folha, proporcional ao tamanho da peça
        if (e.limitePecasMeiaFolha && e.limitePecasMeiaFolha > 0) {
          let limite = Math.max(1, Math.round(e.limitePecasMeiaFolha * 2 / divisao.d))
          passadas = passadas.map(ps => {
            const total = ps.cavidades * ps.porPeca
            const usar = Math.min(total, limite)
            limite -= usar
            return { ...ps, cavidades: Math.floor(usar / ps.porPeca) }
          }).filter(ps => ps.cavidades > 0)
          if (!passadas.length) continue
        }
        const pecasPorPeca = passadas.reduce((s, ps) => s + ps.cavidades * ps.porPeca, 0)
        out.push({ impressor, formato, divisao, passadas, pecasPorPeca })
      }
    }
  }
  return out
}

function fornecedorDaEtapa(
  e: EntradaRotas, etapa: "acabamento" | "hotStamping" | "corteVinco" | "colagem", servico: Servico,
): FornecedorProducao | null {
  const ativos = e.producao.fornecedores.filter(f => f.ativo)
  const escolhido = e.opcoes.fornecedores?.[etapa] ?? e.producao.padroes[etapa]
  const f = ativos.find(x => x.id === escolhido && x.servicos[servico])
  return f ?? ativos.find(x => x.servicos[servico]) ?? null
}

function custoFaca(e: EntradaRotas, k: number, kCheio: number): { valor: number; estimado: boolean } {
  const fp = e.producao.ferramentalPadrao
  const tabela = (n: number) => fp.facaBase + fp.facaPorCavidade * n
  if (e.valorFaca > 0) return { valor: e.valorFaca * tabela(k) / tabela(kCheio), estimado: k !== kCheio }
  return { valor: tabela(k), estimado: true }
}

function custear(e: EntradaRotas, base: RotaBase, k: number, qtd: number, facaExistente: Ferramental | null): Rota {
  const p = e.producao
  const itens: ItemCusto[] = []
  const imp = base.impressor
  const regraImp = imp.servicos.impressao!

  // Papel e folhas
  const pecasLiquidas = Math.ceil(qtd / base.pecasPorPeca)
  const pecasPapel = Math.ceil(pecasLiquidas * (1 + p.perdaPct / 100))
  const folhasInteiras = Math.ceil(pecasPapel / base.divisao.d)
  const folhasPapel = p.arredondarPacote ? Math.ceil(folhasInteiras / 100) * 100 : folhasInteiras
  const custoPapel = folhasPapel / 100 * base.formato.precoPor100
  itens.push({ etapa: "papel", descricao: `${folhasPapel} folhas ${base.formato.nome}`, valor: custoPapel, estimado: false })

  const passadas: Passada[] = base.passadas.map(ps => ({
    ...ps, folhas: pecasPapel * ps.porPeca, batidasPorFolha: Math.ceil(ps.cavidades / k),
  }))
  const folhasImpressas = passadas.reduce((s, ps) => s + ps.folhas, 0)
  const m2 = passadas.reduce((s, ps) => s + ps.folhas * ps.largura * ps.altura / 1e6, 0)
  const jogos = Math.max(1, Math.ceil(e.numArtes / base.pecasPorPeca))

  // Impressão: cada passada tem chapa própria; acerto/chapa se repete por jogo de artes
  const cavPrincipal = Math.max(...passadas.map(ps => ps.cavidades))
  let custoImp = 0
  for (const ps of passadas) {
    const fixo = cobrar(regraImp, { folhas: 0, m2: 0, unidades: 0, fracaoChapa: ps.cavidades / cavPrincipal })
    const variavel = cobrar(regraImp, {
      folhas: ps.folhas, m2: ps.folhas * ps.largura * ps.altura / 1e6,
      unidades: ps.folhas * ps.cavidades, fracaoChapa: ps.cavidades / cavPrincipal,
    }) - fixo
    custoImp += fixo * jogos + variavel
  }
  itens.push({
    etapa: "impressao", fornecedor: imp.nome,
    descricao: `${passadas.map(ps => ps.cavidades).join(" + ")} cavidades${jogos > 1 ? ` · ${jogos} jogos de chapa` : ""}`,
    valor: custoImp, estimado: false,
  })

  // Sequência de fornecedores para o frete
  const sequencia: FornecedorProducao[] = [imp]

  // Laminação e verniz: por folha impressa / m² e tipo
  for (const [servico, tipo] of [["laminacao", e.laminacaoTipo], ["verniz", e.vernizTipo]] as const) {
    if (!tipo) continue
    const f = fornecedorDaEtapa(e, "acabamento", servico)
    const regra = f?.servicos[servico]
    const temPreco = regra && (regra.tipo !== "por_folha" && regra.tipo !== "por_m2" ? true : (regra.precosPorTipo?.[tipo] ?? regra.valor) != null)
    let valor = 0
    let estimado = true
    if (regra && temPreco) {
      valor = cobrar(regra, { folhas: folhasImpressas, m2, unidades: qtd, fracaoChapa: 1 }, tipo)
      estimado = false
    } else if (e.opcoes.estimativaAcabamentoFolha) {
      valor = e.opcoes.estimativaAcabamentoFolha * folhasImpressas
    } else if (servico === "verniz") {
      valor = Math.max(1, Math.ceil(qtd / 2000)) * e.vernizPor2000Legado
    }
    if (f) sequencia.push(f)
    itens.push({ etapa: servico, fornecedor: f?.nome, descricao: `${servico === "laminacao" ? "Laminação" : "Verniz"} ${tipo}`, valor, estimado })
  }

  // Hot stamping: uma batida por folha impressa + clichê e fotolito
  if (e.hotStamping) {
    const f = fornecedorDaEtapa(e, "hotStamping", "hotStamping")
    const regra = f?.servicos.hotStamping
    const valor = regra ? cobrar(regra, { folhas: folhasImpressas, m2, unidades: qtd, fracaoChapa: 1 }) : 0
    if (f) sequencia.push(f)
    itens.push({ etapa: "hotStamping", fornecedor: f?.nome, descricao: `${folhasImpressas} batidas`, valor, estimado: !regra })
    const fp = p.ferramentalPadrao
    const cliche = ferramentalDoCliente(p.ferramentais, "cliche", e.cliente, e.blank)
    const fotolito = ferramentalDoCliente(p.ferramentais, "fotolito", e.cliente, e.blank)
    itens.push({ etapa: "cliche", descricao: cliche ? "Clichê do cliente (já existe)" : "Clichê", valor: cliche ? 0 : fp.cliche, estimado: !cliche, ferramental: true })
    itens.push({ etapa: "fotolito", descricao: fotolito ? "Fotolito do cliente (já existe)" : "Fotolito", valor: fotolito ? 0 : fp.fotolito, estimado: !fotolito, ferramental: true })
  }

  // Corte e vinco: batidas = folhas impressas × golpes por folha (faca menor que a passada = mais golpes)
  const batidas = passadas.reduce((s, ps) => s + ps.folhas * ps.batidasPorFolha, 0)
  const fCorte = fornecedorDaEtapa(e, "corteVinco", "corteVinco")
  const regraCorte = fCorte?.servicos.corteVinco ?? { tipo: "acerto_milheiro" as const, acerto: 70, milheiro: 70 }
  if (fCorte) sequencia.push(fCorte)
  itens.push({
    etapa: "corteVinco", fornecedor: fCorte?.nome,
    descricao: `${batidas.toLocaleString("pt-BR")} batidas · faca de ${k}`,
    valor: cobrar(regraCorte, { folhas: batidas, m2, unidades: qtd, fracaoChapa: 1 }), estimado: !fCorte,
  })

  // Colagem
  const modo = e.opcoes.colagemModo ?? (e.tipoCaixa === "aviao" ? "nenhuma" : "fornecedor")
  if (modo === "fornecedor") {
    const f = fornecedorDaEtapa(e, "colagem", "colagem")
    const regra = f?.servicos.colagem
    if (f) sequencia.push(f)
    itens.push({
      etapa: "colagem", fornecedor: f?.nome, descricao: "Colagem no fornecedor",
      valor: regra ? cobrar(regra, { folhas: qtd, m2, unidades: qtd, fracaoChapa: 1 }) : qtd * p.colagemManualUnit,
      estimado: !regra,
    })
  } else if (modo === "manual") {
    itens.push({ etapa: "colagem", descricao: "Colagem manual", valor: qtd * p.colagemManualUnit, estimado: false })
  }

  // Frete: cada troca de fornecedor leva o material até o próximo
  let frete = 0
  for (let i = 1; i < sequencia.length; i++) {
    if (sequencia[i].id !== sequencia[i - 1].id) frete += sequencia[i].frete
  }
  if (frete > 0) itens.push({ etapa: "frete", descricao: "Frete entre fornecedores", valor: frete, estimado: false })

  itens.push({ etapa: "arte", descricao: "Arte", valor: e.arte, estimado: false })

  // Faca
  const kCheio = Math.max(...base.passadas.map(ps => ps.cavidades))
  if (e.comFaca) {
    if (facaExistente) {
      itens.push({ etapa: "faca", descricao: `Faca de ${k} do cliente (já existe)`, valor: 0, estimado: false, ferramental: true })
    } else {
      const f = custoFaca(e, k, kCheio)
      itens.push({ etapa: "faca", descricao: `Faca de ${k} cavidades`, valor: f.valor, estimado: f.estimado, ferramental: true })
    }
  }

  const custoFerramental = itens.filter(i => i.ferramental).reduce((s, i) => s + i.valor, 0)
  const custoProducao = itens.filter(i => !i.ferramental).reduce((s, i) => s + i.valor, 0)
  const custoTotal = custoProducao + custoFerramental
  const preco = custoTotal * e.multiplicador
  const imposto = preco * p.impostoPct / 100
  const lucroLiquido = preco - imposto - custoTotal

  return {
    id: `${imp.id}|${base.formato.id}|${base.divisao.d}|${k}`,
    impressorId: imp.id, impressorNome: imp.nome, maquinaNome: imp.maquina!.nome,
    formatoId: base.formato.id, formatoNome: base.formato.nome,
    divisao: base.divisao.d, divisaoNome: base.divisao.nome,
    passadas, pecasPorPeca: base.pecasPorPeca, pecasPorFolhaPapel: base.pecasPorPeca * base.divisao.d,
    facaCavidades: k, facaExistente: !!facaExistente,
    quantidade: qtd, pecasPapel, folhasPapel, folhasImpressas, batidas, jogos,
    itens, custoProducao, custoFerramental, custoTotal,
    preco, precoUnit: qtd > 0 ? preco / qtd : 0, imposto, lucroLiquido,
    margemLiquidaPct: preco > 0 ? lucroLiquido / preco * 100 : 0,
    estimado: itens.some(i => i.estimado && i.valor > 0),
  }
}

function opcoesDeFaca(base: RotaBase, e: EntradaRotas, existente: Ferramental | null): number[] {
  if (existente) return [existente.cavidades]
  const kCheio = Math.max(...base.passadas.map(ps => ps.cavidades))
  const ks = new Set<number>([kCheio, Math.ceil(kCheio / 2)])
  if (e.opcoes.facaCavidades && e.opcoes.facaCavidades > 0) ks.add(Math.min(e.opcoes.facaCavidades, kCheio))
  for (const ps of base.passadas) ks.add(ps.cavidades)
  return [...ks].filter(k => k >= 1).sort((a, b) => b - a)
}

export function calcularRotas(e: EntradaRotas): ResultadoRotas {
  const alertas: string[] = []
  const bases = rotasBase(e)
  const facaRegistrada = ferramentalDoCliente(e.producao.ferramentais, "faca", e.cliente, e.blank)

  if (!e.producao.fornecedores.some(f => f.ativo && f.maquina && f.servicos.impressao)) {
    alertas.push("Nenhum impressor cadastrado com máquina e preço de impressão.")
  }
  if (!bases.length) return { porQuantidade: [], alertas: [...alertas, "A caixa não cabe em nenhuma máquina cadastrada."], facaRegistrada }

  const porQuantidade = [...e.quantidades].sort((a, b) => a - b).map(qtd => {
    const todas: Rota[] = []
    for (const base of bases) {
      for (const k of opcoesDeFaca(base, e, facaRegistrada)) todas.push(custear(e, base, k, qtd, facaRegistrada))
    }
    todas.sort((a, b) => a.custoTotal - b.custoTotal)
    // Escolhas manuais definem a rota usada; as demais continuam na comparação
    const { impressorId, facaCavidades } = e.opcoes
    const escolhida = todas.find(r =>
      (!impressorId || r.impressorId === impressorId) &&
      (!facaCavidades || r.facaCavidades === Math.min(facaCavidades, Math.max(...r.passadas.map(p => p.cavidades)))))
    return { quantidade: qtd, melhor: escolhida ?? todas[0], alternativas: todas }
  })

  const amostra = porQuantidade[0]?.melhor
  if (amostra) {
    const semPreco = amostra.itens.filter(i => i.estimado && i.valor === 0 && !i.ferramental)
    const nome: Partial<Record<ItemCusto["etapa"], string>> = { laminacao: "Laminação", verniz: "Verniz", hotStamping: "Hot stamping" }
    for (const i of semPreco) {
      const etapa = nome[i.etapa] ?? i.descricao
      alertas.push(i.etapa === "hotStamping"
        ? `${etapa}: sem preço cadastrado. Cadastre no fornecedor ou digite o valor na coluna Hot Stamping da tabela.`
        : `${etapa}${i.etapa === "laminacao" || i.etapa === "verniz" ? ` (${i.descricao.split(" ").slice(1).join(" ")})` : ""}: sem preço cadastrado. Informe uma estimativa por folha ou cadastre a tabela do fornecedor.`)
    }
  }
  return { porQuantidade, alertas, facaRegistrada }
}
