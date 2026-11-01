// Conciliação de recebimentos: casa cada Pix/crédito do extrato com o que está em aberto.
//
//   Pista 1 — quem pagou: nome do pagador × cliente (e o que já foi ensinado: "fulano paga pela empresa X")
//   Pista 2 — quanto: valor exato de uma cobrança lançada, do saldo do pedido ou do sinal
//   Pista 3 — quando: perto do vencimento da cobrança
//
// Casamento claro → baixa automática; dúvida → sugestão para confirmar; sem pista → fica para você.
// Hoje a entrada vem do extrato exportado do banco (OFX/CSV); depois, da API do banco, no mesmo formato.

import { LancamentoFinanceiro } from "../types"
import { Pedido, pixExpirado, nomeChave } from "./negocio"

export type Entrada = {
  id: string          // identificador do banco (FITID) ou derivado da linha
  data: string        // ISO
  valor: number       // positivo = entrou
  descricao: string
  pagador?: string
}

export type Candidato =
  | { tipo: "cobranca"; pedido?: Pedido; lancamento: LancamentoFinanceiro }
  | { tipo: "pedido"; pedido: Pedido; categoria: "sinal" | "saldo-final" | "parcela" }

export type Sugestao = { candidato: Candidato; pontos: number; motivos: string[] }

export type Resultado = {
  entrada: Entrada
  status: "automatico" | "sugestao" | "sem_par" | "ja_conciliado"
  sugestoes: Sugestao[]
}

export type MemoriaConciliacao = {
  pagadores?: Record<string, string>   // pagador normalizado → nome do cliente
  ignorados?: string[]                 // entradas que não são de cliente
}

export const MARCA = "conc:"          // gravada no obs do lançamento para não importar duas vezes

// ── Leitura de extratos ───────────────────────────────────────────────────────

const numeroBR = (s: string) => {
  const t = s.trim().replace(/\s/g, "").replace(/^R\$/, "")
  if (/^-?\d{1,3}(\.\d{3})*,\d+$/.test(t) || /^-?\d+,\d+$/.test(t)) return parseFloat(t.replace(/\./g, "").replace(",", "."))
  return parseFloat(t)
}
const dataISO = (s: string) => {
  const t = s.trim()
  if (/^\d{8}/.test(t)) return `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`
  const m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  return t.slice(0, 10)
}

// Nome de quem pagou, tirado da descrição do banco ("PIX RECEBIDO - MARIA DA SILVA 123.456...")
export function pagadorDaDescricao(desc: string): string | undefined {
  const limpo = desc
    .replace(/\b(pix|ted|doc|transf(er[eê]ncia)?|recebid[oa]|receb|credito|cr[eé]dito|de|em conta|conta|ag[eê]ncia|cpf|cnpj)\b/gi, " ")
    .replace(/[\d./\\-]{5,}/g, " ")
    .replace(/[^\p{L}\s]/gu, " ")
    .replace(/\s+/g, " ").trim()
  return limpo.length >= 3 ? limpo : undefined
}

export function lerOFX(texto: string): Entrada[] {
  const blocos = texto.split(/<STMTTRN>/i).slice(1)
  const campo = (b: string, tag: string) => b.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, "i"))?.[1]?.trim() ?? ""
  return blocos.map(b => {
    const desc = [campo(b, "NAME"), campo(b, "MEMO")].filter(Boolean).join(" ")
    return { id: campo(b, "FITID") || `${campo(b, "DTPOSTED")}-${campo(b, "TRNAMT")}`, data: dataISO(campo(b, "DTPOSTED")), valor: numeroBR(campo(b, "TRNAMT")), descricao: desc, pagador: pagadorDaDescricao(desc) }
  }).filter(e => e.valor > 0 && e.data)
}

