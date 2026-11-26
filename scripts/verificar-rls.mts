// Verifica que a chave anon não lê nenhuma tabela do public. Só lê; não escreve nada.
// Uso (da raiz do repositório):
//   SUPABASE_URL=https://<projeto>.supabase.co SUPABASE_ANON_KEY=<chave anon> node scripts/verificar-rls.mts
// Falha (código 1) se alguma tabela devolver linha. A chave nunca é impressa.

const url = (process.env.SUPABASE_URL || "").replace(/\/+$/, "")
const anon = process.env.SUPABASE_ANON_KEY || ""
if (!url || !anon) {
  console.error("Defina SUPABASE_URL e SUPABASE_ANON_KEY no ambiente.")
  process.exit(2)
}

// Tabelas do public conhecidas (as que o app usa). Se o OpenAPI do PostgREST listar outras, entram também.
const TABELAS = new Set([
  "HistoricoItem", "Cliente", "KanbanCard", "PropostaCustom", "Tracking", "AppConfig", "Contador",
  "LancamentoFinanceiro", "Lote", "NegocioParceiro", "Parceiro",
  "agente_mensagens", "agente_registro", "agente_tratadas", "banco_transacoes",
  "cartuxo_chapa_lugares", "cartuxo_chapas", "cartuxo_config", "cartuxo_facas", "cartuxo_pedidos",
  "dados_sistema", "fretes", "pedido_arquivos", "prospectos_parceiros", "termos_parceria", "quick_replies",
  "whatsapp_conversas", "whatsapp_mensagens",
])

const headers = { apikey: anon, Authorization: `Bearer ${anon}` }

try {
  const r = await fetch(`${url}/rest/v1/`, { headers })
  if (r.ok) {
    const j: any = await r.json()
    for (const p of Object.keys(j?.paths ?? {})) {
      const nome = p.replace(/^\//, "")
      if (nome && !nome.startsWith("rpc/")) TABELAS.add(nome)
    }
  }
} catch { /* sem OpenAPI: segue com a lista fixa */ }

let falhas = 0
for (const t of [...TABELAS].sort()) {
  const r = await fetch(`${url}/rest/v1/${encodeURIComponent(t)}?select=*&limit=1`, { headers })
  if (r.status === 404) { console.log(`?    ${t} (não existe ou não exposta)`); continue }
  let linhas: unknown = null
  try { linhas = await r.json() } catch {}
  if (r.ok && Array.isArray(linhas) && linhas.length > 0) {
    falhas++
    console.log(`FALHA ${t}: devolveu linha para a anon`)
  } else {
    console.log(`ok   ${t} (HTTP ${r.status}, vazio)`)
  }
}
console.log(`\n${TABELAS.size} tabelas verificadas, ${falhas} com vazamento.`)
process.exit(falhas ? 1 : 0)
