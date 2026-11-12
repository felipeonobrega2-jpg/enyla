// Proposta pronta para aprovar: lead médio/grande passou medida (ou ml/frasco) e quantidade → o sistema monta o
// orçamento com o mesmo motor da tela e o markup que você costuma usar nessa faixa de quantidade; você só aprova
// (ou ajusta) e a proposta com o link de aprovação vai para o cliente. Cada ajuste seu vira aprendizado.
// Aqui só as regras puras; ler/gravar/enviar fica em propostaProntaServidor.

import type { Configuracoes } from "../config"
import type { FormData, Calculo, KanbanOpcao } from "../types"
import type { DadosPedido } from "./atendente"
import { calcular } from "../calculos"
import { padraoDoMl, caberFrasco } from "./digital"
import { QUANTIDADES_PADRAO } from "../dados"

export type StatusProposta = "aguardando" | "enviada" | "descartada"

export type AjusteProposta = { em: string; quantidade: number; sugerido: number; aprovado: number }

export type PropostaPronta = {
  id: string                         // PP-xxxxx
  jid: string; nome: string | null
  em: string
  dados: DadosPedido
  form: FormData
  quantidade: number                 // a principal (a que o cliente pediu)
  opcoes: KanbanOpcao[]              // a pedida e as faixas acima
  custo: number                      // custo da quantidade principal
  preco: number                      // preço sugerido da quantidade principal
  multiplicador: number              // markup usado
  origemMarkup: "seus_orcamentos" | "configuracao"
  medidaPadrao: boolean              // medida tirada do ml (o cliente não deu a caixa)
  status: StatusProposta
  numero?: string                    // ORC criado ao aprovar
  enviadaEm?: string
  precoAprovado?: number
  erro?: string
}

// Medida plausível de caixa em cm
const okCm = (n: number | undefined | null) => typeof n === "number" && n > 0.5 && n < 80

// Caixa do que o cliente contou: medidas da caixa; senão o padrão do ml crescido até caber o frasco; senão só o frasco
export function caixaDosDados(d: DadosPedido): { frente: number; lateral: number; alturaBox: number; padrao: boolean } | null {
  const c = d.caixa_cm
  if (c && okCm(c.frente) && okCm(c.lateral) && okCm(c.altura)) return { frente: c.frente, lateral: c.lateral, alturaBox: c.altura, padrao: false }
  const pad = padraoDoMl(d.volume_ml)
  if (pad) { const m = caberFrasco(pad, d.frasco_cm, c?.altura); return { frente: m.l, lateral: m.p, alturaBox: m.a, padrao: true } }
  // Só as medidas do frasco ("4 x 4 x 12"): três números viram a caixa justa
  if (d.frasco_cm) {
    const m = caberFrasco({ a: 0, l: 0, p: 0 }, d.frasco_cm)
    if (m.a > 0 && m.l > 0 && m.p > 0) return { frente: m.l, lateral: m.p, alturaBox: m.a, padrao: false }
  }
  return null
}

// O que falta para montar (o agente pergunta só isso)
export function faltaParaProposta(d: DadosPedido | null | undefined): string | null {
  if (!d) return "faltam os dados"
  if (!d.quantidade || d.quantidade < 1) return "falta a quantidade"
  if (!caixaDosDados(d)) return "faltam as medidas (da caixa ou do frasco)"
  return null
}

// Quantidades da proposta: a pedida e as duas faixas padrão acima (mostra o ganho de escala)
export function quantidadesDaProposta(q: number): number[] {
  const acima = QUANTIDADES_PADRAO.filter(x => x > q).slice(0, 2)
  return [...new Set([Math.round(q), ...acima])].sort((a, b) => a - b)
}

export type FaixaQtd = "ate2k" | "2a5k" | "5k+"
export const faixaDe = (q: number): FaixaQtd => q < 2000 ? "ate2k" : q < 5000 ? "2a5k" : "5k+"

