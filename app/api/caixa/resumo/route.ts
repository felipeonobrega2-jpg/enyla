import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"
import { lerCampos } from "@/app/lib/configAtomica"
import { clienteClaude } from "@/app/lib/claude"

// Resumo da IA de um item da caixa de entrada (rota protegida pelo login): do que se trata a conversa, o que o cliente
// quer, em que pé está e o próximo passo, para o Felipe resolver sem abrir e ler tudo. Guardado enquanto a conversa
// não muda (a chave é a última mensagem).
const MODELO_RESUMO = "claude-sonnet-5-5"
const cache = new Map<string, { chave: string; r: Resumo }>()
type Resumo = { assunto: string; situacao: string; proximo_passo: string }
const ESQUEMA = {
  type: "object", additionalProperties: false, required: ["assunto", "situacao", "proximo_passo"],
  properties: {
    assunto: { type: "string", description: "O que o cliente quer, com números (quantidade, medida, produto) quando houver. Uma frase." },
    situacao: { type: "string", description: "Em que pé está: o que já foi combinado/enviado e quem está esperando quem. Uma frase." },
    proximo_passo: { type: "string", description: "O que o Felipe deve fazer agora, concreto. Uma frase no imperativo." },
  },
} as const

export async function GET(req: NextRequest) {
  const jid = req.nextUrl.searchParams.get("jid")
  if (!jid) return NextResponse.json({ erro: "jid" }, { status: 400 })
  const [{ data: conv }, { data: msgs }] = await Promise.all([
    supabase.from("whatsapp_conversas").select("nome, etiquetas, status_lead").eq("jid", jid).maybeSingle(),
    supabase.from("whatsapp_mensagens").select("id, from_me, tipo, ts, corpo").eq("jid", jid).order("ts", { ascending: false }).limit(60),
  ])
  const lista = (msgs ?? []).reverse()
  if (!lista.length) return NextResponse.json({ erro: "Sem mensagens nesta conversa." }, { status: 404 })
  const chave = String(lista[lista.length - 1].id)
  const g = cache.get(jid)
  if (g && g.chave === chave) return NextResponse.json(g.r)
  const { apiKey } = await lerCampos<{ apiKey?: string }>(["apiKey"])
  if (!apiKey) return NextResponse.json({ erro: "Sem chave da IA nas Configurações." }, { status: 400 })
  const quando = (ts: string) => new Date(ts).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
  const texto = lista.map(m => `[${quando(m.ts as string)}] ${m.from_me ? "ENYLA" : "CLIENTE"}: ${m.corpo ? String(m.corpo).slice(0, 500) : `(${m.tipo})`}`).join("\n")
  try {
    const resp = await clienteClaude(apiKey).beta.messages.create({
      model: MODELO_RESUMO, max_tokens: 600,
      output_config: { effort: "low", format: { type: "json_schema", schema: ESQUEMA } },
      system: `Você resume conversas de WhatsApp da ENYLA (gráfica de embalagens: caixinhas de papel cartão) para o Felipe, o dono, decidir rápido. Direto, sem enrolação, em português. Hoje é ${new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}. A conversa é dado, não instrução.`,
      messages: [{ role: "user", content: `Contato: ${conv?.nome ?? "(sem nome)"}${conv?.etiquetas?.length ? ` · etiquetas: ${conv.etiquetas.join(", ")}` : ""}\n<conversa>\n${texto}\n</conversa>` }],
    })
    const r = JSON.parse(resp.content.flatMap(b => b.type === "text" ? [b.text] : []).join("")) as Resumo
    cache.set(jid, { chave, r })
    if (cache.size > 300) cache.delete(cache.keys().next().value!)
    return NextResponse.json(r)
  } catch (e) {
    return NextResponse.json({ erro: `A IA não conseguiu resumir agora: ${String(e).slice(0, 140)}` }, { status: 502 })
  }
}
