// Biblioteca de facas: o DESENHO (DXF do Pacdora, uma peça, a caixa aberta) e as FACAS físicas (o desenho repetido em
// X cavidades, com fornecedor e cliente). Todo DXF que entra no orçamento fica guardado; a faca física aponta para o
// desenho dela. Aqui só as regras puras (o servidor guarda o arquivo; a tela desenha).

import { FORMATOS_PAPEL } from "../dados"
import { encaixar, type Ferramental } from "./producao"
import { folhaDaFaca } from "./precoDigital"

export type Desenho = {
  id: string                     // hash do arquivo (o mesmo DXF não duplica)
  nome: string                   // nome do arquivo do Pacdora
  modelo?: string                // fundo automático, cartucho…
  caixa: { largura: number; altura: number; profundidade: number } | null   // caixa montada, mm
  blank: { largura: number; altura: number }                                // caixa aberta (a peça), mm
  criadoEm: string
}

const ESPACO_MM = 3   // entre peças na folha

// Onde a peça cabe: folha do digital (A4/A3) e quantas por folha no offset (melhor formato)
export function ondeCabe(d: Pick<Desenho, "blank">) {
  const digital = folhaDaFaca(d.blank.largura / 10, d.blank.altura / 10)
  const offset = FORMATOS_PAPEL.map(f => ({ formato: f.nome, porFolha: encaixar(f.largura, f.altura, d.blank.largura, d.blank.altura, ESPACO_MM) }))
    .sort((a, b) => b.porFolha - a.porFolha)
  return { digital, offset }
}

// Que frasco serve: a caixa com uns 2 mm de folga em cada lado (altura e diâmetro máximos, em cm)
export function frascoQueServe(d: Pick<Desenho, "caixa">) {
  if (!d.caixa) return null
  return { altura: Math.max(0, (d.caixa.altura - 3) / 10), diametro: Math.max(0, (Math.min(d.caixa.largura, d.caixa.profundidade) - 3) / 10) }
}

// Busca pelo frasco do cliente (cm): caixas que servem com folga de 2 a 10 mm na altura e de 2 a 8 mm na largura,
// da mais justa para a mais folgada
export function servemParaFrasco(desenhos: Desenho[], alturaCm: number, diametroCm: number) {
  const h = alturaCm * 10, dm = diametroCm * 10
  return desenhos
    .filter(d => d.caixa)
    .map(d => {
      const c = d.caixa!
      const lado = Math.min(c.largura, c.profundidade)
      return { d, folgaAltura: c.altura - h, folgaLado: lado - dm }
    })
    .filter(x => x.folgaAltura >= 2 && x.folgaAltura <= 10 && x.folgaLado >= 2 && x.folgaLado <= 8)
    .sort((a, b) => (a.folgaAltura + a.folgaLado) - (b.folgaAltura + b.folgaLado))
}

// Facas físicas deste desenho: as ligadas a ele, ou (as antigas, de antes da biblioteca) com a mesma peça (±1 mm)
export function facasDoDesenho(d: Pick<Desenho, "id" | "blank">, ferramentais: (Ferramental & { desenhoId?: string })[]) {
  const mesma = (f: Ferramental) =>
    (Math.abs(f.blankLargura - d.blank.largura) <= 1 && Math.abs(f.blankAltura - d.blank.altura) <= 1)
    || (Math.abs(f.blankLargura - d.blank.altura) <= 1 && Math.abs(f.blankAltura - d.blank.largura) <= 1)
  return ferramentais.filter(f => f.tipo === "faca" && (f.desenhoId ? f.desenhoId === d.id : mesma(f)))
}

// Texto curto do card: "Caixa 50 × 120 × 50 mm · peça 21,4 × 18,7 cm"
export const cm = (mm: number) => (mm / 10).toLocaleString("pt-BR", { maximumFractionDigits: 1 })
export const descricaoCaixa = (d: Pick<Desenho, "caixa">) =>
  d.caixa ? `${cm(d.caixa.largura)} × ${cm(d.caixa.altura)} × ${cm(d.caixa.profundidade)} cm` : "medida da caixa não lida"

// Nome legível a partir do arquivo do Pacdora: "dieline_de_caixa_com_fundo_automático_52×32×85_mm (1).dxf" →
// "Caixa com fundo automático 52×32×85 mm"
export function nomeBonito(nome: string) {
  const t = nome.replace(/\.dxf$/i, "").replace(/\s*\(\d+\)$/, "").replace(/^dieline_de_/i, "").replace(/_/g, " ").replace(/\s+/g, " ").trim()
  return t ? t[0].toUpperCase() + t.slice(1) : nome
}
