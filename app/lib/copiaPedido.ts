// Pedido copiado (duplicar na tela, repetir no portal): o custo de terceiro do pedido antigo não vale para o novo.
// Campos que não migram: custoTerceiro, fornecedor, projecaoCustos (coluna e/ou opcoes._x), além de prazos e prazo interno.
const CAMPOS_X = ["custoTerceiro", "fornecedor", "projecaoCustos", "prazos", "prazoRecebimentoInterno"] as const

type Opcoes = { _items?: unknown[]; _x?: Record<string, unknown> } | unknown[] | null | undefined

// Tira os campos do pedido antigo de opcoes._x. Sem sobrar nada em _x, volta ao formato sem embrulho (_items ou null).
export function limparOpcoesX<T extends Opcoes>(opcoes: T): T | unknown[] | null {
  if (!opcoes || Array.isArray(opcoes) || !opcoes._x) return opcoes
  const x = { ...opcoes._x }
  for (const k of CAMPOS_X) delete x[k]
  return Object.keys(x).length ? { ...opcoes, _x: x } : (opcoes._items ?? null)
}

// Card da tela (duplicar): zera os campos soltos e os de opcoes._x
export function limparCustoTerceiroCard<T extends { opcoes?: unknown }>(card: T): T {
  return {
    ...card,
    custoTerceiro: undefined, fornecedor: undefined, projecaoCustos: undefined,
    prazos: undefined, prazoRecebimentoInterno: undefined,
    opcoes: limparOpcoesX(card.opcoes as Opcoes) ?? undefined,
  }
}