const mediana = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null
}

// Como você cobra de verdade: cada pedido fechado vira uma amostra (preço ÷ custo que o motor calcula hoje para a
// mesma caixa e quantidade). Fora da conta: abaixo de 1,2× ou acima de 5× (lançamento errado ou caso especial).
export type AmostraMarkup = { quantidade: number; razao: number; primeiroDoCliente: boolean }

// Markup da faixa: seus ajustes na aprovação valem em dobro; o primeiro pedido de cada cliente (o caso do lead novo)
// vale em dobro; mediana. Pouca amostra na faixa: usa todas as faixas; ainda pouca: o padrão das Configurações.
export function markupAprendido(
  q: number,
  amostras: AmostraMarkup[],
  ajustes: (AjusteProposta & { multiplicadorAprovado?: number })[],
  padrao: number,
): { multiplicador: number; origem: PropostaPronta["origemMarkup"] } {
  const faixa = faixaDe(q)
  const validas = amostras.filter(a => a.razao >= 1.2 && a.razao <= 5)
  const pesar = (xs: AmostraMarkup[]) => xs.flatMap(a => a.primeiroDoCliente ? [a.razao, a.razao] : [a.razao])
  const dosAjustes = ajustes.filter(a => faixaDe(a.quantidade) === faixa && a.multiplicadorAprovado).slice(0, 10).map(a => a.multiplicadorAprovado!)
  const naFaixa = validas.filter(a => faixaDe(a.quantidade) === faixa)
  const base = naFaixa.length >= 3 ? naFaixa : validas
  const amostra = [...dosAjustes, ...dosAjustes, ...pesar(base)]
  const m = amostra.length >= 3 ? mediana(amostra) : null
  if (m && m >= 1.2 && m <= 5) return { multiplicador: Math.round(m * 100) / 100, origem: "seus_orcamentos" }
  return { multiplicador: padrao, origem: "configuracao" }
}

// Escolhas que você mais repete nos orçamentos recentes (material, tipo de caixa, verniz, validade)
export function baseDoHistorico(historico: { form?: Partial<FormData> | null }[]): Partial<FormData> {
  const forms = historico.map(h => h.form).filter((f): f is Partial<FormData> => !!f && !f.pecaPlana).slice(0, 40)
  const moda = <T,>(xs: T[]) => {
    const n = new Map<string, { v: T; c: number }>()
    for (const x of xs) { const k = JSON.stringify(x); const e = n.get(k); if (e) e.c++; else n.set(k, { v: x, c: 1 }) }
    return [...n.values()].sort((a, b) => b.c - a.c)[0]?.v
  }
  if (!forms.length) return {}
  const mat = moda(forms.filter(f => f.materialId).map(f => ({ id: f.materialId!, nome: f.materialNome ?? "" })))
  const verniz = moda(forms.map(f => f.incluirVerniz ? (f.vernizTipo || "UV Total") : ""))
  return {
    ...(mat ? { materialId: mat.id, materialNome: mat.nome } : {}),
    ...(moda(forms.map(f => f.tipoCaixa).filter(Boolean)) ? { tipoCaixa: moda(forms.map(f => f.tipoCaixa).filter(Boolean))! } : {}),
    incluirVerniz: !!verniz, vernizTipo: verniz || "",
    ...(moda(forms.map(f => f.validadeDias).filter(Boolean)) ? { validadeDias: moda(forms.map(f => f.validadeDias).filter(Boolean))! } : {}),
  }
}

export const FORM_PROPOSTA: FormData = {
  nomeCliente: "", tipoCaixa: "simples", frente: 0, lateral: 0, alturaBox: 0, abaColagem: 1,
  incluirVerniz: false, vernizTipo: "", laminacao: false, laminacaoTipo: "",
  acompanhamentos: [], outrosAcabamentos: [],
  comFaca: true, valorFaca: 0,
  numSKUs: 1, numArtes: 1, quantidades: [...QUANTIDADES_PADRAO], qualidades: {}, customPecasChapa: null, blankOverride: null,
  obsInterna: "", obsCliente: "", validadeDias: 7, materialId: "cartao300", materialNome: "Cartão 300g",
}

