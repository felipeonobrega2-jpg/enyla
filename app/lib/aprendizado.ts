// Motor que aprende: transforma a calibragem (previsto × real por pedido) em sugestões
// concretas de ajuste nos preços cadastrados. Nada muda sem o usuário aplicar, e todo
// ajuste aplicado guarda o valor anterior para poder desfazer.
//
// Como o previsto é recalculado com os preços de hoje, depois de aplicar um ajuste o
// desvio daquele item cai para perto de zero e a sugestão some sozinha.

import { Configuracoes } from "../config"
import { FORMATOS_PAPEL } from "../dados"
import { Comparacao, comparavel } from "./calibragem"
import { ConfigProducao, RegraCobranca, Servico, descreverRegra, normalizarProducao } from "./producao"

export const AMOSTRA_MINIMA = 3       // pedidos com o custo lançado
export const DESVIO_MINIMO = 12       // % abaixo disso conta como acerto
const FATOR_MIN = 0.5, FATOR_MAX = 2.5

type AlvoServico = { tipo: "servico"; fornecedorId: string; servicos: Servico[] }
type AlvoPapel = { tipo: "papel"; materialId: string }
type AlvoFaca = { tipo: "faca" }
export type Alvo = AlvoServico | AlvoPapel | AlvoFaca

export type Sugestao = {
  chave: string                  // identifica o alvo (para ignorar e para o histórico)
  titulo: string                 // "Impressão · Matheus Impressão"
  alvo: Alvo
  pedidos: string[]              // números dos pedidos usados
  previsto: number
  real: number
  desvioPct: number              // (real − previsto) ÷ previsto
  fator: number                  // multiplicador sugerido para os preços
  mudancas: { de: string; para: string }[]
  periodo: { de?: string; ate?: string }
  // Pedidos que discordam entre si: multiplicar o preço não resolve, a regra precisa de revisão
  inconsistente?: { motivo: string; porPedido: { numero: string; quantidade: number; razao: number; jogos?: number }[] }
  foraDaCurva?: { numero: string; razao: number }[]   // pedidos deixados de fora da conta
  porFolha?: { mediana: number; min: number; max: number }  // custo real por folha impressa (serviço sem tabela)
}

export type AjusteAplicado = {
  id: string
  data: string
  chave: string
  titulo: string
  fator: number
  pedidos: number
  mudancas: { de: string; para: string }[]
  antes: unknown                 // regra(s) / preços / ferramental antes do ajuste
}

export type Aprendizado = {
  ajustes: AjusteAplicado[]
  ignorados: Record<string, string>   // chave → data em que foi ignorada (volta depois de 30 dias)
}

export const aprendizadoDe = (p: ConfigProducao): Aprendizado =>
  ({ ajustes: p.aprendizado?.ajustes ?? [], ignorados: p.aprendizado?.ignorados ?? {} })

const COMP_SERVICOS: { componente: "impressao" | "acabamento" | "hotStamping" | "corteVinco" | "colagem"; nome: string; servicos: Servico[] }[] = [
  { componente: "impressao", nome: "Impressão", servicos: ["impressao"] },
  { componente: "acabamento", nome: "Laminação e verniz", servicos: ["laminacao", "verniz"] },
  { componente: "hotStamping", nome: "Hot stamping", servicos: ["hotStamping"] },
  { componente: "corteVinco", nome: "Corte e vinco", servicos: ["corteVinco"] },
  { componente: "colagem", nome: "Colagem", servicos: ["colagem"] },
]

const r2 = (n: number) => Math.round(n * 100) / 100
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

export function escalarRegra(r: RegraCobranca, f: number): RegraCobranca {
  const out: RegraCobranca = { ...r }
  if (r.acerto != null) out.acerto = r2(r.acerto * f)
  if (r.milheiro != null) out.milheiro = r2(r.milheiro * f)
  if (r.valor != null) out.valor = r2(r.valor * f)
  if (r.precosPorTipo) out.precosPorTipo = Object.fromEntries(Object.entries(r.precosPorTipo).map(([k, v]) => [k, r2(v * f)]))
  return out
}

