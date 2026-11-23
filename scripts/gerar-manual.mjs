// Gera o manual do sistema (sistema.md) a partir do próprio código: o comentário do topo de cada tela, módulo, rota e
// tabela diz o que ela faz. Assim o manual nunca fica velho: rode de novo depois de mudanças e suba com subir-dossie.
// Uso: node scripts/gerar-manual.mjs <pasta_saida>
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync, statSync } from "node:fs"
import { join, relative, dirname } from "node:path"

const raiz = process.cwd()
const saida = process.argv[2]
if (!saida) { console.error("Uso: gerar-manual.mjs <pasta_saida>"); process.exit(1) }
const ler = f => readFileSync(join(raiz, f), "utf8")
const andar = d => readdirSync(join(raiz, d), { withFileTypes: true }).flatMap(e => e.isDirectory() ? andar(join(d, e.name)) : [join(d, e.name)])

// O primeiro bloco de comentário // do arquivo (antes ou logo depois dos imports)
function comentario(f) {
  const linhas = ler(f).split("\n").slice(0, 60)
  const out = []
  for (const l of linhas) {
    const t = l.trim()
    if (t.startsWith("//")) { out.push(t.replace(/^\/\/\s?/, "")); continue }
    if (out.length) break
    if (t === "" || t.startsWith("import") || t.startsWith('"use ') || t.startsWith("'use ") || t.startsWith("}") || t.startsWith("export const dynamic") || t.startsWith("export const maxDuration")) continue
    if (t.startsWith("--")) { out.push(t.replace(/^--\s?/, "")); continue }
    break
  }
  const t = out.join(" ").replace(/\s+/g, " ").trim()
  return /^[─━-]{2}/.test(t) || t.length < 25 ? "" : t
}
// SQL: comentários -- do topo
function comentarioSql(f) {
  const out = []
  for (const l of ler(f).split("\n").slice(0, 30)) { const t = l.trim(); if (t.startsWith("--")) out.push(t.replace(/^--\s?/, "")); else if (out.length && t) break }
  return out.join(" ").replace(/\s+/g, " ").trim()
}

