// Reunião de diretoria: cada diretor (COO, CCO, CMO, CFO, CTO) vira um agente que lê os números reais da área e o
// que o Felipe ensinou a ele (conhecimentoDiretoria), e fala na mesa: o que viu, o que preocupa, o que recomenda.
// Nesta etapa eles só falam e recomendam: não executam nada nem mandam mensagem a cliente. O Felipe responde
// "aprovo" ou "depois" em cada recomendação (fica registrado). Só roda no servidor.
import { lerCampos, mudarConfig } from "./configAtomica"
import { clienteClaude, MODELO } from "./claude"
import { montarDiretoria, DIRETORES, type IdDiretor, type LicaoDiretor, type Diretor } from "./diretoria"

export type Recomendacao = { id: string; texto: string; urgencia: "hoje" | "semana"; resposta?: "aprovo" | "depois" | null }
export type Fala = { diretor: IdDiretor; cargo: string; fala: string; recomendacoes: Recomendacao[]; tom: Diretor["tom"] }
export type Reuniao = { id: string; em: string; abertura: string; falas: Fala[]; fechamento: string }

const ESQUEMA = {
  type: "object", additionalProperties: false, required: ["abertura", "falas", "fechamento"],
  properties: {
    abertura: { type: "string", description: "Uma frase do CCO abrindo a reunião para o Felipe: o quadro geral de hoje." },
    falas: { type: "array", items: { type: "object", additionalProperties: false, required: ["diretor", "fala", "recomendacoes"], properties: {
      diretor: { type: "string", enum: ["coo", "cco", "cmo", "cfo", "cto"] },
      fala: { type: "string", description: "2 a 3 frases, primeira pessoa, direto ao ponto, com números." },
      recomendacoes: { type: "array", items: { type: "object", additionalProperties: false, required: ["texto", "urgencia"], properties: {
        texto: { type: "string", description: "Uma ação concreta que o Felipe aprova ou não. Imperativo, curta." },
        urgencia: { type: "string", enum: ["hoje", "semana"] },
      } } },
    } } },
    fechamento: { type: "string", description: "Uma frase fechando: a prioridade número 1 do dia." },
  },
} as const

async function todas<T>(tabela: string, sel = "*"): Promise<T[]> {
  const { supabase } = await import("./supabase")
  const out: T[] = []
  for (let i = 0; ; i += 1000) { const { data } = await supabase.from(tabela).select(sel).range(i, i + 999); out.push(...((data ?? []) as T[])); if (!data || data.length < 1000) break }
  return out
}