type PorPedido = { numero: string; quantidade: number; razao: number; prev: number; real: number; data?: string; jogos: number }
type Acumulado = { prev: number; real: number; pedidos: string[]; razoes: PorPedido[] }
const acumular = (m: Map<string, Acumulado>, k: string, prev: number, real: number, c: Comparacao) => {
  const a = m.get(k) ?? { prev: 0, real: 0, pedidos: [], razoes: [] }
  a.prev += prev; a.real += real; a.pedidos.push(c.pedido.numero)
  a.razoes.push({ numero: c.pedido.numero, quantidade: c.pedido.quantidade, razao: real / prev, prev, real, data: c.pedido.dataFechamento, jogos: c.jogosChapa })
  m.set(k, a)
}

// Separa a maioria que concorda (razão real ÷ previsto até 2× da mediana) dos pedidos fora da curva
function separar(razoes: PorPedido[]): { dentro: PorPedido[]; fora: PorPedido[] } {
  const ord = [...razoes].sort((a, b) => a.razao - b.razao)
  const meio = ord.length / 2
  const mediana = ord.length % 2 ? ord[Math.floor(meio)].razao : (ord[meio - 1].razao + ord[meio].razao) / 2
  const dentro = razoes.filter(r => r.razao >= mediana / 2 && r.razao <= mediana * 2)
  return { dentro, fora: razoes.filter(r => !dentro.includes(r)) }
}

// Sem maioria que concorde: diz o que parece estar errado na regra
function diagnosticar(razoes: PorPedido[]): NonNullable<Sugestao["inconsistente"]> {
  const porQtd = [...razoes].sort((a, b) => a.quantidade - b.quantidade)
  const cresce = porQtd.every((r, i) => i === 0 || r.razao >= porQtd[i - 1].razao)
  const cai = porQtd.every((r, i) => i === 0 || r.razao <= porQtd[i - 1].razao)
  const motivo = cresce && porQtd[0].quantidade !== porQtd[porQtd.length - 1].quantidade
    ? "O custo real cresce com a tiragem mais do que o motor prevê: a regra parece não cobrar pela quantidade (ex.: fixo por chapa). Cadastre acerto + milheiro, ou faixas, com a tabela do fornecedor."
    : cai && porQtd[0].quantidade !== porQtd[porQtd.length - 1].quantidade
      ? "Nas tiragens pequenas o real sai bem acima do previsto e nas grandes, abaixo: o acerto (custo fixo) parece baixo e o milheiro, alto. Revise a regra com a tabela do fornecedor."
      : "Os pedidos não concordam entre si: em alguns o real ficou muito acima, em outros muito abaixo. Confira se os custos estão no pedido certo e se outro fornecedor fez o serviço."
  return { motivo, porPedido: porQtd.map(r => ({ numero: r.numero, quantidade: r.quantidade, razao: r.razao })) }
}

