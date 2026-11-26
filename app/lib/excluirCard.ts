// Excluir card de vez (o X de fora do Kanban): só o admin vê. O diretor perde a venda por "Marcar como perdido".
export function podeExcluirCard(papel: string | undefined | null): boolean {
  return papel === "admin"
}

export const TITULO_EXCLUIR_CARD = "Excluir definitivamente"

export function confirmacaoExcluirCard(nomeCliente: string): string {
  return `Excluir definitivamente "${nomeCliente}"?\n\nO pedido, o histórico e a proposta somem sem volta.\n\nPara perder a venda, o certo é usar "Marcar como perdido" (o ✕ dentro do painel que abre pela seta).`
}
