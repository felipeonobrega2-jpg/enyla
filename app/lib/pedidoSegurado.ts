// Pedido segurado por falta de pagamento do cliente ("aguardando pagamento"). Regra do Felipe: é atraso do cliente,
// não nosso: não entra em "entregas atrasadas" e ninguém avisa nem pede desculpas. A marca mora em dados_sistema
// (coleção pedidoSegurado, uma linha por número do pedido); aqui só a parte pura, que a tela e o servidor usam.
// Não cobra, não lança, não mexe em a receber e não manda mensagem.

export const MOTIVO_PADRAO = "saldo do cliente não pago"

export type Segurado = { desde: string; motivo: string; por: string }
/** Marcas ativas, por número do pedido. */
export type MapaSegurados = Record<string, Segurado>

export const estaSegurado = (mapa: MapaSegurados | undefined, numero?: string) => !!numero && !!mapa?.[numero]

/** "Segurado: aguardando pagamento do cliente desde dd/mm". */
export function textoSegurado(s: Segurado) {
  const d = /^(\d{4})-(\d{2})-(\d{2})/.exec(s.desde)
  return `Segurado: aguardando pagamento do cliente${d ? ` desde ${d[3]}/${d[2]}` : ""}`
}

/** Linha gravada: liberadoEm preenchido = marca desfeita (a linha fica, para o histórico). */
export type LinhaSegurado = Segurado & { liberadoEm?: string; liberadoPor?: string }
export const marcaAtiva = (l: LinhaSegurado | null | undefined): l is LinhaSegurado => !!l && !l.liberadoEm