const preco = (form: FormData, l: Calculo["tabela"][number]) => form.comFaca ? l.precoComFaca : l.precoSemFaca
const custo = (form: FormData, l: Calculo["tabela"][number]) => form.comFaca ? l.custoTotalComFaca : l.custoTotalSemFaca

export type Montagem =
  | { ok: true; form: FormData; calculo: Calculo; quantidade: number; opcoes: KanbanOpcao[]; custo: number; preco: number; medidaPadrao: boolean }
  | { ok: false; motivo: string }

// Monta o orçamento: medidas + quantidade do lead, suas escolhas de sempre e o markup da faixa
export function montarProposta(d: DadosPedido, nome: string | null, config: Configuracoes, base: Partial<FormData>, multiplicador: number): Montagem {
  const falta = faltaParaProposta(d)
  if (falta) return { ok: false, motivo: falta }
  const cx = caixaDosDados(d)!
  const q = Math.round(d.quantidade!)
  const obs = [d.resumo, d.frasco_cm ? `Frasco: ${d.frasco_cm}` : "", cx.padrao ? "Medida padrão pelo ml (confirmar com o cliente)" : "", "Proposta montada pelo agente"].filter(Boolean).join(" · ")
  const form: FormData = {
    ...FORM_PROPOSTA, ...base,
    nomeCliente: (nome ?? "").trim(),
    frente: cx.frente, lateral: cx.lateral, alturaBox: cx.alturaBox,
    quantidades: quantidadesDaProposta(q),
    rota: { ...(base.rota ?? {}), multiplicador },
    obsInterna: obs,
  }
  const calculo = calcular(form, config)
  if (!calculo?.tabela.length) return { ok: false, motivo: "o motor não conseguiu calcular essa caixa" }
  const principal = calculo.tabela.find(l => l.quantidade === q) ?? calculo.tabela[0]
  const opcoes = calculo.tabela.map(l => ({ quantidade: l.quantidade, preco: Math.round(preco(form, l) * 100) / 100, unitario: form.comFaca ? l.unitarioComFaca : l.unitarioSemFaca }))
  return {
    ok: true, form, calculo, quantidade: principal.quantidade, opcoes,
    custo: custo(form, principal), preco: Math.round(preco(form, principal) * 100) / 100, medidaPadrao: cx.padrao,
  }
}

// Você mudou o preço na aprovação: as opções acompanham na mesma proporção (o markup novo vale para todas)
export function ajustarPreco(p: Pick<PropostaPronta, "opcoes" | "preco" | "multiplicador" | "custo">, novo: number) {
  const f = p.preco > 0 ? novo / p.preco : 1
  return {
    opcoes: p.opcoes.map(o => ({ ...o, preco: Math.round(o.preco * f * 100) / 100, unitario: o.unitario * f })),
    preco: Math.round(novo * 100) / 100,
    multiplicador: Math.round(p.multiplicador * f * 100) / 100,
    margem: novo > 0 ? (novo - p.custo) / novo : 0,
  }
}

export const margemDe = (p: Pick<PropostaPronta, "preco" | "custo">) => p.preco > 0 ? (p.preco - p.custo) / p.preco : 0

// Nova proposta substitui a anterior da mesma conversa que ainda espera você, se mudou algo (medida, quantidade)
export function mudouAProposta(a: Pick<PropostaPronta, "quantidade" | "form">, b: Pick<PropostaPronta, "quantidade" | "form">) {
  return a.quantidade !== b.quantidade || a.form.frente !== b.form.frente || a.form.lateral !== b.form.lateral || a.form.alturaBox !== b.form.alturaBox
}
