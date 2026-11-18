// Texto que acompanha o PDF da proposta no WhatsApp: a caixa, o material e os acabamentos (o cliente confere sem
// abrir o PDF), o preço da quantidade recomendada e o link para ver em 3D e aprovar.

import type { FormData, Calculo } from "../types"
import { brl, num } from "../utils"
import { nomeParaChamar } from "./nomeDePessoa"

const TIPO_CAIXA: Record<string, string> = {
  simples: "Caixa cartucho", aviao: "Caixa avião", "fundo-automatico": "Caixa com fundo automático", americano: "Caixa fundo americano",
}
const n = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })

// "Caixa com fundo automático · 6 × 10,5 × 3 cm (L × A × P)", "Material: …", "Acabamentos: …", "Acompanha: …"
export function especificacaoDaProposta(form: FormData): string[] {
  const tipo = form.pecaPlana?.nome || (form.caixaDxf?.modelo ?? (form.blankOverride ? null : TIPO_CAIXA[form.tipoCaixa] ?? null))
  const medidas = form.pecaPlana ? `${n(form.pecaPlana.largura)} × ${n(form.pecaPlana.comprimento)} cm`
    : form.frente ? `${n(form.frente)} × ${n(form.alturaBox)} × ${n(form.lateral)} cm (L × A × P)`
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
    form.frenteVerso ? "Impressão frente e verso" : null,
    acabamentos.length ? `Acabamentos: ${cap(acabamentos.join(", "))}` : null,
    acomp.length ? `Acompanha: ${acomp.join(", ")}` : null,
    form.numSKUs > 1 ? `${form.numSKUs} modelos de arte` : null,
    form.comFaca ? "Faca de corte inclusa" : null,
    form.freteGratis ? "Frete grátis para entregas em São Paulo" : null,
  ].filter(Boolean) as string[]
}

export function mensagemProposta(form: FormData, calculo: Calculo, numero: string, link: string | null) {
  const ideal = calculo.tabela.find(l => l.quantidade === calculo.sweetSpotIdealQtd) ?? calculo.tabela[calculo.tabela.length - 1]
  const primeiro = nomeParaChamar(form.nomeCliente)
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

// Lote: tamanhos diferentes do mesmo cliente numa mensagem só, cada item com o seu preço e o seu link de aprovação
export function mensagemLote(itens: { form: FormData; calculo: Calculo; numero: string; link: string | null }[]) {
  const primeiro = nomeParaChamar(itens[0]?.form.nomeCliente)
  let soma = 0
  const blocos = itens.map((it, i) => {
    const ideal = it.calculo.tabela.find(l => l.quantidade === it.calculo.sweetSpotIdealQtd) ?? it.calculo.tabela[it.calculo.tabela.length - 1]
    const total = ideal ? (it.form.comFaca ? ideal.precoComFaca : ideal.precoSemFaca) : 0
    const unit = ideal ? (it.form.comFaca ? ideal.unitarioComFaca : ideal.unitarioSemFaca) : 0
    soma += total
    const [cabeca, ...resto] = especificacaoDaProposta(it.form)
    return [
      `${i + 1}. ${cabeca ?? `Item ${i + 1}`}`,
      ...resto.filter(l => !l.startsWith("Frete grátis") && (!l.startsWith("Material") || i === 0 || it.form.materialNome !== itens[0].form.materialNome)),
      ideal ? `${num(ideal.quantidade)} unidades · ${brl(total)} à vista (${brl(unit)}/un)` : null,
      it.link ? `Ver em 3D e aprovar: ${it.link}` : null,
    ].filter(Boolean).join("\n")
  })
  return [
    `Oi${primeiro ? `, ${primeiro}` : ""}! Segue a proposta das ${itens.length} embalagens.`,
    ...blocos.map(b => `\n${b}`),
    itens.length > 1 ? `\nTotal dos ${itens.length} itens: ${brl(soma)} à vista` : null,
    itens.some(it => it.form.freteGratis) ? "Frete grátis para entregas em São Paulo." : null,
    `\nNo PDF tem todas as quantidades de cada uma. Pode fechar todas ou só as que quiser.`,
    `Qualquer dúvida, é só me chamar.`,
  ].filter(Boolean).join("\n")
}