export function lerCSV(texto: string): Entrada[] {
  const linhas = texto.split(/\r?\n/).filter(l => l.trim())
  const sep = (linhas[0].match(/;/g)?.length ?? 0) >= (linhas[0].match(/,/g)?.length ?? 0) ? ";" : ","
  const cab = linhas.findIndex(l => /data/i.test(l) && /(valor|cr[eé]dito)/i.test(l))
  if (cab < 0) return []
  const cols = linhas[cab].split(sep).map(c => c.trim().toLowerCase())
  const iData = cols.findIndex(c => c.startsWith("data"))
  const iDesc = cols.findIndex(c => /(descri|hist[oó]rico|lan[cç]amento)/.test(c))
  const iCred = cols.findIndex(c => /cr[eé]dito/.test(c))
  const iValor = iCred >= 0 ? iCred : cols.findIndex(c => c.includes("valor"))
  return linhas.slice(cab + 1).map((l, n) => {
    const c = l.split(sep).map(x => x.replace(/^"|"$/g, ""))
    const desc = c[iDesc] ?? ""
    const valor = numeroBR(c[iValor] ?? "")
    const data = dataISO(c[iData] ?? "")
    return { id: `csv-${data}-${valor}-${n}`, data, valor, descricao: desc, pagador: pagadorDaDescricao(desc) }
  }).filter(e => Number.isFinite(e.valor) && e.valor > 0 && /^\d{4}-\d{2}-\d{2}$/.test(e.data))
}

export const lerExtrato = (texto: string) => /<OFX>|<STMTTRN>/i.test(texto) ? lerOFX(texto) : lerCSV(texto)

// ── Casamento ─────────────────────────────────────────────────────────────────

const PALAVRAS_VAZIAS = new Set(["da", "de", "do", "das", "dos", "e", "ltda", "me", "mei", "eireli", "sa", "epp", "comercio", "com"])
const tokens = (s: string) => nomeChave(s).replace(/[^a-z\s]/g, " ").split(/\s+/).filter(t => t.length > 1 && !PALAVRAS_VAZIAS.has(t))

// 0..1: quanto o nome do pagador parece o cliente
export function semelhancaNome(pagador: string | undefined, cliente: string, memoria: MemoriaConciliacao): number {
  if (!pagador) return 0
  const ensinado = memoria.pagadores?.[nomeChave(pagador)]
  if (ensinado) return nomeChave(ensinado) === nomeChave(cliente) ? 1 : 0
  const a = tokens(pagador), b = tokens(cliente)
  if (!a.length || !b.length) return 0
  if (a.join(" ") === b.join(" ")) return 1
  const comuns = a.filter(t => b.includes(t)).length
  return comuns / Math.min(a.length, b.length)
}

const igual = (x: number, y: number) => Math.abs(x - y) < 0.01
const dias = (a: string, b: string) => Math.abs((new Date(a + "T12:00:00").getTime() - new Date(b + "T12:00:00").getTime()) / 86_400_000)