export async function convocarReuniao(): Promise<Reuniao> {
  const [{ montarHoje }, { financeiroDoAndar }, { unpackTerceirizado }, agendador, escritorio] = await Promise.all([
    import("./hojeServidor"), import("./financeiroAndar"), import("./kanbanUnpack"),
    import("../api/agendador/route"), import("../api/escritorio/route"),
  ])
  const [hoje, kanbanBruto, lancamentos, cfg, rot, esc] = await Promise.all([
    montarHoje().catch(() => null), todas<import("../types").KanbanCard>("KanbanCard"), todas<import("../types").LancamentoFinanceiro>("LancamentoFinanceiro"),
    lerCampos<{ apiKey?: string; conhecimentoDiretoria?: Partial<Record<IdDiretor, LicaoDiretor[]>>; contas?: { ativa?: boolean; tipo?: string; saldo?: number | null }[] }>(["apiKey", "conhecimentoDiretoria", "contas"]),
    agendador.GET().then(r => r.json()).catch(() => null), escritorio.GET().then(r => r.json()).catch(() => null),
  ])
  if (!cfg.apiKey) throw new Error("Sem chave da IA nas Configurações.")
  const kanban = kanbanBruto.map(unpackTerceirizado)
  const contas = (cfg.contas ?? []).filter(c => c.ativa && c.tipo !== "credito" && c.saldo != null)
  const fin = financeiroDoAndar(kanban, lancamentos, contas.length ? contas.reduce((t, c) => t + (c.saldo ?? 0), 0) : null)
  const base = cfg.conhecimentoDiretoria ?? {}
  const diretores = montarDiretoria({
    hoje: hoje as never, fin, kanban, agentesTravados: (esc?.mesas ?? []).filter((m: { estado: string }) => m.estado === "travado").map((m: { nome: string }) => m.nome),
    rotinas: rot?.rotinas ?? null, whatsapp: esc?.whatsapp ?? null, semCredito: !!esc?.semCredito, cota: esc?.cota,
    conhecimento: Object.fromEntries(Object.entries(base).map(([k, v]) => [k, v?.length ?? 0])),
  })
  const bloco = diretores.map(d => {
    const info = DIRETORES.find(x => x.id === d.id)!
    const licoes = (base[d.id] ?? []).slice(0, 40).map(l => `- ${l.texto}`).join("\n")
    return `## ${d.cargo} (${info.area}): ${info.faz}
Placar: ${d.placar.map(p => `${p.rotulo}: ${p.valor}${p.tom !== "ok" ? ` [${p.tom}]` : ""}`).join("; ")}
Pendências que o sistema já viu: ${d.decisoes.length ? d.decisoes.join(" | ") : "nenhuma"}
O que o Felipe ensinou a este diretor:
${licoes || "- (ainda nada)"}`
  }).join("\n\n")

  const resp = await clienteClaude(cfg.apiKey).beta.messages.create({
    model: MODELO, max_tokens: 4000,
    output_config: { effort: "low", format: { type: "json_schema", schema: ESQUEMA } },
    system: `Você conduz a reunião de diretoria da ENYLA (gráfica de embalagens; Offset com o Felipe, Digital 100% IA). O Felipe é o CEO. Cada diretor é um agente: fala em primeira pessoa, direto, com números do placar dele, e recomenda ações concretas que o Felipe aprova ou não.
Regras: cada diretor só fala da área dele e segue o que o Felipe ensinou a ele (isso vale mais que qualquer outra coisa). Sem enrolação, sem elogio, sem inventar número que não está no placar. Se está tudo em ordem, diga isso em uma frase e não invente recomendação. No máximo 3 recomendações por diretor. Ordem das falas: CCO, CMO, COO, CFO, CTO. Português do Brasil.`,
    messages: [{ role: "user", content: `Hoje: ${new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone: "America/Sao_Paulo" })}.\n\n${bloco}` }],
  })
  const r = JSON.parse(resp.content.flatMap(c => c.type === "text" ? [c.text] : []).join("")) as { abertura: string; fechamento: string; falas: { diretor: IdDiretor; fala: string; recomendacoes: { texto: string; urgencia: "hoje" | "semana" }[] }[] }
  const id = `reuniao-${Date.now().toString(36)}`
  const reuniao: Reuniao = {
    id, em: new Date().toISOString(), abertura: r.abertura, fechamento: r.fechamento,
    falas: r.falas.filter(f => diretores.some(d => d.id === f.diretor)).map(f => {
      const d = diretores.find(x => x.id === f.diretor)!
      return { diretor: f.diretor, cargo: d.cargo, tom: d.tom, fala: f.fala, recomendacoes: f.recomendacoes.slice(0, 3).map((x, k) => ({ id: `${f.diretor}-${k}`, texto: x.texto, urgencia: x.urgencia, resposta: null })) }
    }),
  }
  await mudarConfig(() => ({ ultimaReuniao: reuniao }))
  return reuniao
}

export async function responderRecomendacao(reuniaoId: string, recId: string, resposta: "aprovo" | "depois" | null) {
  await mudarConfig((d: { ultimaReuniao?: Reuniao }) => {
    const r = d.ultimaReuniao
    if (!r || r.id !== reuniaoId) return null
    return { ultimaReuniao: { ...r, falas: r.falas.map(f => ({ ...f, recomendacoes: f.recomendacoes.map(x => x.id === recId ? { ...x, resposta } : x) })) } }
  })
}

// Ata para o WhatsApp do Felipe (curta: uma linha por diretor, só o que é para hoje)
export function textoDaAta(r: Reuniao, link: string): string {
  const dia = new Date(r.em).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" })
  const linhas = [`🏛️ *Reunião de diretoria · ${dia}*`, "", r.abertura, ""]
  for (const f of r.falas) {
    const hoje = f.recomendacoes.filter(x => x.urgencia === "hoje")
    linhas.push(`*${f.cargo}*: ${f.fala}`)
    for (const x of (hoje.length ? hoje : f.recomendacoes).slice(0, 2)) linhas.push(`   → ${x.texto}`)
  }
  linhas.push("", `*Prioridade 1:* ${r.fechamento.replace(/^\s*(a\s+)?prioridade (número|n[ºo°.]?)\s*1\s*(do dia)?\s*(é|:)?\s*/i, "").replace(/^./, c => c.toUpperCase())}`, "", `Aprovar ou adiar: ${link}`)
  return linhas.join("\n")
}
