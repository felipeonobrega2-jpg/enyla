// Pagamento no cartão pela página de aprovação: validação dos dados e baixa no financeiro.
// Os dados do cartão nunca são gravados.
import type { KanbanCard } from "@/app/types"

export const PARCELAS_MAX_CARTAO = 3   // sem juros

export type PagamentoCartao = { id?: string; status: string; valor: number; parcelas: number; em?: string; recusas?: string[]; baixado?: boolean }

export type DadosCartao = {
  numero: string; nomeCartao: string; validade: string; cvv: string
  nome: string; documento: string; email: string; celular: string; cep: string; numeroEndereco: string
}

const so = (s: unknown) => String(s ?? "").replace(/\D/g, "")

// Dígito verificador do cartão (Luhn): pega número digitado errado antes de ir ao Asaas
export function luhn(n: string) {
  let s = 0
  for (let i = 0; i < n.length; i++) {
    let d = Number(n[n.length - 1 - i])
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9 }
    s += d
  }
  return n.length >= 13 && s % 10 === 0
}

function cpfValido(c: string) {
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false
  const dv = (n: number) => { let s = 0; for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r }
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10])
}
function cnpjValido(c: string) {
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false
  const dv = (n: number) => { const p = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; const s = p.reduce((a, x, i) => a + x * Number(c[i]), 0); const r = s % 11; return r < 2 ? 0 : 11 - r }
  return dv(12) === Number(c[12]) && dv(13) === Number(c[13])
}

export function validarCartao(b: Partial<DadosCartao>, agora = new Date()):
  { dados: { numero: string; nomeCartao: string; mes: string; ano: string; cvv: string; nome: string; documento: string; email: string; celular: string; cep: string; numeroEndereco: string } } | { erro: string } {
  const numero = so(b.numero)
  if (numero.length < 13 || numero.length > 19 || !luhn(numero)) return { erro: "Número do cartão inválido." }
  const nomeCartao = String(b.nomeCartao ?? "").trim().replace(/\s+/g, " ").slice(0, 60)
  if (nomeCartao.length < 3) return { erro: "Informe o nome como está no cartão." }
  const v = so(b.validade)
  const mes = v.slice(0, 2), ano = v.length === 4 ? `20${v.slice(2)}` : v.slice(2, 6)
  if (!(Number(mes) >= 1 && Number(mes) <= 12) || ano.length !== 4) return { erro: "Validade inválida (use MM/AA)." }
  if (new Date(Number(ano), Number(mes), 0, 23, 59) < agora) return { erro: "Cartão vencido." }
  const cvv = so(b.cvv)
  if (cvv.length < 3 || cvv.length > 4) return { erro: "Código de segurança (CVV) inválido." }
  const nome = String(b.nome ?? "").trim().replace(/\s+/g, " ").slice(0, 100)
  if (nome.split(" ").length < 2) return { erro: "Informe o nome completo do titular." }
  const documento = so(b.documento)
  if (!(cpfValido(documento) || cnpjValido(documento))) return { erro: "CPF ou CNPJ do titular inválido." }
  const email = String(b.email ?? "").trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { erro: "E-mail inválido." }
  const celular = so(b.celular).replace(/^55(?=\d{10,11}$)/, "")
  if (celular.length < 10 || celular.length > 11) return { erro: "Celular inválido (com DDD)." }
  const cep = so(b.cep)
  if (cep.length !== 8) return { erro: "CEP inválido." }
  const numeroEndereco = String(b.numeroEndereco ?? "").trim().slice(0, 10)
  if (!numeroEndereco) return { erro: "Informe o número do endereço do titular." }
  return { dados: { numero, nomeCartao, mes, ano, cvv, nome, documento, email, celular, cep, numeroEndereco } }
}

// Pago no cartão: o sinal pendente criado na aprovação vira o pagamento total (100%), senão cria um lançamento novo
export async function registrarPagoNoCartao(numero: string, card: Pick<KanbanCard, "nomeCliente" | "loteId" | "loteNumero">, pg: PagamentoCartao) {
  const { supabase } = await import("@/app/lib/supabase")
  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
  const campos = {
    valor: pg.valor, status: "pago", dataPagamento: hoje, formaPagamento: "cartao_credito", categoria: "pedido",
    descricao: `Pago no cartão (100%)${pg.parcelas > 1 ? ` em ${pg.parcelas}x` : ""} · ${numero}`,
    obs: `Asaas ${pg.id ?? ""} · cliente pagou na página de aprovação`,
  }
  const { data: sinal } = await supabase.from("LancamentoFinanceiro").select("id").eq("cardNumero", numero).eq("categoria", "sinal").eq("status", "pendente").limit(1)
  if (sinal?.[0]) {
    await supabase.from("LancamentoFinanceiro").update(campos).eq("id", sinal[0].id)
  } else {
    const { data: ja } = await supabase.from("LancamentoFinanceiro").select("id").ilike("obs", `%Asaas ${pg.id}%`).limit(1)
    if (!ja?.length) await supabase.from("LancamentoFinanceiro").insert({
      id: crypto.randomUUID(), tipo: "receita", dataVencimento: hoje, cardNumero: numero, nomeCliente: card.nomeCliente,
      loteId: card.loteId ?? null, loteNumero: card.loteNumero ?? null, criadoEm: new Date().toISOString(), ...campos,
    })
  }
}
