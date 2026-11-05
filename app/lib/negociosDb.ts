// Colunas novas (migração 20261105): se ainda não existem no banco, grava sem elas em vez de perder o registro
const NOVAS = ["nomeCliente", "produto", "quantidade"] as const
export const semColunasNovas = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([k]) => !(NOVAS as readonly string[]).includes(k)))
export const faltaColuna = (e: { code?: string; message?: string } | null) => !!e && (e.code === "42703" || e.code === "PGRST204" || /column/i.test(e.message ?? ""))
