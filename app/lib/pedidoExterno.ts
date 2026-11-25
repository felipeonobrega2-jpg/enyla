// Ação pedido da porta externa (chaves do COO e do CFO): marca ou libera "aguardando pagamento".
// Não cobra, não cria lançamento, não mexe em a receber nem manda mensagem: só liga ou desliga a marca que tira o pedido do atraso nosso.
import { supabase } from "./supabase"
import { segurar, liberar } from "./pedidoSeguradoServidor"
import type { Segurado } from "./pedidoSegurado"

export type Resultado = { ok: true; resultado: string; aguardandoPagamento: Segurado | null } | { ok: false; status: 400 | 403 | 404; erro: string }

export async function pedidoExterno(diretor: string, b: Record<string, unknown>): Promise<Resultado> {
  if (diretor !== "coo" && diretor !== "cfo") return { ok: false, status: 403, erro: "pedido é só para as chaves do COO e do CFO." }
  const op = b.operacao
  if (op !== "aguardando_pagamento" && op !== "liberar") return { ok: false, status: 400, erro: "operacao: aguardando_pagamento ou liberar." }
  const numero = typeof b.numero === "string" ? b.numero.trim() : ""
  if (!numero) return { ok: false, status: 400, erro: "numero: obrigatório." }
  const { data } = await supabase.from("KanbanCard").select("id").eq("numero", numero).limit(1)
  if (!data?.length) return { ok: false, status: 404, erro: `Pedido ${numero} não encontrado.` }
  if (op === "liberar") {
    const tinha = await liberar(numero, diretor)
    return { ok: true, resultado: tinha ? `Pedido ${numero} liberado: o prazo volta a contar a partir de agora.` : `Pedido ${numero} não estava marcado.`, aguardandoPagamento: null }
  }
  const s = await segurar(numero, diretor, typeof b.motivo === "string" ? b.motivo : undefined)
  return { ok: true, resultado: `Pedido ${numero} segurado: aguardando pagamento do cliente (${s.motivo}). Não conta como atraso nosso.`, aguardandoPagamento: s }
}
