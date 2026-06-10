import { FormData, Calculo, ResultadoFormato, LinhaTabela, FormatoPapel, LayoutChapa } from "./types"
import { FORMATOS_PAPEL } from "./dados"
import { Configuracoes } from "./config"

function calcularDieline(frente: number, lateral: number, alturaBox: number, abaColagem: number) {
  const abaSuperior = Math.round(lateral * 0.9) + 3
  const abaInferior = Math.round(lateral * 0.6) + 3
  const largura = 2 * frente + 2 * lateral + abaColagem
  const altura = alturaBox + abaSuperior + abaInferior + 5
  return { largura, altura, abaColagem, abaSuperior, abaInferior }
}

function testarFolhaInteira(
  dieline: { largura: number; altura: number },
  formato: FormatoPapel
): ResultadoFormato[] {
  const area = formato.largura * formato.altura

  const colN = Math.floor(formato.largura / dieline.largura)
  const linN = Math.floor(formato.altura / dieline.altura)
  const pecasN = colN * linN

  const colR = Math.floor(formato.largura / dieline.altura)
  const linR = Math.floor(formato.altura / dieline.largura)
  const pecasR = colR * linR

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

function calcularLinha(
  quantidade: number,
  melhorFormato: ResultadoFormato,
  form: FormData,
  custoImpressaoFixo: number,
  config: Configuracoes
): LinhaTabela {
  const { custos, multiplicadores } = config
  const folhasReais = Math.ceil(quantidade / melhorFormato.pecasPorFolha)
  const folhasComAcrescimo = Math.ceil(folhasReais * 1.1)
  const folhasPacote = Math.ceil(folhasComAcrescimo / 100) * 100
  const milheiroCorte = folhasPacote / 1000

  const custoPapel = (folhasPacote / 100) * melhorFormato.precoPor100
  const custoImpressao = custoImpressaoFixo
  const custoCorte = custos.corteAcerto + milheiroCorte * custos.corteMilheiro
  const custoVerniz = form.incluirVerniz
    ? Math.max(1, Math.ceil(quantidade / 2000)) * custos.vernizPor2000
    : 0
  const custoColagem = (quantidade / 1000) * custos.colagemMilheiro
  const custoArte = custos.arte
  const custoFaca = form.comFaca ? form.valorFaca : 0

  const custoTotalSemFaca = custoPapel + custoImpressao + custoCorte + custoVerniz + custoColagem + custoArte
  const custoTotalComFaca = custoTotalSemFaca + custoFaca

  const precoSemFaca = custoTotalSemFaca * multiplicadores.semFaca
  const precoComFaca = form.comFaca
    ? custoTotalComFaca * multiplicadores.comFaca
    : precoSemFaca
  const unitarioSemFaca = precoSemFaca / quantidade
  const unitarioComFaca = precoComFaca / quantidade
  const lucroSemFaca = precoSemFaca - custoTotalSemFaca
  const lucroComFaca = precoComFaca - custoTotalComFaca
  const margemSemFaca = (lucroSemFaca / precoSemFaca) * 100
  const margemComFaca = (lucroComFaca / precoComFaca) * 100

  return {
    quantidade,
    folhasReais,
    folhasComAcrescimo,
    folhasPacote,
    milheiroCorte,
    custoPapel,
    custoImpressao,
    custoCorte,
    custoVerniz,
    custoColagem,
    custoArte,
    custoTotalSemFaca,
    custoTotalComFaca,
    precoSemFaca,
    precoComFaca,
    unitarioSemFaca,
    unitarioComFaca,
    lucroSemFaca,
    lucroComFaca,
    margemSemFaca,
    margemComFaca,
    parcela12xSemFaca: (precoSemFaca * multiplicadores.parcelamento12x) / 12,
    parcela12xComFaca: (precoComFaca * multiplicadores.parcelamento12x) / 12,
  }
}

export function calcular(form: FormData, config: Configuracoes): Calculo | null {
  if (!form.frente || !form.lateral || !form.alturaBox) return null

  const dieline = calcularDieline(form.frente * 10, form.lateral * 10, form.alturaBox * 10, form.abaColagem * 10)

  // Override precoPor100 from selected material (or fall back to format default)
  const material = config.materiais.find(m => m.id === form.materialId)
  const formatosComConfig = FORMATOS_PAPEL.map(fmt => {
    const precoPorMaterial = material?.precos[fmt.id]
    return precoPorMaterial != null ? { ...fmt, precoPor100: precoPorMaterial } : fmt
  })

  const todosFormatos: ResultadoFormato[] = []
  for (const fmt of formatosComConfig) {
    todosFormatos.push(...testarFolhaInteira(dieline, fmt))
  }

  const melhorFormato = todosFormatos.reduce((best, curr) =>
    curr.pecasPorFolha > best.pecasPorFolha ? curr : best
  )

  if (melhorFormato.pecasPorFolha === 0) return null

  const formatoPapel = formatosComConfig.find((f) => f.id === melhorFormato.formatoId)!

  const layoutChapa = calcularLayoutChapa(dieline, formatoPapel)

  if (layoutChapa.pecasPorChapa === 0) return null

  const numChapas = Math.max(1, Math.ceil(form.numArtes / layoutChapa.pecasPorChapa))
  const custoImpressaoFixo = numChapas * config.custos.impressaoPorChapa

  const formatoEfetivo = form.customPecasChapa && form.customPecasChapa > 0
    ? { ...melhorFormato, pecasPorFolha: form.customPecasChapa * 2 }
    : melhorFormato

  const quantidades = [...form.quantidades].sort((a, b) => a - b)
  const tabela = quantidades.map((q) => calcularLinha(q, formatoEfetivo, form, custoImpressaoFixo, config))

  const sweetMin = tabela.find((l) => l.margemComFaca >= 40) ?? tabela[0]
  const sweetIdeal = tabela.reduce(
    (best, curr) => (curr.margemSemFaca > best.margemSemFaca ? curr : best),
    tabela[0]
  )

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
  }
}
