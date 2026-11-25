// Compara o follow-up do atendente (atender(jid, { automatico: true, followUp: nivel })) no Opus × Sonnet nas mesmas conversas
// reais. SÓ LEITURA: só SELECT (e download de mídia já guardada), não envia nada, não grava proxima_acao, não registra no
// agente_registro, não muda etiqueta. Não troca modelo nenhum em produção.
//
// Uso (da raiz do repositório, com SUPABASE_URL e SUPABASE_SERVICE_KEY no .env.local):
//   npx esbuild scripts/comparar-followup.mts --bundle --platform=node --format=esm --packages=external --outfile=/tmp/comparar-followup.mjs
//   node --env-file=.env.local /tmp/comparar-followup.mjs              # --estimar (padrão): não chama a IA
//   node --env-file=.env.local /tmp/comparar-followup.mjs --rodar      # chama a IA (gasta de verdade)
// Opções: --por-nivel=60 (casos por F1/F2/F3)  --saida=relatorio.md (padrão: imprime na tela)
// As chamadas de IA usam a origem "teste-followup" (não polui o medidor do follow-up de produção).
// Diferenças em relação ao momento real: pedidos/orçamentos (KanbanCard) e o guia/filtro/aprendido são os de hoje, e só
// vão anexos que já estão guardados no armazenamento (não baixa nada do Evolution, que gravaria).

import { writeFileSync } from "node:fs"
import { randomBytes } from "node:crypto"
import { supabase } from "../app/lib/supabase"
import { lerConfigLinha } from "../app/lib/configAtomica"
import { clienteClaude, FALLBACK } from "../app/lib/claude"
import { lerRegistros } from "../app/lib/registroAgente"
import { agoraParaIA } from "../app/lib/atendente"
import { resumoDoHistorico, type lerConfigAtendente } from "../app/lib/atendenteServidor"
import { arquivosDoCliente, contextoDaConversa, historicoDaConversa, pedidoAtendente, type Bloco, type CardLido } from "../app/lib/pedidoAtendente"
import {
  MODELOS_FOLLOWUP, NIVEIS, POR_NIVEL, JANELA_DIAS, idAnonimo, selecionarRegistros, mensagensAte, anonimizar, escolherAmostra,
  relatorioMarkdown, tabelaEstimativa, tokensAprox, somarUsoModelo, type Par, type Saida, type UsoModelo,
} from "../app/lib/compararFollowup"

type Cfg = Awaited<ReturnType<typeof lerConfigAtendente>>
type Msg = { id: string; from_me: boolean; corpo: string | null; tipo: string; ts: string }

const args = process.argv.slice(2)
const rodar = args.includes("--rodar")
const porNivel = Number(args.find(a => a.startsWith("--por-nivel="))?.split("=")[1] ?? POR_NIVEL)
const saida = args.find(a => a.startsWith("--saida="))?.split("=")[1]

// Só lê o que já está guardado (o obterMidia de produção baixaria do Evolution e gravaria no armazenamento)
async function midiaGuardada(id: string) {
  const r = await supabase.storage.from("whatsapp-midia").download(`midia/${id}`)
  return r.data ? { bytes: Buffer.from(await r.data.arrayBuffer()), tipo: r.data.type || "application/octet-stream" } : null
}

type Caso = { nivel: 1 | 2 | 3; jid: string; em: string; nomeConv: string | null; opcoes: { automatico: true; followUp: 1 | 2 | 3 }; mensagens: Msg[]; contexto: string; origem: string; historico: string; historicoAnterior: string; blocos: Bloco[] }

// Reconstrói o que atender() leria no momento do follow-up (mensagens até o horário do registro)
async function montarCaso(cfg: Cfg, cards: CardLido[], r: { jid: string; em: string; nivel: 1 | 2 | 3 }): Promise<Caso | null> {
  const [{ data: conv }, { data: msgs }, { data: primeira }] = await Promise.all([
    supabase.from("whatsapp_conversas").select("jid, nome, campanha").eq("jid", r.jid).maybeSingle(),
    supabase.from("whatsapp_mensagens").select("id, from_me, corpo, tipo, ts").eq("jid", r.jid).lte("ts", r.em).order("ts", { ascending: false }).limit(50),
    supabase.from("whatsapp_mensagens").select("ts").eq("jid", r.jid).order("ts", { ascending: true }).limit(1).maybeSingle(),
  ])
  const mensagens = mensagensAte(((msgs ?? []) as Msg[]).reverse(), r.em)
  if (!mensagens.length) return null
  const historicoAnterior = (msgs?.length ?? 0) >= 50 ? await (async () => {
    const { data: antigas } = await supabase.from("whatsapp_mensagens").select("from_me, corpo, ts").eq("jid", r.jid).lt("ts", mensagens[0].ts).order("ts", { ascending: false }).limit(400)
    return resumoDoHistorico((antigas ?? []).reverse() as { from_me: boolean; corpo: string | null; ts: string }[])
  })().catch(() => "") : ""
  const { contexto, origem } = contextoDaConversa({ conv, cards, vinculos: cfg.vinculosWhatsapp, mensagens, primeiraTs: primeira?.ts, agoraMs: new Date(r.em).getTime() })
  const anexos = await arquivosDoCliente(mensagens, midiaGuardada).catch(() => ({ blocos: [] as Bloco[], numero: new Map<string, number>() }))
  return { nivel: r.nivel, jid: r.jid, em: r.em, nomeConv: conv?.nome ?? null, opcoes: { automatico: true, followUp: r.nivel }, mensagens, contexto, origem, historicoAnterior, blocos: anexos.blocos, historico: historicoDaConversa(mensagens, anexos) }
}

