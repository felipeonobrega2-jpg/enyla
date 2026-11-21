import { NextRequest, NextResponse } from "next/server"
import { lerConfig, mudarConfig } from "@/app/lib/configAtomica"
import { clienteClaude, MODELO } from "@/app/lib/claude"
import { ESQUEMA_APRENDIZ, TIPOS_CAIXA, type Ensinamento, type RegraCaixa, type RespostaAprendiz } from "@/app/lib/aprendiz"
import type { Conhecimento } from "@/app/lib/agenteLeads"
import { mudarLicoesIA } from "@/app/lib/licoesIAServidor"
import { adicionarLicao, tirarLicao } from "@/app/lib/licoesIA"

// Aprendiz do sistema (rota protegida pelo login).
// GET: o que você já ensinou e as regras da caixa. POST { texto, item }: a IA organiza e aplica. DELETE ?id: desfaz.
type Cfg = { apiKey?: string; ensinamentos?: Ensinamento[]; regrasCaixa?: RegraCaixa[]; conhecimentoAgente?: Conhecimento[]; ideias?: { id: string; texto: string; status: string; criadaEm: string }[] }
type ItemContexto = { tipo?: string; titulo?: string; sub?: string; grupo?: string; perfil?: string; jid?: string | null; numero?: string | null }
const MAX_ENSINAMENTOS = 300

export async function GET() {
  const cfg = await lerConfig<Cfg>()
  return NextResponse.json({ ensinamentos: (cfg.ensinamentos ?? []).slice(0, 50), regras: cfg.regrasCaixa ?? [] })
}