export function sugerirAjustes(comps: Comparacao[], cfg: Configuracoes, hoje = new Date()): Sugestao[] {
  const prod = normalizarProducao(cfg.producao)
  const { ignorados } = aprendizadoDe(prod)
  const base = comps.filter(comparavel)
  const porServico = new Map<string, Acumulado>()
  const porPapel = new Map<string, Acumulado>()
  const faca = new Map<string, Acumulado>()
  const acabPorFolha = new Map<string, { numero: string; porFolha: number; data?: string }[]>()

  for (const c of base) {
    // Serviços: só quando o motor usou preço cadastrado (não estimado) de um único fornecedor
    for (const cs of COMP_SERVICOS) {
      const real = c.real[cs.componente] ?? 0
      if (real <= 0) continue
      const itens = c.previstoItens.filter(i => (cs.servicos as string[]).includes(i.etapa) && i.valor > 0)
      const fornecedores = new Set(itens.map(i => i.fornecedorId))
      if (!itens.length || fornecedores.size !== 1 || itens.some(i => i.estimado || !i.fornecedorId)) continue
      // Só pedidos em que os lançamentos dizem quem fez, e o motor recalculou com esse fornecedor
      if (c.fornecedorReal[cs.componente] !== itens[0].fornecedorId) continue
      acumular(porServico, `${cs.componente}|${itens[0].fornecedorId}`, itens.reduce((s, i) => s + i.valor, 0), real, c)
    }
    // Laminação/verniz sem tabela: aprende quanto tem custado por folha impressa, por fornecedor
    const acabReal = c.real.acabamento ?? 0
    const acabItens = c.previstoItens.filter(i => i.etapa === "laminacao" || i.etapa === "verniz")
    if (acabReal > 0 && c.folhasImpressas > 0 && acabItens.length && acabItens.every(i => i.estimado)) {
      const quem = c.fornecedorReal.acabamento ?? acabItens[0].fornecedorId ?? "?"
      acabPorFolha.set(quem, [...(acabPorFolha.get(quem) ?? []), { numero: c.pedido.numero, porFolha: acabReal / c.folhasImpressas, data: c.pedido.dataFechamento }])
    }
    // Papel: pedidos de um único material
    const papelReal = c.real.papel ?? 0, papelPrev = c.previsto?.papel ?? 0
    if (papelReal > 0 && papelPrev > 0 && c.materiais.length === 1) acumular(porPapel, c.materiais[0], papelPrev, papelReal, c)
    // Faca: só onde o motor usou a tabela padrão (sem o valor do faquista)
    const facaReal = c.real.faca ?? 0, facaPrev = c.previsto?.faca ?? 0
    if (facaReal > 0 && facaPrev > 0 && c.facaPelaTabela) acumular(faca, "faca", facaPrev, facaReal, c)
  }

  const out: Sugestao[] = []
  const montar = (chave: string, titulo: string, alvo: Alvo, a: Acumulado, mudancas: (f: number) => { de: string; para: string }[]) => {
    if (a.pedidos.length < AMOSTRA_MINIMA || a.prev <= 0) return
    const ign = ignorados[chave]
    if (ign && (hoje.getTime() - new Date(ign + "T12:00:00").getTime()) / 86_400_000 < 30) return
    const { dentro, fora } = separar(a.razoes)
    const datas = a.razoes.map(r => r.data).filter(Boolean).sort() as string[]
    const periodo = { de: datas[0], ate: datas[datas.length - 1] }
    // Sem maioria clara (pelo menos 2 pedidos e 60% da amostra): pede revisão da regra
    if (dentro.length < AMOSTRA_MINIMA || dentro.length / a.razoes.length < 0.6) {
      const desvioPct = (a.real - a.prev) / a.prev * 100
      if (Math.abs(desvioPct) < DESVIO_MINIMO) return
      out.push({ chave, titulo, alvo, pedidos: a.pedidos, previsto: a.prev, real: a.real, desvioPct, fator: 1, mudancas: [], periodo, inconsistente: diagnosticar(a.razoes) })
      return
    }
    // Impressão: o desvio vem dos jogos de chapa (várias artes), não do preço da chapa
    if (alvo.tipo === "servico" && chave.startsWith("servico|impressao|")) {
      const multi = dentro.filter(r => r.jogos > 1)
      if (multi.length / dentro.length >= 2 / 3 && multi.every(r => r.razao * r.jogos >= 0.75 && r.razao * r.jogos <= 1.3)) {
        out.push({
          chave, titulo, alvo, pedidos: a.pedidos, previsto: a.prev, real: a.real, desvioPct: (a.real - a.prev) / a.prev * 100, fator: 1, mudancas: [], periodo,
          inconsistente: {
            motivo: `Nesses pedidos o motor cobrou uma chapa por grupo de artes (${[...new Set(multi.map(r => r.jogos))].join(" ou ")} jogos), mas o real bate com um jogo só. O preço da chapa está certo: confira o número de artes do orçamento, ou se o fornecedor imprime as artes juntas.`,
            porPedido: a.razoes.map(r => ({ numero: r.numero, quantidade: r.quantidade, razao: r.razao, jogos: r.jogos })),
          },
        })
        return
      }
    }
    const prev = dentro.reduce((s, r) => s + r.prev, 0), real = dentro.reduce((s, r) => s + r.real, 0)
    const desvioPct = (real - prev) / prev * 100
    if (Math.abs(desvioPct) < DESVIO_MINIMO) return
    const fator = Math.min(FATOR_MAX, Math.max(FATOR_MIN, real / prev))
    const m = mudancas(fator)
    if (!m.length) return
    out.push({
      chave, titulo, alvo, pedidos: dentro.map(r => r.numero), previsto: prev, real, desvioPct, fator, mudancas: m, periodo,
      foraDaCurva: fora.length ? fora.map(r => ({ numero: r.numero, razao: r.razao })) : undefined,
    })
  }

  for (const [k, a] of porServico) {
    const [componente, fornecedorId] = k.split("|")
    const cs = COMP_SERVICOS.find(x => x.componente === componente)!
    const f = prod.fornecedores.find(x => x.id === fornecedorId)
    if (!f) continue
    const servicos = cs.servicos.filter(s => f.servicos[s])
    montar(`servico|${componente}|${fornecedorId}`, `${cs.nome} · ${f.nome}`, { tipo: "servico", fornecedorId, servicos }, a, fator =>
      servicos.map(s => ({ de: descreverRegra(f.servicos[s]), para: descreverRegra(escalarRegra(f.servicos[s]!, fator)) })))
  }
  for (const [materialId, a] of porPapel) {
    const mat = cfg.materiais.find(m => m.id === materialId)
    if (!mat) continue
    montar(`papel|${materialId}`, `Papel · ${mat.nome}`, { tipo: "papel", materialId }, a, fator =>
      FORMATOS_PAPEL.map(fmt => {
        const atual = mat.precos?.[fmt.id] ?? fmt.precoPor100
        return { de: `${fmt.nome}: ${brl(atual)} / 100 fls`, para: `${brl(r2(atual * fator))} / 100 fls` }
      }))
  }
  for (const [, a] of faca) {
    const fp = prod.ferramentalPadrao
    montar("faca", "Faca · tabela padrão", { tipo: "faca" }, a, fator => [
      { de: `${brl(fp.facaBase)} + ${brl(fp.facaPorCavidade)} por cavidade`, para: `${brl(r2(fp.facaBase * fator))} + ${brl(r2(fp.facaPorCavidade * fator))} por cavidade` },
    ])
  }
  for (const [fornecedorId, lista] of acabPorFolha) {
    if (lista.length < AMOSTRA_MINIMA) continue
    const chave = `acabamentoFolha|${fornecedorId}`
    const ign = ignorados[chave]
    if (ign && (hoje.getTime() - new Date(ign + "T12:00:00").getTime()) / 86_400_000 < 30) continue
    const ord = [...lista].sort((a, b) => a.porFolha - b.porFolha)
    const mediana = ord[Math.floor(ord.length / 2)].porFolha
    const f = prod.fornecedores.find(x => x.id === fornecedorId)
    const datas = lista.map(x => x.data).filter(Boolean).sort() as string[]
    out.push({
      chave, titulo: `Laminação e verniz · ${f?.nome ?? "sem fornecedor identificado"}`, alvo: { tipo: "servico", fornecedorId, servicos: ["laminacao", "verniz"] },
      pedidos: lista.map(x => x.numero), previsto: 0, real: 0, desvioPct: 0, fator: 1, mudancas: [], periodo: { de: datas[0], ate: datas[datas.length - 1] },
      porFolha: { mediana, min: ord[0].porFolha, max: ord[ord.length - 1].porFolha },
      inconsistente: {
        motivo: `Não há tabela de preço cadastrada, e o orçamento usa estimativa. Nos pedidos lançados, laminação + verniz custaram em média ${brl(mediana)} por folha impressa (de ${brl(ord[0].porFolha)} a ${brl(ord[ord.length - 1].porFolha)}). Cadastre a tabela do fornecedor por tipo, ou use ${brl(mediana)} como estimativa por folha nas escolhas da rota.`,
        porPedido: [],
      },
    })
  }
  return out.sort((a, b) => Math.abs(b.real - b.previsto) - Math.abs(a.real - a.previsto))
}

const novoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
const comAprendizado = (prod: ConfigProducao, a: Aprendizado): ConfigProducao => ({ ...prod, aprendizado: a })

export function aplicarSugestao(cfg: Configuracoes, s: Sugestao, hojeIso: string): Configuracoes {
  const prod = normalizarProducao(cfg.producao)
  const apr = aprendizadoDe(prod)
  let antes: unknown
  let producao = prod
  let materiais = cfg.materiais

  if (s.alvo.tipo === "servico") {
    const { fornecedorId, servicos } = s.alvo
    const f = prod.fornecedores.find(x => x.id === fornecedorId)
    if (!f) return cfg
    antes = { fornecedorId, servicos: Object.fromEntries(servicos.map(sv => [sv, f.servicos[sv]])) }
    const novos = { ...f.servicos }
    for (const sv of servicos) if (novos[sv]) novos[sv] = escalarRegra(novos[sv]!, s.fator)
    producao = { ...prod, fornecedores: prod.fornecedores.map(x => x.id === fornecedorId ? { ...x, servicos: novos } : x) }
  } else if (s.alvo.tipo === "papel") {
    const { materialId } = s.alvo
    const mat = cfg.materiais.find(m => m.id === materialId)
    if (!mat) return cfg
    antes = { materialId, precos: mat.precos }
    const precos = Object.fromEntries(FORMATOS_PAPEL.map(fmt => [fmt.id, r2((mat.precos?.[fmt.id] ?? fmt.precoPor100) * s.fator)]))
    materiais = cfg.materiais.map(m => m.id === materialId ? { ...m, precos: { ...m.precos, ...precos } } : m)
  } else {
    antes = { ferramentalPadrao: prod.ferramentalPadrao }
    const fp = prod.ferramentalPadrao
    producao = { ...prod, ferramentalPadrao: { ...fp, facaBase: r2(fp.facaBase * s.fator), facaPorCavidade: r2(fp.facaPorCavidade * s.fator) } }
  }

  const ajuste: AjusteAplicado = { id: novoId(), data: hojeIso, chave: s.chave, titulo: s.titulo, fator: s.fator, pedidos: s.pedidos.length, mudancas: s.mudancas, antes }
  const ignorados = { ...apr.ignorados }
  delete ignorados[s.chave]
  return { ...cfg, materiais, producao: comAprendizado(producao, { ajustes: [ajuste, ...apr.ajustes].slice(0, 50), ignorados }) }
}

