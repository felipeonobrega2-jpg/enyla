import { createClient, SupabaseClient } from "@supabase/supabase-js"

// Cliente criado no primeiro uso: o build (coleta de páginas) não precisa das variáveis de ambiente
let cliente: SupabaseClient | null = null

function obter(): SupabaseClient {
  if (!cliente) {
    const url = process.env.SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_KEY
    if (!url || !key) throw new Error("SUPABASE_URL e SUPABASE_SERVICE_KEY não configuradas neste ambiente")
    cliente = createClient(url, key, { auth: { persistSession: false } })
  }
  return cliente
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    const c = obter()
    const v = Reflect.get(c, prop, c)
    return typeof v === "function" ? v.bind(c) : v
  },
})
