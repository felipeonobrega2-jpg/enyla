// Sobe o dossiê dos diretores na nuvem (arquivos .md de uma pasta) para a tabela dados_sistema, coleção dossieNuvem,
// uma linha por arquivo. Só cria/atualiza linhas dessa coleção. Uso:
//   node --env-file=.env.local scripts/subir-dossie.mjs <pasta>
import { createClient } from "@supabase/supabase-js"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

const pasta = process.argv[2]
if (!pasta) { console.error("Uso: subir-dossie.mjs <pasta>"); process.exit(1) }
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
const em = new Date().toISOString()
const SEGREDO = /sk-ant-[A-Za-z0-9_-]{10,}|AIza[0-9A-Za-z_-]{20,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|enyla2026|enyla_[a-z]{3}_[A-Za-z0-9_-]{20,}/
for (const nome of readdirSync(pasta).filter(n => n.endsWith(".md")).sort()) {
  const texto = readFileSync(join(pasta, nome), "utf8")
  if (SEGREDO.test(texto)) { console.error(`PAROU: ${nome} tem algo com cara de segredo`); process.exit(1) }
  const titulo = (texto.match(/^# (.+)$/m)?.[1] ?? nome).trim()
  const { error } = await s.from("dados_sistema").upsert({ colecao: "dossieNuvem", id: nome, dados: { nome, titulo, texto, em }, v: 1, atualizado_em: em }, { onConflict: "colecao,id" })
  console.log(error ? `ERRO ${nome}: ${error.message}` : `ok ${nome} (${texto.length} caracteres)`)
}