// Telas do menu: descrição escrita à mão (o que o Felipe vê e usa), mais o comentário do arquivo quando ajuda
const MENU = [
  ["Painel", "Vendas", "A tela de abertura. Caixa de entrada única do Felipe (o que precisa dele agora, por prioridade: bons negócios esperando, propostas, promessas, cobranças; resolvido ou lembrar depois), o bloco Hoje (MQL esperando com botão Orçar já preenchido pela IA), números do período (vendido, recebido, orçamentos em aberto, produção agora, vendido por mês, melhores clientes) e a meta do mês."],
  ["Orçamentos", "Vendas", "Onde o Felipe orça. Motor de custo de chapa (papel, formato, quantas caixas cabem, impressão, verniz, corte e vinco, colagem, faca, margem) que explica a conta em linguagem de gráfica; importa o desenho DXF do Pacdora para tirar as medidas; gera o PDF da proposta para o cliente e o link de aprovação. Lista e visão geral: fechados, recusados (com motivo), sem resposta, para onde vão os orçamentos. Também o orçamento digital rápido (tabela da Villa)."],
  ["Pedidos", "Vendas", "Todos os pedidos (Offset, Digital e Cartuxo) em quadro, lista e visão geral. Etapas do quadro: Pedido realizado → Arte / Dieline → Arte para aprovação → Arte aprovada → Enviado à gráfica → Fila de impressão → Impressão → Verniz → Hot → Acabamento → Expedição → Entregue (com datas de início e fim de cada etapa). Cada pedido tem gaveta com dados, fotos da produção, arquivos, financeiro, OS e entrega."],
  ["Clientes", "Vendas", "Cadastro de clientes, quem mais compra, conversão dos orçamentos, curva A/B/C e ritmo de recompra (lembrete de reposição), página do cliente (link /c/...) com pedidos, linha do tempo e repetir pedido."],
  ["Fornecedores", "Produção", "Cadastro e preços de cada fornecedor por tipo de serviço (papel, impressão por chapa, acerto + milheiro, corte e vinco, colagem, laminação/verniz, hot stamping, ferramental, arte; por folha, m², unidade ou trabalho), parâmetros da máquina, desempenho (prazo, atraso), calibragem dos custos com o que foi pago de verdade, terceirizados e contas a pagar."],
  ["Entregas", "Produção", "Chamar a Lalamove de qualquer lugar para qualquer lugar (fornecedor → gráfica → cliente), com mapa, rota e o motorista ao vivo; custo do frete lançado sozinho no pedido."],
  ["Facas", "Produção", "Biblioteca de desenhos (DXF do Pacdora) e as facas físicas de cada um (quantas cavidades); todo DXF importado no orçamento entra aqui."],
  ["Financeiro", "Gestão", "Visão geral (resultado, caixa, linhas Offset e Digital separadas), lançamentos (receitas e despesas por categoria e forma de pagamento), a receber (por cliente, PDF), contas, gastos fixos, DRE, Pix (conciliação: casa o Pix recebido com o pedido por pagador, valor e data), Banco (extrato da Pluggy, sugestões da IA, regras aprendidas, aplicar/desfazer), fornecedores, impostos e calibragem."],
  ["IA e anúncios (Gastos)", "Gestão", "Quanto a operação gasta por dia com IA (por função, desde 23/11/2026) e com anúncios da Meta, quantos dias o saldo aguenta e quanto a margem do braço digital cobre. Aviso no WhatsApp quando o saldo vai acabar."],
  ["Relatórios", "Gestão", "Indicadores por mês, trimestre ou ano: vendido, recebido, pedidos fechados, ticket médio, preço médio por unidade, unidades vendidas, margem de contribuição, geração de caixa, conversão, clientes novos; de onde vêm os clientes, o que faz fechar, por que perdemos, materiais vendidos; relatório gerencial em PDF; ROI real das campanhas sobre a margem, previsão de 30 dias e simulador."],
  ["Dados", "Gestão", "Exatidão dos dados: o Auditor confere se pedidos, financeiro, banco, digital e WhatsApp batem entre si e mostra o que está errado (do mais grave) e onde acertar."],
  ["Parceiros", "Gestão", "O que a ENYLA ganha fora da caixa (frasco, essência, válvula, envase, produto pronto): ganho em cima (cliente paga a ENYLA, ela paga o parceiro) ou comissão (cliente paga o parceiro, que repassa). Cadastro público de parceiros em /parceiros."],
  ["Campanhas", "Ferramentas", "Anúncios da Meta: gasto, alcance, impressões, cliques, CTR, CPC, CPM, leads, custo por lead, conversões, CAC, LTV/CAC, faturamento por período; funil por campanha (lead → MQL → orçamento → pedido) e o relatório diário do agente de marketing com leitura da IA."],
  ["Escritório", "Ferramentas", "O prédio virtual da ENYLA em 3D: térreo = gráfica virtual (pedidos reais passando pelas etapas), 1º andar = sala dos agentes trabalhando (o que cada um faz agora, feed do dia, o que trava) e o RH (vagas e contratação), cobertura = diretoria (placar de cada diretor, reunião de diretoria com ata e Aprovo, conversa 1:1 por texto e reunião por voz estilo Google Meet). Aba Rotinas = o agendador único (cada rotina automática, quando rodou e o que aconteceu). Rua viva com o caminhão seguindo a expedição real."],
  ["WhatsApp", "Ferramentas", "O WhatsApp do Felipe dentro do sistema: conversas (com o cliente ligado ao cadastro e aos pedidos), funil de leads (etiquetas: ICP, médio, oportunidade, pequeno, MQL), fila de mensagens (follow-up, aviso de produção, cobrança), atendente que sugere a resposta no tom do Felipe e preenche o orçamento, mensagens rápidas, áudios transcritos."],
  ["Digital", "Ferramentas", "Painel do braço digital (lead pequeno, 100% IA): pedidos DIG-xxxx por etapa (sinal, arte com a designer, aprovação, produção na Villa, restante + frete, entregue), acerto semanal com o Leandro, contatos do digital."],
  ["Forma IA", "Ferramentas", "Assistente que lê uma conversa, foto ou PDF do cliente e monta o orçamento."],
  ["Ideias", "Ferramentas", "Banco de ideias do Felipe e do sistema: o que fazer depois, por lote, com o que já foi feito."],
  ["Configurações", "Ferramentas", "Abas Negócio (preço de venda, papel, metas e marcos, feriados, valores de reserva, clientes de relacionamento), Agentes (agente de leads: liga/desliga, horário, modo digital, filtro de leads, guia de atendimento, o que a IA aprendeu, teste A/B da abertura, mídia, reativação, contatos protegidos, mensagens rápidas) e Sistema (o que depende do Felipe, chaves da IA, transcrição, voz dos diretores, diretores na nuvem, backup, aparência)."],
  ["Cartuxo · Pedidos do site", "Cartuxo (e-commerce cartuxo.com.br)", "Pedidos pagos no site, briefing, artes por item (versões, ajustes, aprovação), envio com rastreio, recuperação de quem não pagou (3 toques)."],
  ["Cartuxo · Chapas", "Cartuxo (e-commerce cartuxo.com.br)", "Montagem das chapas compartilhadas (gang run): quais pedidos entram em qual chapa."],
  ["Cartuxo · Facas", "Cartuxo (e-commerce cartuxo.com.br)", "Facas e medidas que o site usa (o que está à venda)."],
  ["Cartuxo · Custos", "Cartuxo (e-commerce cartuxo.com.br)", "Custos reais da rodada que alimentam o preço do site."],
]

