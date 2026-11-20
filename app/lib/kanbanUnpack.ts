// Card do Kanban como vem do banco → como a tela usa (opções e dados extras empacotados em "opcoes"). Compartilhado
// pela tela e pelo servidor (relatório semanal).
import type { KanbanCard } from "../types"

export function unpackTerceirizado(card: KanbanCard): KanbanCard {
  const raw = card as KanbanCard & { observacoes_os?: string }
  const unpacked: KanbanCard = {
    ...card,
    // Não existe coluna no banco — a flag só vivia em memória e se perdia ao recarregar
    isTerceirizado: card.isTerceirizado || card.materialNome === "Terceirizado",
    cores: card.cores,
    acabamentos: card.acabamentos,
    observacoesOS: card.observacoesOS ?? raw.observacoes_os,
  }
  const ops = card.opcoes as unknown as
    | { _items?: KanbanCard["opcoes"]; _x?: { fornecedor?: string; custoTerceiro?: number; projecaoCustos?: import("../types").ProjecaoCustos; prazos?: import("../types").PrazoEtapas; prazoRecebimentoInterno?: string } }
    | null
  if (!ops || Array.isArray(ops)) return unpacked
  // Wrapped format: { _items?, _x? }
  const items = ops._items
  const x = ops._x ?? {}
  return {
    ...unpacked,
    opcoes: items as KanbanCard["opcoes"] ?? (card.materialNome === "Terceirizado" ? undefined : unpacked.opcoes),
    fornecedor: x.fornecedor || card.fornecedor,
    custoTerceiro: x.custoTerceiro ?? card.custoTerceiro,
    projecaoCustos: x.projecaoCustos ?? card.projecaoCustos,
    prazos: x.prazos ?? card.prazos,
    prazoRecebimentoInterno: x.prazoRecebimentoInterno ?? card.prazoRecebimentoInterno,
  }
}
