// Texto que acompanha o PDF da proposta no WhatsApp: a caixa, o material e os acabamentos (o cliente confere sem
// abrir o PDF), o preço da quantidade recomendada e o link para ver em 3D e aprovar.

import type { FormData, Calculo } from "../types"
import { brl, num } from "../utils"

const TIPO_CAIXA: Record<string, string> = {
  simples: "Caixa cartucho", aviao: "Caixa avião", "fundo-automatico": "Caixa com fundo automático", americano: "Caixa fundo americano",
}
const n = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })

// "Caixa com fundo automático · 6 × 10,5 × 3 cm (L × A × P)", "Material: …", "Acabamentos: …", "Acompanha: …"
export function especificacaoDaProposta(form: FormData): string[] {
  const tipo = form.caixaDxf?.modelo ?? (form.blankOverride ? null : TIPO_CAIXA[form.tipoCaixa] ?? null)
  const medidas = form.frente ? `${n(form.frente)} × ${n(form.alturaBox)} × ${n(form.lateral)} cm (L × A × P)`
    : form.caixaDxf ? `${[form.caixaDxf.largura, form.caixaDxf.altura, form.caixaDxf.profundidade].map(v => n(v / 10)).join(" × ")} cm (L × A × P)` : null
  const acabamentos = [
    form.incluirVerniz && form.vernizTipo ? `verniz ${form.vernizTipo}` : null,
    form.laminacao && form.laminacaoTipo ? `laminação ${form.laminacaoTipo.toLowerCase()}` : null,
    ...(form.outrosAcabamentos ?? []).map(a => a.toLowerCase()),
  ].filter(Boolean) as string[]
  const acomp = (form.acompanhamentos ?? []).map(a => a.toLowerCase())
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
  return [
    [tipo ? `*${tipo}*` : null, medidas].filter(Boolean).join(" · ") || null,
    form.materialNome ? `Material: ${form.materialNome}` : null,
    acabamentos.length ? `Acabamentos: ${cap(acabamentos.join(", "))}` : null,
    acomp.length ? `Acompanha: ${acomp.join(", ")}` : null,
    form.numSKUs > 1 ? `${form.numSKUs} modelos de arte` : null,
    form.comFaca ? "Faca de corte inclusa" : null,
  ].filter(Boolean) as string[]
}

export function mensagemProposta(form: FormData, calculo: Calculo, numero: string, link: string | null) {
  const ideal = calculo.tabela.find(l => l.quantidade === calculo.sweetSpotIdealQtd) ?? calculo.tabela[calculo.tabela.length - 1]
  const primeiro = form.nomeCliente.trim().split(/\s+/)[0]
  const total = ideal ? (form.comFaca ? ideal.precoComFaca : ideal.precoSemFaca) : 0
  const unit = ideal ? (form.comFaca ? ideal.unitarioComFaca : ideal.unitarioSemFaca) : 0
  const spec = especificacaoDaProposta(form)
  return [
    `Oi${primeiro ? `, ${primeiro}` : ""}! Segue a proposta ${numero} da sua embalagem.`,
    spec.length ? `\n${spec.join("\n")}` : null,
    ideal ? `\n${num(ideal.quantidade)} unidades · ${brl(total)} à vista (${brl(unit)}/un)` : null,
    link ? `\nPara ver a caixa em 3D e aprovar: ${link}` : null,
    `\nQualquer dúvida, é só me chamar.`,
  ].filter(Boolean).join("\n")
}
