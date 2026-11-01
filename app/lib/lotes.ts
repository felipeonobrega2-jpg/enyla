// Criação de lote (código do cliente + sequência), usada pela tela e pela recompra do cliente.
import { supabase } from "./supabase"

function baseCode(nome: string, len: number): string {
  return nome.replace(/\s+/g, "").slice(0, len).toUpperCase() || "GEN"
}

// Acha um código curto pro cliente que não colida com o de outro cliente já
// existente. Nomes parecidos (Marcelo/Marcos) geram o mesmo prefixo de 3
// letras — aqui a gente cresce o prefixo até divergir, e só recorre a um
// sufixo numérico se um nome for prefixo exato do outro (Marco/Marcos).
async function resolverCodigoCliente(nomeCliente: string): Promise<{ code: string; existing: { numero: string }[] }> {
  const nomeNormalizado = nomeCliente.trim().toLowerCase()
  const maxLen = Math.min(nomeCliente.replace(/\s+/g, "").length || 3, 8)

  for (let len = 3; len <= maxLen; len++) {
    const code = baseCode(nomeCliente, len)
    const { data: existing } = await supabase
      .from("Lote")
      .select("numero, nomeCliente")
      .like("numero", `${code}-%`)
    const rows = existing ?? []
    if (rows.length === 0 || rows.every(l => l.nomeCliente.trim().toLowerCase() === nomeNormalizado)) {
      return { code, existing: rows }
    }
  }

  const base = baseCode(nomeCliente, 3)
  for (let sufixo = 2; sufixo < 20; sufixo++) {
    const code = `${base}${sufixo}`
    const { data: existing } = await supabase
      .from("Lote")
      .select("numero, nomeCliente")
      .like("numero", `${code}-%`)
    const rows = existing ?? []
    if (rows.length === 0 || rows.every(l => l.nomeCliente.trim().toLowerCase() === nomeNormalizado)) {
      return { code, existing: rows }
    }
  }

  return { code: `${base}${Date.now().toString(36).toUpperCase().slice(-3)}`, existing: [] }
}

export async function criarLote(nomeCliente: string, descricao?: string | null) {
  const { code, existing } = await resolverCodigoCliente(nomeCliente ?? "")
  const nums = existing
    .map(l => parseInt(l.numero.split("-").pop() ?? "0"))
    .filter(n => !isNaN(n) && n > 0)
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1
  const lote = {
    id: crypto.randomUUID(),
    numero: `${code}-${String(next).padStart(3, "0")}`,
    nomeCliente,
    descricao: descricao ?? null,
    criadoEm: new Date().toLocaleString("pt-BR"),
  }
  await supabase.from("Lote").insert(lote)
  return lote
}
