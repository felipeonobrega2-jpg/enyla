// npm run telas — monta as telas principais com dados fictícios e tira screenshots em scripts/telas/saida.
// Usa o CSS do último `next build` (rode npm run build antes, se mudou classes).
import { build } from "esbuild"
import { chromium } from "playwright"
import { readdirSync, readFileSync, writeFileSync, mkdirSync, cpSync } from "fs"
import path from "path"

const raiz = process.cwd(), dir = path.join(raiz, "scripts/telas"), saida = path.join(dir, "saida")
mkdirSync(saida, { recursive: true })
const css = []
const procurar = d => { for (const f of readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) procurar(p); else if (p.endsWith(".css")) css.push(readFileSync(p, "utf8")) } }
procurar(path.join(raiz, ".next/static"))
writeFileSync(path.join(saida, "next.css"), css.join("\n"))
// logos da marca ao lado das telas (o prédio 3D carrega brand/… pelo caminho relativo)
cpSync(path.join(raiz, "public/brand"), path.join(saida, "brand"), { recursive: true })
await build({
  entryPoints: [path.join(dir, "app.tsx")], bundle: true, outfile: path.join(saida, "app.js"), jsx: "automatic", logLevel: "error",
  alias: { "@": raiz, "next/image": path.join(dir, "imagem.tsx"), "next/dynamic": path.join(dir, "dinamico.tsx") }, define: { "process.env.NODE_ENV": '"production"', "process.env.NEXT_PUBLIC_CARTUXO_SITE_URL": "undefined" }, loader: { ".png": "dataurl" },
})
writeFileSync(path.join(saida, "index.html"), '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="next.css"><link rel="stylesheet" href="app.css"><body><div id="root"></div><script src="app.js"></script>')