const partes = []
const p = s => partes.push(s)
p(`# Manual do sistema ENYLA — tudo o que existe e o que cada parte faz

Gerado automaticamente do código em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} (cada descrição é o comentário que o engenheiro deixou no topo de cada arquivo, em português). Endereço: https://app.enyla.com.br (login só do Felipe). Você, diretor, não entra nas telas: lê e age pela porta de acesso (api/externo). Este manual serve para você saber o que o sistema já faz, onde está cada coisa, o que roda sozinho e o que ainda não existe (antes de pedir uma ferramenta, confira aqui se ela já existe).

Como o sistema é montado: Next.js na Vercel + banco Supabase (Postgres). WhatsApp do Felipe pela Evolution numa VPS. IA: Claude (Anthropic) nos agentes, Groq para transcrever áudio, Gemini para a voz dos diretores. Anúncios pela API da Meta, extrato do banco pela Pluggy, frete pela Lalamove, pagamentos Pix (link próprio), Asaas e Mercado Pago (Cartuxo).

## 1. As telas (menu lateral, na ordem)
`)
let grupo = ""
for (const [nome, g, texto] of MENU) {
  if (g !== grupo) { p(`\n### ${g}\n`); grupo = g }
  p(`- **${nome}**: ${texto}`)
}

// Rotinas automáticas (lib/agendador.ts)
p(`\n## 2. O que roda sozinho (rotinas automáticas)\n`)
const ag = ler("app/lib/agendador.ts")
for (const m of ag.matchAll(/\{ id: "([^"]+)", nome: "([^"]+)", faz: "([^"]+)", onde: "([^"]+)", quando: "([^"]+)"/g))
  p(`- **${m[2]}** (${m[5]}): ${m[3]}.`)

// Páginas que o cliente e os parceiros abrem
p(`\n## 3. Páginas públicas (cliente, parceiros)\n`)
for (const d of ["app/c", "app/d", "app/aprovar", "app/pix", "app/track", "app/parceiros", "app/pedido", "app/mobile"].filter(existsSync)) {
  const pags = andar(d).filter(f => /page\.tsx$/.test(f))
  for (const f of pags) { const c = comentario(f); p(`- **/${relative("app", dirname(f)).replace(/\\/g, "/")}**${c ? `: ${c}` : ""}`) }
}

// Componentes que não são telas do menu (prédio 3D, cartões, gavetas)
p(`\n## 4. Peças das telas (cartões, gavetas, prédio 3D)\n`)
for (const f of [...andar("app/components"), ...(existsSync("app/cartuxo") ? andar("app/cartuxo") : [])].filter(f => f.endsWith(".tsx")).sort()) {
  const c = comentario(f); if (c) p(`- \`${f.replace(/^app\//, "")}\`: ${c}`)
}

// Módulos (o cérebro)
p(`\n## 5. Módulos (regras de negócio, agentes, cálculos)\n`)
for (const f of andar("app/lib").filter(f => f.endsWith(".ts")).sort()) {
  const c = comentario(f); p(`- \`${f.replace(/^app\//, "")}\`${c ? `: ${c}` : ""}`)
}
for (const f of ["app/calculos.ts", "app/dados.ts", "app/config.ts", "app/types.ts", "app/pdf.ts"].filter(existsSync)) {
  const c = comentario(f); if (c) p(`- \`${f.replace(/^app\//, "")}\`: ${c}`)
}

// Rotas da API (o que o sistema sabe fazer por dentro)
p(`\n## 6. Rotas internas (API)\n`)
for (const f of andar("app/api").filter(f => f.endsWith("route.ts")).sort()) {
  const t = ler(f)
  const metodos = ["GET", "POST", "PUT", "PATCH", "DELETE"].filter(m => new RegExp(`export (async )?function ${m}\\b|export const ${m}\\b`).test(t))
  const c = comentario(f)
  p(`- \`${metodos.join("/")} /${relative("app", dirname(f)).replace(/\\/g, "/")}\`${c ? `: ${c}` : ""}`)
}

// Banco: tabelas (migrações) e gavetas da tabela dados_sistema
p(`\n## 7. Banco de dados\n\nTabelas criadas pelas migrações (em ordem):`)
if (existsSync("supabase/migrations")) for (const f of readdirSync(join(raiz, "supabase/migrations")).filter(n => n.endsWith(".sql")).sort()) {
  const c = comentarioSql(join("supabase/migrations", f)); p(`- \`${f}\`${c ? `: ${c}` : ""}`)
}
const colecoes = new Set()
for (const f of andar("app").filter(f => /\.tsx?$/.test(f))) for (const m of ler(f).matchAll(/"colecao",\s*"([A-Za-z]+)"|colecao:\s*"([A-Za-z]+)"|(?:ler|gravar|listar|apagar)(?:<[^>]+>)?\("([a-z][A-Za-z]+)",/g)) colecoes.add(m[1] ?? m[2] ?? m[3])
p(`\nGavetas da tabela dados_sistema (uma linha por item, fora da configuração principal): ${[...colecoes].sort().join(", ")}.`)
p(`\nConfiguração principal: tabela AppConfig (um JSON grande; o que cresce foi migrado para dados_sistema). Conversas do WhatsApp: whatsapp_conversas e whatsapp_mensagens. Pedidos e orçamentos: KanbanCard. Financeiro: LancamentoFinanceiro e banco_transacoes.`)

mkdirSync(saida, { recursive: true })
const texto = partes.join("\n") + "\n"
writeFileSync(join(saida, "sistema.md"), texto)
console.log(`sistema.md: ${texto.length} caracteres, ${partes.length} linhas`)
