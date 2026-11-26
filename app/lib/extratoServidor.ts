// Importação e leitura do extrato OFX (tabela "extratoLancamento"). Só importa e lê: nunca altera despesas nem recebimentos.
import { supabase } from "./supabase"
import { lerOfx, sugerirCasamentos, JANELA_DIAS, type LinhaExtrato } from "./extratoOfx"

export const TAMANHO_MAX = 2_000_000   // bytes
const LOTE = 500
const ISO = /^\d{4}-\d{2}-\d{2}$/

export async function importarOfx(texto: string, arquivo: string) {
  const { linhas, ignoradas, contas } = lerOfx(texto)
  // Mesmo FITID repetido dentro do arquivo: fica o primeiro
  const unicas = new Map<string, LinhaExtrato>()
  for (const l of linhas) if (!unicas.has(`${l.conta}|${l.fitId}`)) unicas.set(`${l.conta}|${l.fitId}`, l)
  const lista = [...unicas.values()]
  let novos = 0
  for (let i = 0; i < lista.length; i += LOTE) {
    const rows = lista.slice(i, i + LOTE).map(l => ({ ...l, arquivoOrigem: arquivo.slice(0, 200) }))
    const { data, error } = await supabase.from("extratoLancamento").upsert(rows, { onConflict: "conta,fitId", ignoreDuplicates: true }).select("id")
    if (error) throw new Error(/relation|does not exist/i.test(error.message) ? "A tabela extratoLancamento ainda não existe: rode a migração 20261128_extrato_lancamento.sql no Supabase." : error.message)
    novos += data?.length ?? 0
  }
  return { lidos: linhas.length, novos, jaExistiam: lista.length - novos, ignorados: ignoradas, duplicadosNoArquivo: linhas.length - lista.length, contas }
}

const somaDias = (iso: string, n: number) => new Date(Date.parse(iso + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10)

export async function leituraExtrato(p: URLSearchParams): Promise<{ status: number; corpo: Record<string, unknown> }> {
  const de = p.get("de") ?? "", ate = p.get("ate") ?? ""
  if (!ISO.test(de) || !ISO.test(ate) || de > ate) return { status: 400, corpo: { erro: "Informe &de=AAAA-MM-DD&ate=AAAA-MM-DD (de não pode ser depois de ate)." } }
  const { data, error } = await supabase.from("extratoLancamento")
    .select("id, data, valor, tipo, descricao, fitId, conta, arquivoOrigem, importadoEm")
    .gte("data", somaDias(de, -JANELA_DIAS)).lte("data", somaDias(ate, JANELA_DIAS)).order("data", { ascending: true }).limit(5000)
  if (error) return { status: 500, corpo: { erro: /relation|does not exist/i.test(error.message) ? "Tabela extratoLancamento não existe (migração pendente)." : "Falha ao ler o extrato." } }
  const todos = (data ?? []) as { data: string; valor: number | string; tipo: string; descricao: string; fitId: string; conta: string }[]
  const norm = todos.map(l => ({ ...l, valor: Number(l.valor) }))
  const lancamentos = norm.filter(l => l.data >= de && l.data <= ate)
  const { data: desp } = await supabase.from("LancamentoFinanceiro").select("id, descricao, valor, dataPagamento, estornadoEm")
    .eq("tipo", "despesa").eq("status", "pago").gte("dataPagamento", de).lte("dataPagamento", ate + "T23:59:59").limit(5000)
  const pagas = ((desp ?? []) as { id: string; descricao: string; valor: number; dataPagamento?: string; estornadoEm?: string | null }[]).filter(d => !d.estornadoEm)
  return { status: 200, corpo: {
    de, ate, total: lancamentos.length,
    creditos: Math.round(lancamentos.filter(l => l.tipo === "credito").reduce((s, l) => s + l.valor, 0) * 100) / 100,
    debitos: Math.round(lancamentos.filter(l => l.tipo === "debito").reduce((s, l) => s + l.valor, 0) * 100) / 100,
    lancamentos,
    sugestoesDeCasamento: { regra: `despesa paga × débito do extrato com o mesmo valor e data em até ±${JANELA_DIAS} dias. Só sugestão: nada é gravado.`, itens: sugerirCasamentos(pagas, norm) },
  } }
}
