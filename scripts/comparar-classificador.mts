// Compara o classificador de leads (perguntarIA) no Opus × Sonnet × Haiku nas mesmas conversas reais. SÓ LEITURA:
// só SELECT, não grava no banco, não muda etiqueta, não envia mensagem. Não troca modelo nenhum em produção.
//
// Uso (da raiz do repositório, com SUPABASE_URL e SUPABASE_SERVICE_KEY no .env.local):
//   npx esbuild scripts/comparar-classificador.mts --bundle --platform=node --format=esm --packages=external --outfile=/tmp/comparar-classificador.mjs
//   node --env-file=.env.local /tmp/comparar-classificador.mjs              # --estimar (padrão): não chama a IA
//   node --env-file=.env.local /tmp/comparar-classificador.mjs --rodar      # chama a IA (gasta de verdade)
// Opções: --limite=200 (conversas)  --saida=relatorio.md (padrão: imprime na tela)
// As chamadas de IA usam a origem "teste-classificador" (não polui o medidor do classificador de produção).

import { writeFileSync } from "node:fs"
import { randomBytes } from "node:crypto"
import { supabase } from "../app/lib/supabase"
import { lerConfigLinha } from "../app/lib/configAtomica"
import { clienteClaude } from "../app/lib/claude"
import { filtroDoAgente } from "../app/lib/agenteLeads"
import { conhecimentoNoPrompt } from "../app/lib/agenteAprende"
import { conversaParaIA, temSinalDeVolume, mensagensParaIA, pedidoClassificador, type Classificacao } from "../app/lib/classificarLead"
import { DIAS_JANELA, NAO_MEXE, jaComprou, type Cfg, type Conv } from "../app/lib/classificarLeadServidor"
import {
  MODELOS_COMPARADOS, idAnonimo, resumirClassificacao, relatorioMarkdown, tabelaEstimativa, tokensAprox, somarUsoModelo,
  type Linha, type UsoModelo,
} from "../app/lib/compararClassificador"

const args = process.argv.slice(2)
const rodar = args.includes("--rodar")
const limite = Number(args.find(a => a.startsWith("--limite="))?.split("=")[1] ?? 200)
const saida = args.find(a => a.startsWith("--saida="))?.split("=")[1]

type Msg = { from_me: boolean; corpo: string | null; tipo: string; ts: string }
type Selecionada = { conv: Conv; ms: Msg[]; texto: string; doCliente: string[] }

async function selecionar(cfg: Cfg): Promise<Selecionada[]> {
  const desde = new Date(Date.now() - DIAS_JANELA * 86_400_000).toISOString()
  const { data } = await supabase.from("whatsapp_conversas").select("jid, nome, telefone, etiquetas, status_lead, ultima_at, ultima_classificacao_at")
    .gte("ultima_at", desde).not("jid", "like", "%@g.us").order("ultima_at", { ascending: false }).limit(2000)
  const cache: { cards?: { nomeCliente: string; coluna: number }[] } = {}
  const out: Selecionada[] = []
  for (const conv of (data ?? []) as Conv[]) {
    if (out.length >= limite) break
    if (NAO_MEXE.includes(conv.status_lead ?? "")) continue
    // Mesmo corte do classificarConversa: 300 últimas, 60 inteiras + volume antigo do cliente
    const { data: msgs } = await supabase.from("whatsapp_mensagens").select("from_me, corpo, tipo, ts").eq("jid", conv.jid).order("ts", { ascending: false }).limit(300)
    const ms = mensagensParaIA(((msgs ?? []) as Msg[]).reverse())
    const doCliente = ms.filter(m => !m.from_me).map(m => m.corpo ?? "")
    if (!doCliente.some(t => t.trim()) || !temSinalDeVolume(doCliente)) continue
    if ((await jaComprou(conv, cfg, cache)).comprou) continue
    out.push({ conv, ms, texto: conversaParaIA(ms), doCliente })
  }
  return out
}

function pedido(cfg: Cfg, s: Selecionada, modelo: string) {
  const ensinado = conhecimentoNoPrompt((cfg.conhecimentoAgente ?? []).filter(i => i.id.startsWith("felipe-")))
  return pedidoClassificador({ modelo, nome: s.conv.nome, texto: s.texto, filtro: filtroDoAgente(cfg), ensinado })
}

async function main() {
  const { data } = await lerConfigLinha()
  const cfg = (data?.data ?? {}) as Cfg
  const sel = await selecionar(cfg)

  if (!rodar) {
    // --estimar: nenhuma chamada de IA. Entrada = system + conversa do pedido real (modelo só entra no preço).
    const tokens = sel.map(s => { const p = pedido(cfg, s, MODELOS_COMPARADOS[0]); return tokensAprox(p.system + p.messages[0].content) })
    console.log(tabelaEstimativa(sel.length, tokens))
    console.log("\nNada foi enviado à IA. Para rodar de verdade: --rodar")
    return
  }

  if (!cfg.apiKey) throw new Error("Sem chave da API nas configurações")
  const cliente = clienteClaude(cfg.apiKey, "teste-classificador")
  const sal = randomBytes(8).toString("hex")
  const uso: Record<string, UsoModelo> = Object.fromEntries(MODELOS_COMPARADOS.map(m => [m, { chamadas: 0, entrada: 0, saida: 0, usd: 0 }]))
  const digital = cfg.agenteAuto?.pequenoParceiro === false
  const linhas: Linha[] = []
  for (const s of sel) {
    const por: Linha["por"] = {}
    await Promise.all(MODELOS_COMPARADOS.map(async modelo => {
      try {
        const r = await cliente.beta.messages.create(pedido(cfg, s, modelo))
        uso[modelo] = somarUsoModelo(uso[modelo], modelo, r.usage)
        const json = r.content.flatMap(b => b.type === "text" ? [b.text] : []).join("")
        const bruto = JSON.parse(json) as Classificacao
        por[modelo] = resumirClassificacao(bruto, s.doCliente, s.conv.etiquetas ?? [], s.conv.status_lead, digital)
      } catch { por[modelo] = null }
    }))
    linhas.push({ id: idAnonimo(s.conv.jid, sal), por })
  }
  const md = relatorioMarkdown({ linhas, uso, janelaDias: DIAS_JANELA, geradoEm: new Date().toISOString() })
  if (saida) { writeFileSync(saida, md); console.log(`Relatório gravado em ${saida}`) } else console.log(md)
}

main().catch(e => { console.error(String(e).slice(0, 300)); process.exit(1) })
