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
writeFileSync(path.join(saida, "next.css"), css.join("\n"))
await build({
  entryPoints: [path.join(dir, "app.tsx")], bundle: true, outfile: path.join(saida, "app.js"), jsx: "automatic", logLevel: "error",
  alias: { "@": raiz, "next/image": path.join(dir, "imagem.tsx"), "next/dynamic": path.join(dir, "dinamico.tsx") }, define: { "process.env.NODE_ENV": '"production"' }, loader: { ".png": "dataurl" },
})
writeFileSync(path.join(saida, "index.html"), '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="next.css"><link rel="stylesheet" href="app.css"><body><div id="root"></div><script src="app.js"></script>')

const telas = [["caixa", 1440], ["config", 1440], ["config-agentes", 1440], ["config-sistema", 1440], ["calibragem", 1440], ["rotas", 1440], ["aprovar", 390], ["portal", 390], ["mobile", 390], ["relatorios", 1440], ["precofecha", 1100], ["lancamento", 900], ["metatoken", 1100], ["whats", 700], ["compositor", 900], ["wacliente", 700], ["funil", 1600], ["funil-espiar", 1600], ["whatsview", 1440], ["whatsview-espiar", 1440], ["fila", 1440], ["compositor-mic", 900], ["aviso", 1200], ["aviso-escuro", 1200], ["entregas", 1440], ["entregas-escuro", 1440], ["entregas-corrida", 1440], ["pedidos", 1440], ["pedidos-escuro", 1440], ["pedidos-aberto", 1440], ["pedidos-aberto-escuro", 1440], ["pedidos-quadro-escuro", 1440], ["pedidos-visao-escuro", 1440], ["fila-m", 390], ["enviar", 1100], ["ideias", 1440], ["perfil", 1440], ["detalhe", 1440], ["detalhe-orcamento", 1440], ["financeiro-conciliacao", 1440], ["financeiro-dash", 1440], ["financeiro-receber", 1440], ["financeiro-lancamentos", 1440], ["financeiro-lancamentos-conta", 1440], ["financeiro-dre", 1440], ["financeiro-pix", 1440], ["financeiro-contas", 1440], ["financeiro-fixas", 1440], ["financeiro-fornecedores", 1440], ["financeiro-banco", 1440], ["agente", 1100], ["parceiros", 1440], ["parceiros-modal", 1100], ["contatos", 1100], ["reativacao", 1100], ["marketing", 1200], ["marketing-m", 390], ["hoje", 1440], ["hoje-m", 390], ["hoje-passo", 1440], ["pdfcliente", 800], ["enviarproposta", 1100], ["enviarproposta-sem", 390], ["conversalateral", 1440], ["conversalateral-busca", 1440], ["conversalateral-m", 390], ["digital", 900], ["pedidodigital", 390], ["pedidodigital-pago", 390], ["gastos", 1440], ["gastos-m", 390], ["digitalpainel", 1440], ["digitalpainel-m", 390], ["digitalpainel-aberto", 1440], ["digitalpainel-prod", 1440], ["digitalpainel-acerto", 1440], ["pedidodigital-arte", 390], ["pedidodigital-prod", 390], ["pedidodigital-designer", 390]]
const navegador = await chromium.launch()
let erros = 0
// TELAS=a,b roda só essas
const so = process.env.TELAS?.split(",")
for (const [tela, largura] of telas.filter(([t]) => !so || so.includes(t))) {
  const p = await navegador.newPage({ viewport: { width: largura, height: 900 }, deviceScaleFactor: largura < 500 ? 2 : 1 })
  const falhas = []
  p.on("pageerror", e => falhas.push(String(e)))
  await p.goto(`file://${saida}/index.html?tela=${tela}`)
  await p.waitForTimeout(1200)
  // Conciliação: importa o extrato de exemplo
  if (tela === "financeiro-conciliacao") { await p.setInputFiles("input[type=file]", path.join(dir, "extrato-exemplo.ofx")); await p.waitForTimeout(800) }
  // WhatsApp: abre uma conversa e para o mouse em outra linha (espiada + ações)
  if (tela === "whatsview") { await p.click("[data-linha='2@lid']"); await p.waitForTimeout(1500) }
  if (tela === "whatsview-espiar") { await p.click("[data-linha='3@lid']"); await p.hover("[data-linha='1@lid']"); await p.waitForTimeout(900) }
  if (tela === "funil-espiar") { await p.hover("[data-linha='4@lid']"); await p.waitForTimeout(900) }
  if (tela.startsWith("pedidos-aberto")) { await p.getByText("Ana Cosméticos").first().click(); await p.waitForTimeout(600) }
  if (tela === "pedidos-quadro-escuro") { await p.getByText("Quadro", { exact: true }).click(); await p.waitForTimeout(600) }
  if (tela === "pedidos-visao-escuro") { await p.getByText("Visão geral", { exact: true }).click(); await p.waitForTimeout(600) }
  if (tela === "entregas-escuro") { await p.waitForTimeout(1800) }
  else if (tela.startsWith("entregas")) { await p.waitForTimeout(1500); await p.getByText("Utilitário (Fiorino)").first().click(); await p.getByText("Motorista ajuda na carga e descarga").click(); await p.getByText("Cotar", { exact: true }).click(); await p.waitForTimeout(1500) }
  if (tela === "entregas-corrida") { await p.getByText("Fornecedor Papel → Gráfica").first().click(); await p.waitForTimeout(2500) }
  if (tela.startsWith("aviso")) { await p.waitForTimeout(800); await p.getByText("para responder").click(); await p.waitForTimeout(600); await p.getByText("Camilo").first().click(); await p.waitForTimeout(1200) }
  if (tela.startsWith("marketing") || tela.startsWith("hoje")) await p.waitForTimeout(1200)
  if (tela === "digitalpainel-prod") { await p.getByRole("button", { name: "Pagos", exact: true }).click(); await p.waitForTimeout(500); await p.getByText("Óleos Modelo").first().click(); await p.waitForTimeout(700) }
  if (tela === "digitalpainel-acerto") { await p.getByRole("button", { name: /^Acerto/ }).click(); await p.waitForTimeout(500) }
  if (tela === "digitalpainel-aberto") { await p.getByRole("button", { name: "Pagos", exact: true }).click(); await p.waitForTimeout(500); await p.getByText("Body Splash Fictícia").first().click(); await p.waitForTimeout(700) }
  if (tela === "digital") { await p.fill('input[placeholder^="Cole do WhatsApp"]', "10 x 5 x 5"); await p.waitForTimeout(400) }
  if (tela === "conversalateral-busca") { await p.waitForTimeout(800); await p.fill('input[placeholder^="Buscar na conversa"]', "100ml"); await p.waitForTimeout(400) }
  if (tela === "hoje-passo") { await p.locator('button[title^="Próximo passo"]').nth(1).click(); await p.waitForTimeout(600) }
  if (tela.startsWith("enviarproposta")) await p.waitForFunction(() => /KB|MB/.test(document.body.innerText), null, { timeout: 30000 }).then(() => p.waitForTimeout(300))
  if (tela === "pdfcliente") {
    await p.waitForFunction(() => Number(document.getElementById("pronto")?.dataset.folhas) > 0 && window.__pdf, null, { timeout: 30000 }).then(() => p.waitForTimeout(500))
    writeFileSync(path.join(saida, "pdfcliente.pdf"), Buffer.from(await p.evaluate(() => window.__pdf), "base64"))
  }
  if (tela === "reativacao") { await p.waitForTimeout(800); await p.getByText("Preparar mensagem").first().click(); await p.waitForTimeout(800) }
  if (tela.startsWith("compositor-")) { await p.getByLabel("Gravar áudio").click(); await p.waitForTimeout(400) }
  if (tela === "financeiro-lancamentos-conta") { await p.locator("select").filter({ hasText: "Fluxo de caixa" }).selectOption("tudo"); await p.waitForTimeout(500) }
  await p.screenshot({ path: path.join(saida, `${tela}.png`), fullPage: true })
  console.log(`${falhas.length ? "ERRO" : "ok  "} ${tela}${falhas.length ? ": " + falhas.join(" | ") : ""}`)
  erros += falhas.length
  await p.close()
}
await navegador.close()
console.log(`\nScreenshots em ${path.relative(raiz, saida)}/`)
process.exit(erros ? 1 : 0)
