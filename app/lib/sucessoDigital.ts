// Sucesso do Cliente Digital (issue #175), PR 1: modelo puro da etapa da arte e dos horários.
// Só leitura de campos já gravados no pedido. Nada é gravado, nenhuma mensagem sai.
// Reaproveita arteEnviadaEm / arteAprovadaEm / statusEm / ajustes. Se a #164 entregar `situacaoArte`, ela entra como entrada opcional.

export type EtapaArte = "aguardando_arte_cliente" | "ajuste_pedido" | "prova_enviada" | "aprovada"
export type Devedor = "cliente" | "enyla" | "ninguem"

export type PedidoArte = {
  status: string
  sinalPagoEm?: string; statusEm?: string
  artes?: unknown[]; arteEnviadaEm?: string; arteAprovadaEm?: string
  ajustes?: { texto?: string; em: string }[]
  ajusteEnviadoLeandroEm?: string   // chave JSON nova, aditiva: quando o ajuste foi ao Leandro (canal interno, PR 3)
  provaDevolvidaEm?: string         // chave JSON nova, aditiva: quando a prova voltou do Leandro
}

const maior = (...ds: (string | undefined)[]) => ds.filter((d): d is string => !!d).sort().at(-1)

/** Etapa da arte do pedido (só faz sentido com o sinal pago). */
export function etapaArte(p: PedidoArte): EtapaArte {
  if (p.arteAprovadaEm) return "aprovada"
  const ultimoAjuste = p.ajustes?.at(-1)?.em
  // prova em mãos do cliente: foi enviada e nenhum ajuste veio depois
  if (p.arteEnviadaEm && (!ultimoAjuste || ultimoAjuste < p.arteEnviadaEm)) return "prova_enviada"
  if (ultimoAjuste) return "ajuste_pedido"
  return "aguardando_arte_cliente"
}

/** Quem está devendo o próximo passo: o cliente (arte ou aprovação) ou a ENYLA (ajuste com o Leandro, prova que não saiu). */
export function quemDeve(etapa: EtapaArte): Devedor {
  return etapa === "ajuste_pedido" ? "enyla" : etapa === "aprovada" ? "ninguem" : "cliente"
}

/** Quando o pedido entrou na etapa atual (ISO), ou null se não há data gravada. */
export function entrouNaEtapaEm(p: PedidoArte): string | null {
  switch (etapaArte(p)) {
    case "aprovada": return p.arteAprovadaEm ?? null
    case "prova_enviada": return p.arteEnviadaEm ?? null
    case "ajuste_pedido": return maior(p.ajustes?.at(-1)?.em) ?? null
    default: return p.sinalPagoEm ?? p.statusEm ?? null
  }
}

/** Horas entre o ajuste pedido e a prova devolvida (métrica das 24h); null enquanto a prova não voltou. */
export function horasAjusteAteProva(p: PedidoArte): number | null {
  const ini = p.ajusteEnviadoLeandroEm ?? p.ajustes?.at(-1)?.em
  const fim = p.provaDevolvidaEm
  if (!ini || !fim) return null
  const h = (Date.parse(fim) - Date.parse(ini)) / 3_600_000
  return isNaN(h) || h < 0 ? null : Math.round(h * 10) / 10
}
