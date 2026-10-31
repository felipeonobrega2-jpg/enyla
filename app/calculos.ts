import { FormData, Calculo, ResultadoFormato, LinhaTabela, FormatoPapel, LayoutChapa, TipoCaixa } from "./types"
import { calcularRotas, normalizarProducao, Rota } from "./lib/producao"
import { FORMATOS_PAPEL } from "./dados"
import { Configuracoes } from "./config"

function calcularDieline(frente: number, lateral: number, alturaBox: number, abaColagem: number, tipoCaixa: TipoCaixa = "simples") {
  let abaSuperior: number
  let abaInferior: number

  switch (tipoCaixa) {
    case "aviao":
      // Tampa avião: aba profunda com formato especial (superior = lateral + folga asa)
      abaSuperior = Math.round(lateral * 1.1) + 8
      abaInferior = Math.round(lateral * 0.55) + 3
      break
    case "fundo-automatico":
      // Fundo automático: base com gussets laterais (inferior maior)
      abaSuperior = Math.round(lateral * 0.9) + 3
      abaInferior = Math.round(lateral * 1.2) + 5
      break
    case "americano":
      // American lock: 4 abas independentes — profundidade = frente/2
      abaSuperior = Math.round(lateral * 0.9) + 3
      abaInferior = Math.round(frente * 0.5) + 6
      break
    case "simples":
    default:
      abaSuperior = Math.round(lateral * 0.9) + 3
      abaInferior = Math.round(lateral * 0.6) + 3
  }

  const largura = 2 * frente + 2 * lateral + abaColagem
  const altura = alturaBox + abaSuperior + abaInferior + 5
  return { largura, altura, abaColagem, abaSuperior, abaInferior, tipoCaixa }
}

function testarFolhaInteira(
  dieline: { largura: number; altura: number },
  formato: FormatoPapel
): ResultadoFormato[] {
  // Usa dimensões da CHAPA (meia folha) — cada peça precisa caber numa única chapa
  // peças/folha = 2 × peças/chapa, consistente com o canvas
  const area = formato.largura * formato.altura
  const cW   = formato.larguraChapa
  const cH   = formato.alturaChapa

  const colN = Math.floor(cW / dieline.largura)
  const linN = Math.floor(cH / dieline.altura)
  const pecasN = colN * linN * 2

  const colR = Math.floor(cW / dieline.altura)
  const linR = Math.floor(cH / dieline.largura)
  const pecasR = colR * linR * 2

  return [
    {
      formatoId: formato.id,
      formatoNome: formato.nome,
      larguraMM: formato.largura,
      alturaMM: formato.altura,
      precoPor100: formato.precoPor100,
      orientacao: "normal",
      colunas: colN,
      linhas: linN,
      pecasPorFolha: pecasN,
      aproveitamentoPct: pecasN > 0 ? (pecasN * dieline.largura * dieline.altura) / area * 100 : 0,
    },
    {
      formatoId: formato.id,
      formatoNome: formato.nome,
      larguraMM: formato.largura,
      alturaMM: formato.altura,
      precoPor100: formato.precoPor100,
      orientacao: "rotacionada",
      colunas: colR,
      linhas: linR,
      pecasPorFolha: pecasR,
      aproveitamentoPct: pecasR > 0 ? (pecasR * dieline.altura * dieline.largura) / area * 100 : 0,
    },
  ]
}

// Calcula o melhor layout da dieline dentro da chapa real (meia folha)
export function calcularLayoutChapa(
  dieline: { largura: number; altura: number },
  formato: FormatoPapel
): LayoutChapa {
  const cW = formato.larguraChapa
  const cH = formato.alturaChapa

  // Normal
  const colN = Math.floor(cW / dieline.largura)
  const linN = Math.floor(cH / dieline.altura)
  const pecasN = colN * linN

  // Rotacionada 90°
  const colR = Math.floor(cW / dieline.altura)
  const linR = Math.floor(cH / dieline.largura)
  const pecasR = colR * linR

  const rotacionada = pecasR > pecasN
  const colunas = rotacionada ? colR : colN
  const linhas = rotacionada ? linR : linN
  const larguraDieline = rotacionada ? dieline.altura : dieline.largura
  const alturaDieline = rotacionada ? dieline.largura : dieline.altura

  return {
    larguraChapa: cW,
    alturaChapa: cH,
    larguraDieline,
    alturaDieline,
    colunas,
    linhas,
    pecasPorChapa: Math.max(0, colunas * linhas),
    rotacionada,
  }
}