export async function POST(req: NextRequest) {
  const { texto, item } = await req.json().catch(() => ({})) as { texto?: string; item?: ItemContexto }
  const t = (texto ?? "").trim().slice(0, 2000)
  if (t.length < 3) return NextResponse.json({ erro: "Escreva o que o sistema deve aprender." }, { status: 400 })
  const cfg = await lerConfig<Cfg>()
  if (!cfg.apiKey) return NextResponse.json({ erro: "Sem chave da IA nas Configurações." }, { status: 400 })
  const contexto = item ? `Item da caixa de entrada em que ele clicou: tipo "${item.tipo ?? "?"}", grupo "${item.grupo ?? "?"}", perfil do lead "${item.perfil ?? "?"}"${item.jid ? ", é de uma conversa" : ""}${item.numero ? `, pedido/orçamento ${item.numero}` : ""}.\nTítulo: ${item.titulo ?? ""}\nTexto: ${item.sub ?? ""}` : "Sem item de contexto."

  let r: RespostaAprendiz
  try {
    const resp = await clienteClaude(cfg.apiKey).beta.messages.create({
      model: MODELO, max_tokens: 2000,
      output_config: { effort: "low", format: { type: "json_schema", schema: ESQUEMA_APRENDIZ } },
      system: `Você é o aprendiz do sistema da ENYLA (gráfica de embalagens: Offset com o Felipe; Digital, pedidos pequenos, 100% da IA). O Felipe ensina uma vez, em linguagem solta, e você organiza para o lugar certo. Pode ser mais de um destino.

Destinos:
- regra_caixa: muda o que aparece na caixa de entrada dele (esconder, baixar ou subir itens que batem). Use quando ele fala do que quer ou não quer ver/priorizar. Critérios (todos opcionais, combine o mínimo que acerta): tipo do item, grupo, perfil do lead, "contem" (palavra no título/texto), so_esta_pessoa (só esta conversa), dias (vale por N dias; null = sempre). Tipos de item: ${TIPOS_CAIXA}.
- agente: como o atendente do WhatsApp deve agir/falar/qualificar (preço, produto, prazo, processo, objeção...). Escreva a lição geral, em 3ª pessoa ("Quando o cliente..., responder..."), sem nome de cliente.
- assistente: o assistente do Felipe no WhatsApp dele (o que responder quando ele pergunta).
- mensagens: o jeito das mensagens que a IA sugere para ele mandar.
- marketing: leitura de anúncios e campanhas.
- ideia: mudança no sistema que só programando (tela nova, cálculo, integração). Descreva a ideia em uma frase.

Seja fiel ao que ele disse; não invente regra que ele não pediu. Se for sobre um cliente específico e não for regra da caixa, vá para agente só se valer como lição geral; senão use regra_caixa com so_esta_pessoa.
"texto" é o que fica guardado: claro, curto e geral. "entendi" é uma frase para ele conferir.`,
      messages: [{ role: "user", content: `${contexto}\n\nO que o Felipe ensinou:\n<ensino>\n${t}\n</ensino>` }],
    })
    r = JSON.parse(resp.content.flatMap(b => b.type === "text" ? [b.text] : []).join("")) as RespostaAprendiz
  } catch (e) {
    return NextResponse.json({ erro: `A IA não conseguiu organizar agora: ${String(e).slice(0, 160)}` }, { status: 502 })
  }

  const agora = new Date(), em = agora.toISOString(), base = agora.getTime().toString(36)
  const feitos: Ensinamento["feitos"] = []
  const regras: RegraCaixa[] = [], conhecimento: Conhecimento[] = [], ideias: NonNullable<Cfg["ideias"]> = []
  r.acoes.forEach((a, n) => {
    const id = `${base}-${n}`
    if (a.destino === "regra_caixa" && a.regra) {
      const g = a.regra
      regras.push({
        id: `rc-${id}`, descricao: a.texto, acao: g.acao, em, tipo: g.tipo || null, grupo: g.grupo || null, perfil: g.perfil || null,
        contem: g.contem || null, jid: g.so_esta_pessoa ? item?.jid ?? null : null,
        ate: g.dias ? new Date(agora.getTime() + g.dias * 86_400_000).toISOString() : null,
      })
      feitos.push({ destino: "regra_caixa", ref: `rc-${id}`, resumo: a.texto })
    } else if (a.destino === "agente") {
      conhecimento.push({ id: `felipe-${id}`, tema: a.tema || "outro", texto: a.texto, em })
      feitos.push({ destino: "agente", ref: `felipe-${id}`, resumo: a.texto })
    } else if (a.destino === "ideia") {
      ideias.push({ id: `ap-${id}`, texto: a.texto, status: "ideia", criadaEm: em })
      feitos.push({ destino: "ideia", ref: `ap-${id}`, resumo: a.texto })
    } else if (a.destino === "assistente" || a.destino === "mensagens" || a.destino === "marketing") {
      feitos.push({ destino: a.destino, ref: "", resumo: a.texto })
    }
  })
  // Lições das outras IAs: cada área tem a própria lista
  for (const f of feitos) {
    if (f.destino !== "assistente" && f.destino !== "mensagens" && f.destino !== "marketing") continue
    const lista = await mudarLicoesIA(f.destino, l => adicionarLicao(l, f.resumo, "voce"))
    f.ref = lista.find(l => l.texto === f.resumo)?.id ?? ""
  }
  const ensinamento: Ensinamento = { id: `en-${base}`, texto: t, em, entendi: r.entendi, contexto: item?.titulo, feitos }
  await mudarConfig((d: Cfg) => ({
    ensinamentos: [ensinamento, ...(d.ensinamentos ?? [])].slice(0, MAX_ENSINAMENTOS),
    ...(regras.length ? { regrasCaixa: [...(d.regrasCaixa ?? []), ...regras] } : {}),
    ...(conhecimento.length ? { conhecimentoAgente: [...(d.conhecimentoAgente ?? []), ...conhecimento] } : {}),
    ...(ideias.length ? { ideias: [...ideias, ...(d.ideias ?? [])] } : {}),
  }))
  return NextResponse.json({ ok: true, ensinamento })
}

// Desfaz um ensinamento inteiro (tudo o que ele criou)
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id")
  const cfg = await lerConfig<Cfg>()
  const e = (cfg.ensinamentos ?? []).find(x => x.id === id)
  if (!e) return NextResponse.json({ erro: "não achei" }, { status: 404 })
  const refs = new Set(e.feitos.map(f => f.ref))
  for (const f of e.feitos) if ((f.destino === "assistente" || f.destino === "mensagens" || f.destino === "marketing") && f.ref) await mudarLicoesIA(f.destino, l => tirarLicao(l, f.ref))
  await mudarConfig((d: Cfg) => ({
    ensinamentos: (d.ensinamentos ?? []).filter(x => x.id !== id),
    regrasCaixa: (d.regrasCaixa ?? []).filter(x => !refs.has(x.id)),
    conhecimentoAgente: (d.conhecimentoAgente ?? []).filter(x => !refs.has(x.id)),
    ideias: (d.ideias ?? []).filter(x => !refs.has(x.id)),
  }))
  return NextResponse.json({ ok: true })
}
