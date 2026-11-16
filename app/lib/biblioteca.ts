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
  apelido?: string               // o nome que você dá ("Perfume 20ml fundo automático"); o do arquivo fica guardado
  tags?: string[]                // palavras-chave: "perfume", "20ml", "villa" (categoria é só uma palavra-chave)
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


// ── Nome e palavras-chave (para achar a faca no orçamento sem abrir a página de facas) ─────────
export const nomeDoDesenho = (d: Pick<Desenho, "nome" | "apelido">) => d.apelido?.trim() || nomeBonito(d.nome)

// Sem acento, minúsculo e "20 ml" = "20ml" (é assim que se busca e se guarda a palavra-chave)
export const normalizarBusca = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/(\d)\s+(ml|g|cm|mm|un)\b/g, "$1$2").replace(/[×*]/g, "x").replace(/\s+/g, " ").trim()

// Palavras-chave digitadas ("perfume, 20 ml; Villa") → ["perfume", "20ml", "villa"], sem repetir
export function lerTags(texto: string): string[] {
  const out: string[] = []
  for (const t of texto.split(/[,;\n#]+/).map(normalizarBusca).filter(Boolean)) if (!out.includes(t) && t.length <= 30) out.push(t)
  return out.slice(0, 15)
}

// Tudo o que a busca enxerga de um desenho: seu nome, as palavras-chave, o modelo, o arquivo e as medidas
function textoDeBusca(d: Desenho) {
  const c = d.caixa ? [d.caixa.largura, d.caixa.altura, d.caixa.profundidade].map(n => (n / 10).toLocaleString("pt-BR", { maximumFractionDigits: 1 })) : []
  return normalizarBusca([d.apelido ?? "", ...(d.tags ?? []), d.modelo ?? "", nomeBonito(d.nome), c.join("x")].join(" "))
}

// Busca: toda palavra digitada tem que aparecer (em qualquer campo). Palavra-chave idêntica e o seu nome vêm antes.
export function buscarDesenhos(lista: Desenho[], termo: string): Desenho[] {
  const palavras = normalizarBusca(termo).split(" ").filter(Boolean)
  if (!palavras.length) return lista
  return lista
    .map(d => {
      const tudo = textoDeBusca(d)
      if (!palavras.every(p => tudo.includes(p))) return null
      const tags = (d.tags ?? []).map(normalizarBusca), apelido = normalizarBusca(d.apelido ?? "")
      const pontos = palavras.reduce((s, p) => s + (tags.includes(p) ? 3 : 0) + (apelido.includes(p) ? 2 : 0), 0)
      return { d, pontos }
    })
    .filter((x): x is { d: Desenho; pontos: number } => !!x)
    .sort((a, b) => b.pontos - a.pontos)
    .map(x => x.d)
}

// Palavras-chave mais usadas (atalhos de filtro), da mais comum para a menos
export function tagsMaisUsadas(lista: Desenho[], max = 12): string[] {
  const n = new Map<string, number>()
  for (const d of lista) for (const t of d.tags ?? []) n.set(t, (n.get(t) ?? 0) + 1)
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, max).map(([t]) => t)
}

// Facas guardadas que combinam com o que o cliente pediu na conversa: a caixa (cm, ±5 mm em cada medida, largura e
// profundidade em qualquer ordem) e o volume do frasco (palavra-chave/nome "50ml"). Da mais parecida para a menos.
export type FacaSugerida = { d: Desenho; motivo: string; diferencaMm: number }
export function facasParaPedido(lista: Desenho[], pedido: { caixa_cm?: { frente: number; lateral: number; altura: number } | null; volume_ml?: number | null }): FacaSugerida[] {
  const out = new Map<string, FacaSugerida>()
  const c = pedido.caixa_cm
  if (c && c.frente > 0 && c.lateral > 0 && c.altura > 0) {
    const [f, l, a] = [c.frente * 10, c.lateral * 10, c.altura * 10]
    for (const d of lista) {
      if (!d.caixa) continue
      const { largura: L, profundidade: P, altura: A } = d.caixa
      const difA = Math.abs(A - a)
      const pares = [[Math.abs(L - f), Math.abs(P - l)], [Math.abs(L - l), Math.abs(P - f)]].filter(([x, y]) => x <= 5 && y <= 5)
      if (difA <= 5 && pares.length) out.set(d.id, { d, motivo: `caixa ${descricaoCaixa(d)}`, diferencaMm: difA + Math.min(...pares.map(([x, y]) => x + y)) })
    }
  }
  const ml = pedido.volume_ml
  if (ml && ml > 0) {
    const re = new RegExp(`(^|[^0-9])${Math.round(ml)}ml`)
    for (const d of lista.filter(x => re.test(textoDeBusca(x)))) {
      const ja = out.get(d.id)
      if (ja) ja.motivo = `${ja.motivo} · ${Math.round(ml)} ml`
      else out.set(d.id, { d, motivo: `${Math.round(ml)} ml`, diferencaMm: 50 })
    }
  }
  return [...out.values()].sort((a, b) => a.diferencaMm - b.diferencaMm)
}
