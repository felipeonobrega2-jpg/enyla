// npm run telas — monta as telas principais com dados fictícios e tira screenshots em scripts/telas/saida.
// Usa o CSS do último `next build` (rode npm run build antes, se mudou classes).
import { build } from "esbuild"
import { chromium } from "playwright"
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "fs"
import path from "path"

const raiz = process.cwd(), dir = path.join(raiz, "scripts/telas"), saida = path.join(dir, "saida")
mkdirSync(saida, { recursive: true })
const css = []
const procurar = d => { for (const f of readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) procurar(p); else if (p.endsWith(".css")) css.push(readFileSync(p, "utf8")) } }
procurar(path.join(raiz, ".next/static"))
writeFileSync(path.join(saida, "app.css"), css.join("\n"))
await build({
  entryPoints: [path.join(dir, "app.tsx")], bundle: true, outfile: path.join(saida, "app.js"), jsx: "automatic", logLevel: "error",
  alias: { "@": raiz, "next/image": path.join(dir, "imagem.tsx") }, define: { "process.env.NODE_ENV": '"production"' },
})
writeFileSync(path.join(saida, "index.html"), '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="app.css"><body><div id="root"></div><script src="app.js"></script>')

const telas = [["caixa", 1440], ["config", 1440], ["calibragem", 1440], ["rotas", 1440], ["aprovar", 390], ["portal", 390], ["mobile", 390], ["relatorios", 1440], ["precofecha", 1100], ["lancamento", 900], ["metatoken", 1100], ["whats", 700], ["ideias", 1440], ["perfil", 1440], ["detalhe", 1440], ["detalhe-orcamento", 1440], ["financeiro-conciliacao", 1440], ["financeiro-dash", 1440], ["financeiro-receber", 1440], ["financeiro-lancamentos", 1440], ["financeiro-dre", 1440], ["financeiro-pix", 1440], ["financeiro-contas", 1440], ["financeiro-fixas", 1440], ["financeiro-fornecedores", 1440]]
const navegador = await chromium.launch()
let erros = 0
for (const [tela, largura] of telas) {
  const p = await navegador.newPage({ viewport: { width: largura, height: 900 }, deviceScaleFactor: largura < 500 ? 2 : 1 })
  const falhas = []
  p.on("pageerror", e => falhas.push(String(e)))
  await p.goto(`file://${saida}/index.html?tela=${tela}`)
  await p.waitForTimeout(1200)
  // Conciliação: importa o extrato de exemplo
  if (tela === "financeiro-conciliacao") { await p.setInputFiles("input[type=file]", path.join(dir, "extrato-exemplo.ofx")); await p.waitForTimeout(800) }
  await p.screenshot({ path: path.join(saida, `${tela}.png`), fullPage: true })
  console.log(`${falhas.length ? "ERRO" : "ok  "} ${tela}${falhas.length ? ": " + falhas.join(" | ") : ""}`)
  erros += falhas.length
  await p.close()
}
await navegador.close()
console.log(`\nScreenshots em ${path.relative(raiz, saida)}/`)
process.exit(erros ? 1 : 0)
