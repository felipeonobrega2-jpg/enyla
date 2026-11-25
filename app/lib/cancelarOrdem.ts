// Porta externa, ação cancelar_ordem: o diretor cancela uma ordem SUA que ainda espera o Aprovo.
// Só troca o status para "cancelado" (com quem e quando). Nunca apaga a ação nem a mensagem; nada é enviado.
import { lerConversa, gravarConversa } from "./diretoriaServidor"
import type { IdDiretor } from "./diretoria"

export async function cancelarOrdem(diretor: IdDiretor, b: Record<string, unknown>): Promise<{ status: number; corpo: Record<string, unknown> }> {
  const id = typeof b.id === "string" ? b.id.trim() : ""
  if (!id) return { status: 400, corpo: { erro: "Falta o id da ordem (o id do cartão, em ?o=conversa ou na resposta de ordenar_funcionario)." } }
  // Lê e grava a lista inteira (como responderAcao): só esta conversa, a do próprio diretor
  const todas = await lerConversa(diretor)
  const acao = todas.flatMap(m => m.acoes ?? []).find(a => a.id === id)
  if (!acao || acao.tipo !== "mensagem") return { status: 404, corpo: { erro: "Ordem não encontrada entre as suas. Nada mudou." } }
  if (acao.status !== "aguardando") return { status: 409, corpo: { erro: `Só se cancela ordem que ainda espera o Aprovo; esta está "${acao.status}". Nada mudou.` } }
  acao.status = "cancelado"
  acao.canceladoPor = diretor
  acao.canceladoEm = new Date().toISOString()
  await gravarConversa(diretor, todas)
  return { status: 200, corpo: { ok: true, resultado: `Ordem cancelada (${acao.funcionario} para ${acao.cliente}). Nada foi enviado nem apagado.`, id } }
}