const pedido = (cfg: Cfg, c: Caso, modelo: string) => pedidoAtendente({
  modelo, cfg, opts: c.opcoes, contexto: c.contexto, origem: c.origem, historico: c.historico, historicoAnterior: c.historicoAnterior,
  blocos: c.blocos, nomeConversa: c.nomeConv, agora: agoraParaIA(new Date(c.em)),
})
// Tudo o que a IA leu, em texto (para estimar tokens e para a checagem de erro factual)
const textoLido = (p: ReturnType<typeof pedido>) => p.system.map(s => s.text).join("\n") + "\n" + p.messages[0].content.flatMap(b => b.type === "text" ? [b.text] : []).join("\n")

async function main() {
  const { data } = await lerConfigLinha()
  const cfg = (data?.data ?? {}) as Cfg
  const desde = new Date(Date.now() - JANELA_DIAS * 86_400_000).toISOString()
  const registros = await lerRegistros(5000, { desde })
  if (!registros) throw new Error("Tabela agente_registro indisponível")
  const escolhidos = selecionarRegistros(registros, Date.now(), porNivel)
  const { data: cards } = await supabase.from("KanbanCard").select("numero, nomeCliente, coluna, preco, quantidade, dimensoes")
  const casos: Caso[] = []
  for (const r of escolhidos) { const c = await montarCaso(cfg, (cards ?? []) as CardLido[], r).catch(() => null); if (c) casos.push(c) }

  if (!rodar) {
    // --estimar: nenhuma chamada de IA. Entrada = system + mensagem do pedido real (modelo só entra no preço).
    const tokens = casos.map(c => tokensAprox(textoLido(pedido(cfg, c, MODELOS_FOLLOWUP[0]))))
    console.log(tabelaEstimativa(Object.fromEntries(NIVEIS.map(n => [n, casos.filter(c => c.nivel === n).length])), tokens))
    console.log("\nNada foi enviado à IA. Para rodar de verdade: --rodar")
    return
  }

  if (!cfg.apiKey) throw new Error("Sem chave da API nas configurações")
  const cliente = clienteClaude(cfg.apiKey, "teste-followup")
  const sal = randomBytes(8).toString("hex")
  const uso: Record<string, UsoModelo> = Object.fromEntries(MODELOS_FOLLOWUP.map(m => [m, { chamadas: 0, entrada: 0, saida: 0, usd: 0 }]))
  const pares: Par[] = []
  const textos: { id: string; nivel: number; nomes: (string | null)[]; por: Record<string, Saida | null> }[] = []
  for (const c of casos) {
    const por: Record<string, Saida | null> = {}
    let entrada = ""
    await Promise.all(MODELOS_FOLLOWUP.map(async modelo => {
      try {
        const p = pedido(cfg, c, modelo)
        if (!entrada) entrada = textoLido(p)
        const r = await cliente.beta.messages.create({ ...p, ...FALLBACK })
        uso[modelo] = somarUsoModelo(uso[modelo], modelo, r.usage)
        const j = JSON.parse(r.content.flatMap(b => b.type === "text" ? [b.text] : []).join("")) as { resposta: string; alerta: string; pode_enviar_sozinho: boolean; lead: { perfil: string } }
        por[modelo] = { resposta: j.resposta ?? "", alerta: j.alerta, pode_enviar_sozinho: j.pode_enviar_sozinho, perfil: j.lead?.perfil }
      } catch { por[modelo] = null }
    }))
    const id = idAnonimo(c.jid, sal)
    pares.push({ id, nivel: c.nivel, por, entrada })
    textos.push({ id, nivel: c.nivel, nomes: [c.nomeConv], por })
  }
  const amostra = escolherAmostra(textos).map(t => ({
    id: t.id, nivel: t.nivel,
    opus: anonimizar(t.por[MODELOS_FOLLOWUP[0]]!.resposta, t.nomes), sonnet: anonimizar(t.por[MODELOS_FOLLOWUP[1]]!.resposta, t.nomes),
  }))
  const md = relatorioMarkdown({ pares, amostra, uso, geradoEm: new Date().toISOString() })
  if (saida) { writeFileSync(saida, md); console.log(`Relatório gravado em ${saida}`) } else console.log(md)
}

main().catch(e => { console.error(String(e).slice(0, 300)); process.exit(1) })
