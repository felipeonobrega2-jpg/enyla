// Tempo até fechar (time to conversion): do primeiro contato no WhatsApp até o primeiro pedido fechado do cliente
// (offset) ou até o sinal pago (digital). Um caso por cliente. Puro: o servidor junta os dados.
// Sem conversa ligada, ou com a primeira mensagem depois do fechamento (cliente de antes do histórico do WhatsApp no
// sistema), o caso fica "sem dado" e não entra na conta.

export type Caso = { cliente: string; tipo: "offset" | "digital"; fechou: string; valor: number; dias: number | null }
export type Estatistica = { n: number; mediana: number; media: number; p25: number; p75: number } | null
export type TempoAteFechar = {
  offset: Estatistica
  digital: Estatistica
  casos: Caso[]                 // mais recentes primeiro
  semDado: string[]             // clientes de offset sem conversa ligada (ou de antes do histórico)
}

export function estatistica(xs: number[]): Estatistica {
  const s = xs.filter(x => Number.isFinite(x) && x >= 0).sort((a, b) => a - b)
  if (!s.length) return null
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(s.length * p))]
  const mediana = s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2)
  return { n: s.length, mediana, media: Math.round(s.reduce((a, b) => a + b, 0) / s.length), p25: q(0.25), p75: q(0.75) }
}

// Dias inteiros entre o primeiro contato e o fechamento (null se não há contato, ou se ele veio depois)
export function diasEntre(primeiroContato: Date | null, fechamento: Date): number | null {
  if (!primeiroContato) return null
  const d = (fechamento.getTime() - primeiroContato.getTime()) / 86_400_000
  return d < -1 ? null : Math.max(0, Math.round(d))
}

export function montarTempo(casos: Caso[]): TempoAteFechar {
  const ord = [...casos].sort((a, b) => b.fechou.localeCompare(a.fechou))
  return {
    offset: estatistica(ord.filter(c => c.tipo === "offset" && c.dias != null).map(c => c.dias!)),
    digital: estatistica(ord.filter(c => c.tipo === "digital" && c.dias != null).map(c => c.dias!)),
    casos: ord,
    semDado: ord.filter(c => c.tipo === "offset" && c.dias == null).map(c => c.cliente),
  }
}

// Linha para a IA do relatório de marketing (não julgar campanha antes do ciclo)
export function textoParaIA(t: TempoAteFechar): string {
  const o = t.offset, d = t.digital
  if (!o && !d) return ""
  return [
    o ? `Ciclo de venda real (do primeiro contato ao primeiro pedido fechado), offset: mediana ${o.mediana} dias, metade dos casos entre ${o.p25} e ${o.p75} dias (${o.n} clientes); pedidos maiores costumam demorar mais.` : "",
    d ? `Digital (pedidos pequenos): mediana ${d.mediana} dias do primeiro contato ao sinal pago (${d.n} ${d.n === 1 ? "venda" : "vendas"}).` : "",
    o ? `Por isso: campanha com menos de ${o.mediana} dias ainda não teve tempo de mostrar a maior parte dos fechamentos de offset; julgue pelo custo por MQL e pelos orçamentos, não pelos pedidos.` : "",
  ].filter(Boolean).join(" ")
}
