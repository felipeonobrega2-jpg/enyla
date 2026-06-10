import { FormatoPapel } from "./types"

export const FORMATOS_PAPEL: FormatoPapel[] = [
  {
    id: "66x96",
    nome: "66×96 cm",
    largura: 660,
    altura: 960,
    precoPor100: 160,
    larguraChapa: 660, // meia folha: 66×48 cm
    alturaChapa: 480,
  },
  {
    id: "77x113",
    nome: "77×113 cm",
    largura: 770,
    altura: 1130,
    precoPor100: 220,
    larguraChapa: 770, // meia folha: 77×56,5 cm
    alturaChapa: 565,
  },
]

export const CUSTOS = {
  impressaoPorChapa: 350,
  corteAcerto: 50,
  corteMilheiro: 50,
  vernizPor2000: 55,
  colagemMilheiro: 39,
  arte: 200, // fixo por orçamento, independe do número de artes
} as const

export const MULTIPLICADORES = {
  semFaca: 2.0,
  comFaca: 1.8,
  parcelamento12x: 1.2,
} as const

export const QUANTIDADES_PADRAO = [1000, 2000, 3000, 5000, 10000]