const telas = [["margem", 900], ["pdffrete", 800], ["financeiro-banco-dup", 1440], ["lancamento-criar", 900], ["lancamento-sub", 900], ["financeiro-banco-lista", 1440], ["rotas-corrigir", 1440], ["calibragem-correcoes", 1440], ["chapa", 1000], ["chapa-medir", 1000], ["sugestaofaca", 600], ["sugestaofaca-nada", 600], ["qtdsugeridas", 600], ["lote", 700], ["lote-vazio", 700], ["pdflote", 800], ["biblioteca", 1440], ["biblioteca-nomear", 1440], ["buscafaca", 700], ["buscafaca-filtro", 700], ["biblioteca-faca", 1440], ["biblioteca-m", 390], ["pedidodigital-termos", 390], ["negociacao", 1440], ["negociacao-m", 390], ["tempofechar", 1440], ["tempofechar-m", 390], ["propostas", 1440], ["propostas-m", 390], ["caixa", 1440], ["config", 1440], ["config-agentes", 1440], ["config-sistema", 1440], ["calibragem", 1440], ["rotas", 1440], ["aprovar", 390], ["painel", 1440], ["painel-m", 390], ["painel-numeros", 1440], ["esqueleto", 390], ["fornecedores-receber", 1440], ["fornecedores-receber-m", 390], ["grandes", 1100], ["grandes-m", 390], ["grandes-editar", 390], ["aprovar-pagar", 390], ["aprovar-condicao", 390], ["condicao", 700], ["aprovar-termos", 390], ["portal", 390], ["mobile", 390], ["relatorios", 1440], ["relatorios-pdf", 390], ["precofecha", 1100], ["lancamento", 900], ["metatoken", 1100], ["whats", 700], ["compositor", 900], ["wacliente", 700], ["funil", 1600], ["funil-espiar", 1600], ["whatsview", 1440], ["whatsview-espiar", 1440], ["whatsview-busca", 1440], ["fila", 1440], ["fila-ensinar", 1440], ["marketing-ensinar", 1200], ["compositor-mic", 900], ["aviso", 1200], ["aviso-escuro", 1200], ["entregas", 1440], ["entregas-escuro", 1440], ["entregas-corrida", 1440], ["pedidos", 1440], ["pedidos-escuro", 1440], ["pedidos-aberto", 1440], ["pedidos-aberto-escuro", 1440], ["pedidos-quadro-escuro", 1440], ["pedidos-visao-escuro", 1440], ["fila-m", 390], ["enviar", 1100], ["ideias", 1440], ["predio", 1440], ["predio-m", 390], ["escritorio", 1440], ["escritorio-m", 390], ["escritorio-sel", 1440], ["escritorio-voz", 1440], ["reuniao", 1440], ["reuniao-falando", 1440], ["conversa-vivo", 1440], ["reuniao-m", 390], ["config-voz", 1440], ["config-nuvem", 1440], ["gv", 1280], ["gv-m", 390], ["gv-pre", 390], ["gv-entregue", 390], ["parceiro-form", 390], ["parceiro-form-d", 1280], ["parceiro-endereco", 390], ["parceiro-servicos", 390], ["parceiro-detalhes", 390], ["parceiro-final", 390], ["dados", 1440], ["dados-m", 390], ["dados-aberto", 1440], ["perfil", 1440], ["detalhe", 1440], ["detalhe-orcamento", 1440], ["financeiro-dash", 1440], ["financeiro-dash-m", 390], ["financeiro-dash-dig", 1440], ["financeiro-dash-dig-m", 390], ["financeiro-lancamentos-dig", 1440], ["financeiro-receber", 1440], ["financeiro-lancamentos", 1440], ["financeiro-lancamentos-conta", 1440], ["financeiro-dre", 1440], ["financeiro-pix", 1440], ["financeiro-contas", 1440], ["financeiro-fixas", 1440], ["financeiro-fornecedores", 1440], ["financeiro-banco", 1440], ["agente", 1100], ["parceiros", 1440], ["parceiros-modal", 1100], ["contatos", 1100], ["reativacao", 1100], ["marketing", 1200], ["marketing-m", 390], ["hoje", 1440], ["hoje-m", 390], ["hoje-passo", 1440], ["pdfcliente", 800], ["enviarproposta", 1100], ["enviarproposta-sem", 390], ["conversalateral", 1440], ["conversalateral-busca", 1440], ["conversalateral-m", 390], ["digital", 900], ["pedidodigital", 390], ["pedidodigital-pago", 390], ["pedidodigital-medidas", 390], ["gastos", 1440], ["gastos-m", 390], ["digitalpainel", 1440], ["digitalpainel-m", 390], ["digitalpainel-aberto", 1440], ["digitalpainel-medidas", 390], ["digitalpainel-qtd", 1440], ["digitalpainel-prod", 1440], ["digitalpainel-acerto", 1440], ["pedidodigital-arte", 390], ["pedidodigital-prod", 390], ["pedidodigital-designer", 390], ["pedidodigital-asaas", 390], ["hoje-conversa", 1440], ["hoje-conversa-m", 390], ["abertura", 1100], ["chapas", 1440], ["chapas-m", 390], ["chapas-aberta", 1440], ["cx-pedidos", 1440], ["cx-pedidos-aberto", 1440], ["cx-app", 1440], ["facas", 1440], ["facas-m", 390], ["facas-aberta", 1440], ["facas-nova", 1440], ["facas-lista", 1440], ["custos", 1440], ["custos-m", 390], ["custos-mudado", 1440], ["cx-parados", 1440], ["cx-parado-aberto", 1440], ["cx-parado-m", 390], ["cx-arte-aberto", 1440], ["cx-arte-m", 390]]
const navegador = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] })
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
  // WhatsApp: abre uma conversa e para o mouse em outra linha (espiada + ações)
  if (tela === "whatsview") { await p.click("[data-linha='2@lid']"); await p.waitForTimeout(1500) }
  if (tela === "whatsview-busca") { await p.waitForTimeout(800); await p.keyboard.press("/"); await p.keyboard.type("alisson"); await p.waitForTimeout(1200) }
  if (tela === "whatsview-espiar") { await p.click("[data-linha='3@lid']"); await p.hover("[data-linha='1@lid']"); await p.waitForTimeout(900) }
  if (tela === "relatorios-pdf") { await p.getByText("Relatório gerencial (PDF)").first().click(); await p.waitForTimeout(700) }
  if (tela === "dados-aberto") { await p.getByText("Pedido fechado sem receita lançada").click(); await p.getByText("Lançamento em dobro").click(); await p.waitForTimeout(600) }
  if (tela === "escritorio-voz") {
    await p.getByRole("button", { name: "2D", exact: true }).click(); await p.waitForTimeout(600)
    if (!await p.getByRole("button", { name: "Conversar" }).count()) { await p.getByText("Diretoria").first().click(); await p.waitForTimeout(700) }
    await p.getByRole("button", { name: "Conversar" }).first().click(); await p.waitForTimeout(900)
    await p.getByRole("button", { name: "Voz" }).click(); await p.waitForTimeout(200)
    await p.getByRole("button", { name: "Falar" }).click(); await p.waitForTimeout(900)
  }
  if (tela.startsWith("reuniao")) {
    if (await p.getByRole("button", { name: "2D", exact: true }).count()) { await p.getByRole("button", { name: "2D", exact: true }).click(); await p.waitForTimeout(600) }
    if (!await p.getByRole("button", { name: "Reunião", exact: true }).count()) { await p.getByText("Diretoria").first().click(); await p.waitForTimeout(700) }
    await p.getByRole("button", { name: "Reunião", exact: true }).first().click(); await p.waitForTimeout(1500)
    if (tela === "reuniao-falando") {
      await p.getByTitle("Chat da reunião").click(); await p.waitForTimeout(400)
      await p.getByRole("button", { name: "ouvir" }).first().click(); await p.waitForTimeout(1200)
    }
  }
  if (tela === "conversa-vivo") {
    await p.getByRole("button", { name: "2D", exact: true }).click(); await p.waitForTimeout(600)
    if (!await p.getByRole("button", { name: "Conversar" }).count()) { await p.getByText("Diretoria").first().click(); await p.waitForTimeout(700) }
    await p.getByRole("button", { name: "Conversar" }).first().click(); await p.waitForTimeout(900)
    await p.fill('textarea[placeholder^="Fale com"]', "Como está a operação?"); await p.keyboard.press("Enter")
    await p.waitForTimeout(1500)
  }
  if (tela === "config-nuvem") { await p.getByText("Diretores na nuvem").scrollIntoViewIfNeeded(); await p.getByRole("button", { name: "Gerar chave" }).first().click(); await p.waitForTimeout(500); await p.getByText("Diretores na nuvem").scrollIntoViewIfNeeded() }
  if (tela === "config-voz") { await p.getByText("Voz dos diretores").scrollIntoViewIfNeeded(); await p.waitForTimeout(300) }
  if (tela === "escritorio-sel") { await p.getByText("MQL", { exact: true }).last().click(); await p.waitForTimeout(700) }
  if (tela === "funil-espiar") { await p.hover("[data-linha='4@lid']"); await p.waitForTimeout(900) }
  if (tela.startsWith("pedidos-aberto")) { await p.getByText("Ana Cosméticos").first().click(); await p.waitForTimeout(600) }
  if (tela === "pedidos-quadro-escuro") { await p.getByText("Quadro", { exact: true }).click(); await p.waitForTimeout(600) }
  if (tela === "pedidos-visao-escuro") { await p.getByText("Visão geral", { exact: true }).click(); await p.waitForTimeout(600) }
  if (tela === "entregas-escuro") { await p.waitForTimeout(1800) }
  else if (tela.startsWith("entregas")) { await p.waitForTimeout(1500); await p.getByText("Utilitário (Fiorino)").first().click(); await p.getByText("Motorista ajuda na carga e descarga").click(); await p.getByText("Cotar", { exact: true }).click(); await p.waitForTimeout(1500) }
  if (tela === "entregas-corrida") { await p.getByText("Fornecedor Papel → Gráfica").first().click(); await p.waitForTimeout(2500) }
  if (tela.startsWith("aviso")) { await p.waitForTimeout(800); await p.getByText("para responder").click(); await p.waitForTimeout(600); await p.getByText("Camilo").first().click(); await p.waitForTimeout(1200) }
  if (tela.startsWith("marketing") || tela.startsWith("hoje")) await p.waitForTimeout(1200)
  if (tela === "aprovar-termos") { await p.waitForTimeout(800); await p.getByRole("button", { name: "termos do pedido" }).click(); await p.waitForTimeout(400) }
  if (tela.endsWith("-ensinar")) { await p.waitForTimeout(1400); await p.getByText("Ensinar a IA").first().click(); await p.waitForTimeout(500) }
  if (tela === "biblioteca-nomear") { await p.waitForTimeout(1200); await p.getByText("Nomear").nth(2).click(); await p.waitForTimeout(400) }
  if (tela.startsWith("buscafaca")) { await p.getByLabel("Buscar faca guardada").click(); await p.waitForTimeout(600); if (tela === "buscafaca-filtro") { await p.getByLabel("Buscar faca guardada").fill("perfume 20 ml"); await p.waitForTimeout(400) } }
  if (tela === "biblioteca-faca") { await p.waitForTimeout(1200); await p.getByText("Registrar faca deste desenho").first().click(); await p.waitForTimeout(400) }
  if (tela === "pedidodigital-termos") { await p.waitForTimeout(800); await p.getByRole("button", { name: "termos do pedido" }).click(); await p.waitForTimeout(400) }
  if (tela === "digitalpainel-prod") { await p.getByRole("button", { name: "Pagos", exact: true }).click(); await p.waitForTimeout(500); await p.getByText("Óleos Modelo").first().click(); await p.waitForTimeout(700) }
  if (tela === "cx-pedidos-aberto") { await p.getByText("Bella Pele").first().click(); await p.waitForTimeout(700) }
  if (tela === "cx-app") await p.waitForTimeout(2500)
  if (tela === "cx-arte-aberto" || tela === "cx-arte-m") { await p.getByText("Essências do Brás ·").first().click(); await p.waitForTimeout(700) }
  if (tela.startsWith("cx-parado")) { await p.getByText("Aguardando (").first().click(); await p.waitForTimeout(400) }
  if (tela === "cx-parado-aberto" || tela === "cx-parado-m") { await p.getByText("Aroma Nobre ·").first().click(); await p.waitForTimeout(700) }
  if (tela === "custos-mudado") { await p.getByText("Pago em 13 lotes").first().click(); await p.getByText("Pago em 16 lotes").first().click(); await p.getByText("Pago em 11 lotes").first().click(); await p.getByText("folhas a mais nos").first().click(); await p.getByText("imposto sobre o preço").first().click(); await p.waitForTimeout(400) }
  if (tela === "facas-aberta") { await p.getByText("Caixa para perfume 30 ml ·").first().click(); await p.waitForTimeout(700) }
  if (tela === "facas-nova") { await p.getByText("Caixa para perfume 100 ml ·").first().click(); await p.waitForTimeout(700) }
  if (tela === "facas-lista") { await p.getByText("Todas as facas").first().click(); await p.waitForTimeout(500) }
  if (tela === "chapas-aberta") { await p.getByText("Chapa 1 ·").first().click(); await p.waitForTimeout(700) }
  if (tela === "digitalpainel-acerto") { await p.getByRole("button", { name: /^Acerto/ }).click(); await p.waitForTimeout(500) }
  if (tela === "digitalpainel-qtd") { await p.getByText("Perfumaria Exemplo").first().click(); await p.waitForTimeout(700) }
  if (tela === "digitalpainel-medidas") { await p.getByRole("button", { name: "Pagos", exact: true }).click(); await p.waitForTimeout(500); await p.getByText("Body Splash Fictícia").first().click(); await p.waitForTimeout(700); await p.getByText("Mudar medidas").first().click(); await p.waitForTimeout(300); await p.getByLabel("Altura").fill("12"); await p.waitForTimeout(900) }
  if (tela === "pedidodigital-medidas") { await p.waitForTimeout(800); await p.getByText("Mudar a medida da caixa").first().click(); await p.waitForTimeout(300); await p.getByLabel("Altura").fill("12"); await p.waitForTimeout(1000) }
  if (tela === "digitalpainel-aberto") { await p.getByRole("button", { name: "Pagos", exact: true }).click(); await p.waitForTimeout(500); await p.getByText("Body Splash Fictícia").first().click(); await p.waitForTimeout(700) }
  if (tela === "digital") { await p.fill('input[placeholder^="Cole do WhatsApp"]', "10 x 5 x 5"); await p.waitForTimeout(400) }
  if (tela.startsWith("hoje-conversa")) await p.waitForTimeout(2500)
  if (tela === "abertura") { await p.waitForTimeout(1500); await p.locator("#teste-abertura").scrollIntoViewIfNeeded(); await p.waitForTimeout(400) }
  if (tela === "conversalateral-busca") { await p.waitForTimeout(800); await p.fill('input[placeholder^="Buscar na conversa"]', "100ml"); await p.waitForTimeout(400) }
  if (tela === "hoje-passo") { await p.locator('button[title^="Próximo passo"]').nth(1).click(); await p.waitForTimeout(600) }
  if (tela.startsWith("enviarproposta")) await p.waitForFunction(() => /KB|MB/.test(document.body.innerText), null, { timeout: 30000 }).then(() => p.waitForTimeout(300))
  if (tela === "financeiro-banco-lista") { await p.waitForTimeout(800); await p.evaluate(() => { for (const e of document.querySelectorAll("*")) { const st = getComputedStyle(e); if (e.scrollHeight > e.clientHeight + 50 && /auto|scroll/.test(st.overflowY)) e.scrollTop = 700 } }); await p.keyboard.press("ArrowDown"); await p.waitForTimeout(400) }
  if (tela === "grandes-editar") { await p.waitForTimeout(600); await p.getByText("Carlos Exemplo").first().click(); await p.waitForTimeout(500) }
  if (tela.startsWith("fornecedores-receber")) { await p.waitForTimeout(600); await p.getByText("Recebido hoje").first().click(); await p.waitForTimeout(300); await p.getByLabel("Mais um dia").click(); await p.waitForTimeout(300) }
  if (tela === "painel-numeros") { await p.waitForTimeout(800); await p.getByText("Números e acompanhamento").first().click(); await p.waitForTimeout(800) }
  if (tela === "financeiro-banco-dup") { await p.waitForTimeout(800); await p.getByText(/Lançar os 2 iguais/).first().click(); await p.waitForTimeout(500) }
  if (tela === "lancamento-criar") { await p.getByPlaceholder(/escolha ou crie uma categoria/).fill("Embal"); await p.waitForTimeout(300) }
  if (tela === "lancamento-sub") { await p.getByPlaceholder(/escolha ou crie uma subcategoria/).fill("Co"); await p.waitForTimeout(300) }
  if (tela === "rotas-corrigir") { await p.locator('button[title="Editar valor"]').nth(3).click(); await p.waitForTimeout(200); await p.getByText("Preço do fornecedor mudou").click(); await p.getByPlaceholder(/corte e vinco subiu/).fill("Fornecedor reajustou o milheiro em novembro"); await p.waitForTimeout(200) }
  if (tela === "chapa-medir") {
    await p.getByText("Medir peças").click(); await p.waitForTimeout(300)
    // puxa uma guia vertical extra da régua da esquerda até o meio da chapa
    const box = await p.locator("svg").filter({ has: p.locator("title", { hasText: "guia vertical" }) }).first().boundingBox()
    await p.mouse.move(box.x + 14, box.y + 200); await p.mouse.down(); await p.mouse.move(box.x + 300, box.y + 200, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(300)
  }
  if (tela === "pdfcliente" || tela === "pdflote" || tela === "pdffrete") {
    await p.waitForFunction(() => Number(document.getElementById("pronto")?.dataset.folhas) > 0 && window.__pdf, null, { timeout: 30000 }).then(() => p.waitForTimeout(500))
    writeFileSync(path.join(saida, `${tela}.pdf`), Buffer.from(await p.evaluate(() => window.__pdf), "base64"))
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
