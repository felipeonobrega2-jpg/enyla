// Parser de OFX (SGML do Santander e XML) e sugestão de casamento com despesas pagas. Funções puras: nada é gravado aqui.
import { createHash } from "node:crypto"

export type LinhaExtrato = {
  data: string          // AAAA-MM-DD
  valor: number         // sempre positivo
  tipo: "credito" | "debito"
  descricao: string
  fitId: string
  conta: string
}

const tag = (b: string, t: string) => b.match(new RegExp(`<${t}>\\s*([^<\\r\\n]*)`, "i"))?.[1]?.trim() ?? ""
const decodificar = (s: string) => s.replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&apos;/gi, "'")

// Número do OFX: "-1234.56" (ponto) ou, por tolerância, "-1.234,56" (vírgula decimal)
export function valorOfx(s: string): number {
  let t = s.trim().replace(/\s/g, "")
  if (!t) return NaN
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".")
  return /^[+-]?\d+(\.\d+)?$/.test(t) ? Number(t) : NaN
}

// DTPOSTED: 20261105, 20261105120000 ou 20261105120000[-3:BRT] → AAAA-MM-DD
export function dataOfx(s: string): string {
  const m = s.trim().match(/^(\d{4})(\d{2})(\d{2})/)
  if (!m) return ""
  const [, a, me, d] = m
  const dt = new Date(`${a}-${me}-${d}T12:00:00Z`)
  return dt.getUTCMonth() + 1 === Number(me) && dt.getUTCDate() === Number(d) ? `${a}-${me}-${d}` : ""
}

export type ResultadoOfx = { linhas: LinhaExtrato[]; ignoradas: number; contas: string[] }

export function lerOfx(texto: string): ResultadoOfx {
  const corpo = texto.replace(/^﻿/, "")
  if (!/<OFX>|<STMTTRN>/i.test(corpo)) throw new Error("O arquivo não parece um OFX (sem <OFX> nem <STMTTRN>).")
  // Cada extrato (STMTRS/CCSTMTRS) traz a sua conta; sem cabeçalho de conta, fica "desconhecida"
  const secoes = corpo.split(/<STMTRS>|<CCSTMTRS>/i)
  const linhas: LinhaExtrato[] = []
  const contas = new Set<string>()
  let ignoradas = 0
  secoes.forEach((sec, i) => {
    const temConta = i > 0 || /<STMTTRN>/i.test(sec)
    if (!temConta) return
    const acct = tag(sec, "ACCTID")
    const banco = tag(sec, "BANKID")
    const conta = acct ? (banco ? `${banco}/${acct}` : acct) : "desconhecida"
    const blocos = sec.split(/<STMTTRN>/i).slice(1)
    blocos.forEach((b, n) => {
      const bloco = b.split(/<\/STMTTRN>|<\/BANKTRANLIST>|<\/STMTRS>|<\/CCSTMTRS>/i)[0]
      const data = dataOfx(tag(bloco, "DTPOSTED"))
      const bruto = valorOfx(tag(bloco, "TRNAMT"))
      if (!data || !Number.isFinite(bruto) || bruto === 0) { ignoradas++; return }
      const nome = decodificar(tag(bloco, "NAME")), memo = decodificar(tag(bloco, "MEMO"))
      const descricao = [nome, memo].filter((x, j, a) => x && a.indexOf(x) === j).join(" - ")
      const valor = Math.round(Math.abs(bruto) * 100) / 100
      const tipo = bruto > 0 ? "credito" : "debito"
      const fitId = tag(bloco, "FITID") || "sem-" + createHash("sha1").update(`${data}|${bruto}|${descricao}|${n}`).digest("hex").slice(0, 16)
      linhas.push({ data, valor, tipo, descricao, fitId, conta })
      contas.add(conta)
    })
  })
  return { linhas, ignoradas, contas: [...contas] }
}

// ── Sugestão de casamento (não grava nada) ──────────────────────────────────
export const JANELA_DIAS = 3

type Despesa = { id: string; descricao: string; valor: number; dataPagamento?: string | null }
type Lanc = { id?: string; data: string; valor: number; tipo: string; descricao: string; fitId: string; conta: string }

const diasEntre = (a: string, b: string) => Math.round((Date.parse(a.slice(0, 10) + "T12:00:00Z") - Date.parse(b.slice(0, 10) + "T12:00:00Z")) / 86400000)
const cents = (n: number) => Math.round(n * 100)

export function sugerirCasamentos(despesasPagas: Despesa[], extrato: Lanc[]) {
  const debitos = extrato.filter(l => l.tipo === "debito")
  return despesasPagas.filter(d => d.dataPagamento).map(d => {
    const candidatos = debitos
      .filter(l => cents(l.valor) === cents(d.valor) && Math.abs(diasEntre(l.data, d.dataPagamento!)) <= JANELA_DIAS)
      .map(l => ({ fitId: l.fitId, conta: l.conta, data: l.data, valor: l.valor, descricao: l.descricao, diferencaDias: diasEntre(l.data, d.dataPagamento!) }))
      .sort((a, b) => Math.abs(a.diferencaDias) - Math.abs(b.diferencaDias))
    return { despesa: { id: d.id, descricao: d.descricao, valor: d.valor, dataPagamento: d.dataPagamento!.slice(0, 10) }, candidatos }
  }).filter(s => s.candidatos.length > 0)
}