export function conciliar(args: {
  entradas: Entrada[]
  pedidos: Pedido[]
  lancamentos: LancamentoFinanceiro[]
  memoria?: MemoriaConciliacao
  hoje?: string
}): Resultado[] {
  const memoria = args.memoria ?? {}
  const hoje = args.hoje ?? new Date().toLocaleDateString("sv-SE")
  const conciliados = new Set(args.lancamentos.flatMap(l => (l.obs ?? "").split(/\s+/).filter(t => t.startsWith(MARCA)).map(t => t.slice(MARCA.length))))
  const comSaldo = args.pedidos.filter(p => p.aReceber > 0.5)
  const usados = new Set<string>()   // um candidato não serve para dois Pix do mesmo extrato

  return [...args.entradas].sort((a, b) => a.data.localeCompare(b.data)).map(entrada => {
    if (conciliados.has(entrada.id) || memoria.ignorados?.includes(entrada.id)) return { entrada, status: "ja_conciliado" as const, sugestoes: [] }
    const sugestoes: Sugestao[] = []

    for (const p of comSaldo) {
      const nome = semelhancaNome(entrada.pagador, p.nomeCliente, memoria)
      const motivoNome = nome >= 0.99 ? "pagador é o cliente" : nome >= 0.5 ? "nome parecido com o cliente" : null
      // Cobranças lançadas e em aberto
      const cobrancas = p.receitas.filter(l => l.status !== "pago" && !p.sobrasQuitadas.includes(l.id) && !pixExpirado(l, hoje))
      for (const l of cobrancas) {
        if (usados.has(l.id)) continue
        const valor = igual(l.valor, entrada.valor) ? 1 : 0
        if (!valor && nome < 0.5) continue
        const perto = dias(l.dataVencimento, entrada.data) <= 10 ? 0.05 : 0
        sugestoes.push({
          candidato: { tipo: "cobranca", pedido: p, lancamento: l },
          pontos: 0.5 * nome + 0.45 * valor + perto,
          motivos: [motivoNome, valor ? "valor exato da cobrança" : null, perto ? "perto do vencimento" : null].filter(Boolean) as string[],
        })
      }
      // Sem cobrança lançada: saldo inteiro, sinal (metade) ou parte do saldo
      if (usados.has(p.key)) continue
      const semPagamento = p.recebido < 0.5
      const valor = igual(p.aReceber, entrada.valor) ? 1 : semPagamento && igual(p.venda / 2, entrada.valor) ? 0.9 : entrada.valor < p.aReceber ? 0.3 : 0
      if (!valor || (nome < 0.5 && valor < 0.9)) continue
      const categoria = igual(p.aReceber, entrada.valor) ? (semPagamento ? "parcela" : "saldo-final") : semPagamento ? "sinal" : "parcela"
      sugestoes.push({
        candidato: { tipo: "pedido", pedido: p, categoria },
        pontos: 0.5 * nome + 0.45 * valor,
        motivos: [motivoNome, valor === 1 ? "valor exato do saldo" : valor === 0.9 ? "metade do pedido (sinal)" : "parte do saldo"].filter(Boolean) as string[],
      })
    }

    sugestoes.sort((a, b) => b.pontos - a.pontos)
    const [melhor, segundo] = sugestoes
    // Automático: nome e valor batem, e não há outro candidato quase tão bom
    const claro = !!melhor && melhor.pontos >= 0.9 && (!segundo || melhor.pontos - segundo.pontos >= 0.2)
    if (claro) {
      const c = melhor.candidato
      usados.add(c.tipo === "cobranca" ? c.lancamento.id : c.pedido.key)
    }
    return {
      entrada,
      status: claro ? "automatico" as const : melhor && melhor.pontos >= 0.4 ? "sugestao" as const : "sem_par" as const,
      sugestoes: sugestoes.slice(0, 4),
    }
  })
}

// Lançamento a gravar ao confirmar (baixa numa cobrança existente ou recebimento novo no pedido)
export function aplicarConciliacao(e: Entrada, c: Candidato): { atualizar?: { id: string; campos: Partial<LancamentoFinanceiro> }; criar?: LancamentoFinanceiro } {
  const marca = `${MARCA}${e.id}`
  if (c.tipo === "cobranca") {
    return { atualizar: { id: c.lancamento.id, campos: { status: "pago", dataPagamento: e.data, formaPagamento: c.lancamento.formaPagamento ?? "pix", obs: [c.lancamento.obs, marca].filter(Boolean).join(" ") } } }
  }
  const p = c.pedido
  const lote = p.tipo === "lote"
  return {
    criar: {
      id: `${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
      tipo: "receita", status: "pago", formaPagamento: "pix", valor: e.valor,
      descricao: `${c.categoria === "sinal" ? "Sinal" : c.categoria === "saldo-final" ? "Saldo" : "Pagamento"} ${p.numero} — ${p.nomeCliente}`,
      categoria: c.categoria, nomeCliente: p.nomeCliente, dataVencimento: e.data, dataPagamento: e.data,
      ...(lote ? { loteId: p.cards[0].loteId, loteNumero: p.numero } : { cardId: p.cards[0].id, cardNumero: p.numero }),
      obs: marca, criadoEm: new Date().toLocaleString("pt-BR"),
    },
  }
}