// Converte a rota mais barata de uma quantidade na linha da tabela de orçamento
function linhaDaRota(rota: Rota, multiplicador: number, parcelamento12x: number): LinhaTabela {
  const v = (etapa: string) => rota.itens.filter(i => i.etapa === etapa).reduce((s, i) => s + i.valor, 0)
  const qtd = rota.quantidade
  const custoTotalComFaca = rota.custoTotal
  const custoTotalSemFaca = rota.custoTotal - v("faca")
  const precoComFaca = custoTotalComFaca * multiplicador
  const precoSemFaca = custoTotalSemFaca * multiplicador
  return {
    quantidade: qtd,
    folhasReais: Math.ceil(qtd / rota.pecasPorPeca) * rota.passadas.reduce((s, p) => s + p.porPeca, 0),
    folhasComAcrescimo: rota.folhasImpressas,
    folhasPacote: rota.folhasPapel,
    milheiroCorte: rota.batidas / 1000,
    custoPapel: v("papel"),
    custoImpressao: v("impressao"),
    custoCorte: v("corteVinco"),
    custoVerniz: v("verniz") + v("laminacao"),
    custoColagem: v("colagem"),
    custoArte: v("arte"),
    custoTotalSemFaca,
    custoTotalComFaca,
    precoSemFaca,
    precoComFaca,
    unitarioSemFaca: precoSemFaca / qtd,
    unitarioComFaca: precoComFaca / qtd,
    lucroSemFaca: precoSemFaca - custoTotalSemFaca,
    lucroComFaca: precoComFaca - custoTotalComFaca,
    margemSemFaca: precoSemFaca > 0 ? (precoSemFaca - custoTotalSemFaca) / precoSemFaca * 100 : 0,
    margemComFaca: precoComFaca > 0 ? (precoComFaca - custoTotalComFaca) / precoComFaca * 100 : 0,
    parcela12xSemFaca: (precoSemFaca * parcelamento12x) / 12,
    parcela12xComFaca: (precoComFaca * parcelamento12x) / 12,
    precoPor100Papel: rota.folhasPapel > 0 ? v("papel") / rota.folhasPapel * 100 : 0,
    custoLaminacao: v("laminacao"),
    custoHotStamping: v("hotStamping") + v("cliche") + v("fotolito"),
    custoFrete: v("frete"),
    custoFerramental: rota.custoFerramental,
    imposto: rota.imposto,
    lucroLiquido: rota.lucroLiquido,
    margemLiquida: rota.margemLiquidaPct,
    estimado: rota.estimado,
    rotaId: rota.id,
    rotaResumo: `${rota.impressorNome} · ${rota.divisaoNome} ${rota.formatoNome} · ${rota.passadas.map(p => p.cavidades).join(" + ")} cav.`,
  }
}

// Guarda só a melhor rota de cada combinação impressor × papel × divisão (com a faca mais barata)
function alternativasCompactas(todas: Rota[], melhor: Rota): Rota[] {
  const vistos = new Set<string>([`${melhor.impressorId}|${melhor.formatoId}|${melhor.divisao}`])
  const out: Rota[] = [melhor]
  for (const r of todas) {
    const k = `${r.impressorId}|${r.formatoId}|${r.divisao}`
    if (vistos.has(k)) continue
    vistos.add(k)
    out.push(r)
  }
  // Mantém também as opções de faca da combinação em uso, para comparar
  for (const r of todas) {
    if (r.id !== melhor.id && r.impressorId === melhor.impressorId && r.formatoId === melhor.formatoId && r.divisao === melhor.divisao) out.push(r)
  }
  return out.slice(0, 14)
}