export function desfazerAjuste(cfg: Configuracoes, id: string): Configuracoes {
  const prod = normalizarProducao(cfg.producao)
  const apr = aprendizadoDe(prod)
  const a = apr.ajustes.find(x => x.id === id)
  if (!a) return cfg
  let producao = prod
  let materiais = cfg.materiais
  const antes = a.antes as Record<string, unknown>

  if (a.chave.startsWith("servico|")) {
    const fornecedorId = antes.fornecedorId as string
    const servicos = antes.servicos as Partial<Record<Servico, RegraCobranca>>
    producao = { ...prod, fornecedores: prod.fornecedores.map(f => f.id === fornecedorId ? { ...f, servicos: { ...f.servicos, ...servicos } } : f) }
  } else if (a.chave.startsWith("papel|")) {
    const materialId = antes.materialId as string
    materiais = cfg.materiais.map(m => m.id === materialId ? { ...m, precos: (antes.precos as Record<string, number>) ?? {} } : m)
  } else if (a.chave === "faca") {
    producao = { ...prod, ferramentalPadrao: antes.ferramentalPadrao as ConfigProducao["ferramentalPadrao"] }
  }
  return { ...cfg, materiais, producao: comAprendizado(producao, { ...apr, ajustes: apr.ajustes.filter(x => x.id !== id) }) }
}

export function ignorarSugestao(cfg: Configuracoes, chave: string, hojeIso: string): Configuracoes {
  const prod = normalizarProducao(cfg.producao)
  const apr = aprendizadoDe(prod)
  return { ...cfg, producao: comAprendizado(prod, { ...apr, ignorados: { ...apr.ignorados, [chave]: hojeIso } }) }
}
