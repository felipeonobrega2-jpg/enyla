// Banco falso das tabelas de reserva do Prospector, com a unique (prospecto_id, canal, campanha) do banco de verdade.
export const reservasFalsas = {
  reservas: [] as Record<string, unknown>[],
  barrados: [] as Record<string, unknown>[],
  falhar: false,   // simula banco fora do ar
  limpar() { this.reservas = []; this.barrados = []; this.falhar = false },
}

export function tabelaDeReservas(tabela: string): Record<string, unknown> | null {
  if (tabela !== "prospector_reservas_envio" && tabela !== "prospector_envios_barrados") return null
  const ehReserva = tabela === "prospector_reservas_envio"
  const filtros: [string, unknown][] = []
  let apagar = false
  const q: Record<string, unknown> = {}
  q.insert = async (r: Record<string, unknown>) => {
    if (reservasFalsas.falhar) return { error: { message: "banco fora do ar", code: "08006" } }
    if (!ehReserva) { reservasFalsas.barrados.push(structuredClone(r)); return { error: null } }
    // atômico: checa e grava no mesmo passo síncrono, como a constraint do Postgres
    if (reservasFalsas.reservas.some(x => x.prospecto_id === r.prospecto_id && x.canal === r.canal && x.campanha === r.campanha)) {
      return { error: { message: "duplicate key value violates unique constraint", code: "23505" } }
    }
    reservasFalsas.reservas.push(structuredClone(r)); return { error: null }
  }
  q.delete = () => { apagar = true; return q }
  q.eq = (c: string, v: unknown) => { filtros.push([c, v]); return q }
  q.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => {
    if (apagar) reservasFalsas.reservas = reservasFalsas.reservas.filter(r => !filtros.every(([c, v]) => r[c] === v))
    return Promise.resolve({ error: null }).then(ok, ko)
  }
  return q
}