export function calcular(form: FormData, config: Configuracoes): Calculo | null {
  // Permite calcular com só o DXF importado (sem L/A/P)
  const temDim = form.frente > 0 && form.lateral > 0 && form.alturaBox > 0
  if (!temDim && !form.blankOverride) return null

  const dielineCalc = calcularDieline(
    (form.frente  || 1) * 10,
    (form.lateral || 1) * 10,
    (form.alturaBox || 1) * 10,
    form.abaColagem * 10,
    form.tipoCaixa,
  )
  // Se o usuário importou um DXF real (Pacdora), usa as dimensões reais do blank
  const dieline = form.blankOverride
    ? { ...dielineCalc, largura: form.blankOverride.largura, altura: form.blankOverride.altura }
    : dielineCalc

  // Preço do papel por material (ou o padrão do formato)
  const material = config.materiais.find(m => m.id === form.materialId)
  const formatosComConfig = FORMATOS_PAPEL.map(fmt => {
    const precoPorMaterial = material?.precos?.[fmt.id]
    return precoPorMaterial != null ? { ...fmt, precoPor100: precoPorMaterial } : fmt
  })

  const todosFormatos: ResultadoFormato[] = []
  for (const fmt of formatosComConfig) todosFormatos.push(...testarFolhaInteira(dieline, fmt))

  const producao = normalizarProducao(config.producao)
  const multiplicador = form.rota?.multiplicador || config.multiplicadores.semFaca || 2
  const quantidades = [...form.quantidades].filter(q => q > 0).sort((a, b) => a - b)

  const rotas = calcularRotas({
    blank: { largura: dieline.largura, altura: dieline.altura },
    quantidades,
    numArtes: Math.max(1, form.numArtes),
    tipoCaixa: form.tipoCaixa,
    cliente: form.nomeCliente,
    comFaca: form.comFaca,
    valorFaca: form.comFaca ? form.valorFaca : 0,
    laminacaoTipo: form.laminacao ? (form.laminacaoTipo || "Fosca") : null,
    vernizTipo: form.incluirVerniz ? (form.vernizTipo || "UV Total") : null,
    hotStamping: (form.outrosAcabamentos ?? []).includes("Hot Stamping"),
    limitePecasMeiaFolha: form.customPecasChapa,
    formatos: formatosComConfig.map(f => ({ id: f.id, nome: f.nome, largura: f.largura, altura: f.altura, precoPor100: f.precoPor100 })),
    arte: config.custos.arte,
    multiplicador,
    vernizPor2000Legado: config.custos.vernizPor2000,
    opcoes: form.rota ?? {},
    producao,
  })
  if (!rotas.porQuantidade.length) return null

  const tabela = rotas.porQuantidade.map(q => linhaDaRota(q.melhor, multiplicador, config.multiplicadores.parcelamento12x))

  // Rota de referência (maior quantidade) para os indicadores de layout
  const ref = rotas.porQuantidade[rotas.porQuantidade.length - 1].melhor
  const formatoRef = formatosComConfig.find(f => f.id === ref.formatoId) ?? formatosComConfig[0]
  const melhorFormato: ResultadoFormato = {
    formatoId: formatoRef.id,
    formatoNome: formatoRef.nome,
    larguraMM: formatoRef.largura,
    alturaMM: formatoRef.altura,
    precoPor100: formatoRef.precoPor100,
    orientacao: "normal",
    colunas: 0,
    linhas: 0,
    pecasPorFolha: ref.pecasPorFolhaPapel,
    aproveitamentoPct: ref.pecasPorFolhaPapel * dieline.largura * dieline.altura / (formatoRef.largura * formatoRef.altura) * 100,
  }
  const layoutChapa = calcularLayoutChapa(dieline, formatoRef)
  const numChapas = ref.passadas.length * ref.jogos
  const custoImpressaoFixo = ref.itens.filter(i => i.etapa === "impressao").reduce((s, i) => s + i.valor, 0)

  // Mínimo: menor tiragem; ideal: primeira tiragem em que subir de faixa melhora menos de 15% no unitário
  const unitarioDe = (l: LinhaTabela) => form.comFaca ? l.unitarioComFaca : l.unitarioSemFaca
  const sweetMin = tabela[0]
  const sweetIdeal = (() => {
    for (let i = 0; i < tabela.length - 1; i++) {
      const curr = unitarioDe(tabela[i])
      const next = unitarioDe(tabela[i + 1])
      if (curr <= 0) continue
      if ((curr - next) / curr < 0.15) return tabela[i]
    }
    return tabela[tabela.length - 1]
  })()

  return {
    dieline,
    formData: { frente: form.frente * 10, lateral: form.lateral * 10, alturaBox: form.alturaBox * 10 },
    formatos: todosFormatos,
    melhorFormato,
    layoutChapa,
    numChapas,
    custoImpressaoFixo,
    tabela,
    sweetSpotMinimoQtd: sweetMin?.quantidade ?? 0,
    sweetSpotIdealQtd: sweetIdeal?.quantidade ?? 0,
    rotas: rotas.porQuantidade.map(q => ({ quantidade: q.quantidade, melhor: q.melhor, alternativas: alternativasCompactas(q.alternativas, q.melhor).sort((a, b) => a.custoTotal - b.custoTotal) })),
    alertas: rotas.alertas,
    facaRegistrada: rotas.facaRegistrada,
  }
}

// Para salvar no histórico: só a rota usada em cada tiragem (as alternativas são recalculáveis)
export function compactarCalculo(c: Calculo): Calculo {
  return { ...c, rotas: c.rotas?.map(q => ({ quantidade: q.quantidade, melhor: q.melhor, alternativas: [] })) }
}
