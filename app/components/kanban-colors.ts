// Semantic color system:
//   Neutral  → orçamento aguardando decisão
//   Green    → pedido confirmado (fechado)
//   Orange   → em produção (qualquer etapa)
//   Blue     → entregue ao cliente
//   Red      → perdido

export const COL_COLORS: { bg: string; border: string; badge: string; dot: string }[] = [
  // 0 — Orçamento realizado (neutral — aguardando)
  { bg: "bg-[rgba(116,116,128,0.05)]",  border: "border-[rgba(60,60,67,0.18)]",  badge: "bg-[rgba(116,116,128,0.1)] text-[#8E8E93]",   dot: "bg-[#C7C7CC]"   },
  // 1 — Fechado (green — pedido confirmado)
  { bg: "bg-[#34C759]/[0.07]",          border: "border-[#34C759]/35",           badge: "bg-[#34C759]/[0.12] text-[#34C759]",          dot: "bg-[#34C759]"   },
  // 2 — Arte (orange — em produção)
  { bg: "bg-[#FF9500]/[0.06]",          border: "border-[#FF9500]/30",           badge: "bg-[#FF9500]/[0.1] text-[#FF9500]",           dot: "bg-[#FF9500]"   },
  // 3 — Aprovação (orange)
  { bg: "bg-[#FF9500]/[0.06]",          border: "border-[#FF9500]/30",           badge: "bg-[#FF9500]/[0.1] text-[#FF9500]",           dot: "bg-[#FF9500]"   },
  // 4 — Fila (orange)
  { bg: "bg-[#FF9500]/[0.06]",          border: "border-[#FF9500]/30",           badge: "bg-[#FF9500]/[0.1] text-[#FF9500]",           dot: "bg-[#FF9500]"   },
  // 5 — Impressão (orange)
  { bg: "bg-[#FF9500]/[0.06]",          border: "border-[#FF9500]/30",           badge: "bg-[#FF9500]/[0.1] text-[#FF9500]",           dot: "bg-[#FF9500]"   },
  // 6 — Verniz (orange)
  { bg: "bg-[#FF9500]/[0.06]",          border: "border-[#FF9500]/30",           badge: "bg-[#FF9500]/[0.1] text-[#FF9500]",           dot: "bg-[#FF9500]"   },
  // 7 — Acabamento (orange)
  { bg: "bg-[#FF9500]/[0.06]",          border: "border-[#FF9500]/30",           badge: "bg-[#FF9500]/[0.1] text-[#FF9500]",           dot: "bg-[#FF9500]"   },
  // 8 — Expedição (orange — última etapa de produção)
  { bg: "bg-[#FF9500]/[0.06]",          border: "border-[#FF9500]/30",           badge: "bg-[#FF9500]/[0.1] text-[#FF9500]",           dot: "bg-[#FF9500]"   },
  // 9 — Entregue (blue — concluído)
  { bg: "bg-[#007AFF]/[0.06]",          border: "border-[#007AFF]/30",           badge: "bg-[#007AFF]/[0.1] text-[#007AFF]",           dot: "bg-[#007AFF]"   },
  // 10 — Perdido (red — negativo)
  { bg: "bg-[#FF3B30]/[0.06]",          border: "border-[#FF3B30]/30",           badge: "bg-[#FF3B30]/[0.1] text-[#FF3B30]",           dot: "bg-[#FF3B30]"   },
]
