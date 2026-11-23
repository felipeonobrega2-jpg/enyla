// Reunião de diretoria: cada diretor (COO, CCO, CMO, CFO, CTO) vira um agente que lê os números reais da área e o
// que o Felipe ensinou a ele (conhecimentoDiretoria), e fala na mesa: o que viu, o que preocupa, o que recomenda.
// Diretor gere resultado e decide pensando nas metas e na cultura da companhia; não executa. Cada ação vai para um
// funcionário qualificado (lib/diretoria FUNCIONARIOS), que redige com o histórico do cliente; o "Aprovo" do Felipe
// envia pelo sistema (fica no histórico). Nada vai a cliente sem o Aprovo. O que nenhum funcionário sabe fazer fica com
// o Felipe. A reunião seguinte cobra o resultado do que foi aprovado na anterior. Só roda no servidor.
import { lerCampos, mudarConfig } from "./configAtomica"
import { clienteClaude, MODELO } from "./claude"
import { montarDiretoria, DIRETORES, EQUIPE, type IdDiretor, type IdBase, type LicaoDiretor, type Diretor } from "./diretoria"
import { quadro, executores, type Funcionario } from "./rh"

// executor: o funcionário que executa (ou o Felipe). mensagem: o texto que o funcionário escreveu; o "Aprovo" envia.
export type Recomendacao = {
  id: string; texto: string; urgencia: "hoje" | "semana"; resposta?: "aprovo" | "depois" | null
  executor?: string                                          // id do funcionário (quadro do RH) ou "felipe"
  executorNome?: string | null
  mensagem?: { cliente: string; texto: string } | null
  pendencia?: string | null                                   // o funcionário não conseguiu preparar (ex.: sem WhatsApp do cliente)
  enviado?: { em: string; ok: boolean; erro?: string } | null
}
// contratacao: o diretor pediu um funcionário ao RH; vagaId é a vaga que o RH preparou (o Felipe contrata ou não)
export type Contratacao = { cargo: string; motivo: string; vagaId?: string | null; erro?: string | null }
export type Fala = { diretor: IdDiretor; cargo: string; fala: string; recomendacoes: Recomendacao[]; tom: Diretor["tom"]; contratacao?: Contratacao | null }
export type Reuniao = { id: string; em: string; abertura: string; falas: Fala[]; fechamento: string }

const esquema = (ids: string[]) => ({
  type: "object", additionalProperties: false, required: ["abertura", "falas", "fechamento"],
  properties: {
    abertura: { type: "string", description: "Uma frase do CCO abrindo a reunião para o Felipe: o quadro geral de hoje." },
    falas: { type: "array", items: { type: "object", additionalProperties: false, required: ["diretor", "fala", "recomendacoes"], properties: {
      diretor: { type: "string", enum: ["coo", "cco", "cmo", "cfo", "cto"] },
      fala: { type: "string", description: "2 a 3 frases, primeira pessoa, direto ao ponto, com números." },
      recomendacoes: { type: "array", items: { type: "object", additionalProperties: false, required: ["texto", "urgencia", "executor", "cliente"], properties: {
        texto: { type: "string", description: "A ordem: uma ação concreta que o Felipe aprova ou não. Imperativo, curta, com os fatos (pedido, valor) que o executor precisa." },
        urgencia: { type: "string", enum: ["hoje", "semana"] },
        executor: { type: "string", enum: [...ids, "felipe"], description: "Quem executa" },
        cliente: { anyOf: [{ type: "null" }, { type: "string" }], description: "Nome do cliente EXATAMENTE como aparece nas pendências, quando a ordem é falar com um cliente; senão null" },
      } } },
      contratacao: { anyOf: [{ type: "null" }, { type: "object", additionalProperties: false, required: ["cargo", "funcao", "motivo"], properties: {
        cargo: { type: "string" }, funcao: { type: "string", description: "O que o funcionário vai fazer, concreto" }, motivo: { type: "string", description: "Por que a área precisa, com número do placar" },
      } }], description: "Pedido de contratação ao RH, ou null" },
    } } },
    fechamento: { type: "string", description: "Uma frase fechando: a prioridade número 1 do dia." },
  },
})

async function todas<T>(tabela: string, sel = "*"): Promise<T[]> {
  const { supabase } = await import("./supabase")
  const out: T[] = []
  for (let i = 0; ; i += 1000) { const { data } = await supabase.from(tabela).select(sel).range(i, i + 999); out.push(...((data ?? []) as T[])); if (!data || data.length < 1000) break }
  return out
}

export async function convocarReuniao(op: { salvar?: boolean } = {}): Promise<Reuniao> {
  const [{ montarHoje }, { financeiroDoAndar }, { unpackTerceirizado }, agendador, escritorio] = await Promise.all([
    import("./hojeServidor"), import("./financeiroAndar"), import("./kanbanUnpack"),
    import("../api/agendador/route"), import("../api/escritorio/route"),
  ])
  const [hoje, kanbanBruto, lancamentos, cfg, rot, esc] = await Promise.all([
    montarHoje().catch(() => null), todas<import("../types").KanbanCard>("KanbanCard"), todas<import("../types").LancamentoFinanceiro>("LancamentoFinanceiro"),
    lerCampos<{ apiKey?: string; conhecimentoDiretoria?: Partial<Record<IdBase, LicaoDiretor[]>>; contas?: { ativa?: boolean; tipo?: string; saldo?: number | null }[]
      ultimaReuniao?: Reuniao; conhecimentoAgente?: import("./agenteLeads").Conhecimento[]; funcionarios?: Funcionario[] }>(["apiKey", "conhecimentoDiretoria", "contas", "ultimaReuniao", "conhecimentoAgente", "funcionarios"]),
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
  const { progressoDaEmpresa } = await import("./animarServidor")
  const prog = await progressoDaEmpresa(kanban, lancamentos)
  const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
  const diaDoMes = Number(new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(8, 10))
  const metas = (base.metas ?? []).map(l => `- ${l.texto}`)
  const cultura = (base.cultura ?? []).map(l => l.texto)
  const norte = `# Norte da companhia
Meta do mês: ${prog && prog.metaMes > 0 ? `${brl(prog.metaMes)}; vendido até agora ${brl(prog.vendidoMes)} (${Math.round(prog.vendidoMes / prog.metaMes * 100)}%, dia ${diaDoMes} do mês)` : `sem meta definida; vendido no mês ${brl(prog?.vendidoMes ?? 0)}`}
${prog?.proximo ? `Próximo marco: ${prog.proximo.nome} (faltam ${brl(prog.falta)})` : ""}
Metas do Felipe:
${metas.join("\n") || "- (ainda não definidas)"}
Cultura:
${cultura.map(c => `- ${c}`).join("\n") || "- (ainda não definida)"}`
  const ant = cfg.ultimaReuniao
  const resultados = ant ? `# O que foi decidido na reunião anterior (${new Date(ant.em).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}) — cobre o resultado
${ant.falas.flatMap(f => f.recomendacoes.map(x => `- ${f.cargo}: ${x.texto} → ${x.resposta === "aprovo" ? (x.enviado?.ok ? "aprovado e executado (mensagem enviada)" : x.enviado ? `aprovado, mas falhou: ${x.enviado.erro}` : "aprovado") : x.resposta === "depois" ? "adiado pelo Felipe" : "sem resposta do Felipe"}`)).join("\n") || "- nada"}` : ""
  const q = quadro(cfg.funcionarios), exec = executores(q)
  const outros = q.filter(f => !exec.includes(f) && f.status !== "recusado")
  const equipe = `# Funcionários que executam ordens da diretoria (executor)
${exec.map(f => `- ${f.id} (${f.nome}, equipe do ${f.setor.toUpperCase()}): ${f.qualificacao}`).join("\n")}
- felipe: o que nenhum funcionário sabe fazer (decidir preço, recarregar a Meta, negociar). Orçar o Offset é do Felipe por decisão dele, até ele terminar de treinar o agente de orçamentos: não peça contratação para isso.
${outros.length ? `Já no RH (não executam ordens ainda): ${outros.map(f => `${f.nome} (${f.setor.toUpperCase()}, ${f.status === "solicitado" ? "vaga esperando o Felipe" : `falta ferramenta: ${f.ferramentaQueFalta ?? "?"}`})`).join("; ")}` : ""}`
  const bloco = diretores.map(d => {
    const info = DIRETORES.find(x => x.id === d.id)!
    const licoes = (base[d.id] ?? []).slice(0, 40).map(l => `- ${l.texto}`).join("\n")
    return `## ${d.cargo} (${info.area}): ${info.faz}
Equipe que trabalha sozinha sob ele: ${EQUIPE[d.id].join(", ") || "nenhuma ainda"}
Placar: ${d.placar.map(p => `${p.rotulo}: ${p.valor}${p.tom !== "ok" ? ` [${p.tom}]` : ""}`).join("; ")}
Pendências que o sistema já viu: ${d.decisoes.length ? d.decisoes.join(" | ") : "nenhuma"}
O que o Felipe ensinou a este diretor:
${licoes || "- (ainda nada)"}`
  }).join("\n\n")

  const resp = await clienteClaude(cfg.apiKey).beta.messages.create({
    model: MODELO, max_tokens: 4000,
    output_config: { effort: "low", format: { type: "json_schema", schema: esquema(exec.map(f => f.id)) } },
    system: `Você conduz a reunião de diretoria da ENYLA (gráfica de embalagens; Offset com o Felipe, Digital 100% IA). O Felipe é o CEO. Cada diretor é um agente que gere os resultados da área dele pensando nas metas e na cultura da companhia: fala em primeira pessoa, direto, com números do placar, diz se a área está ajudando ou atrapalhando a meta do mês, e decide as próximas ações.
Diretor não executa. Cada ação vai para um executor: um funcionário qualificado da lista (só se a ordem for exatamente o que ele sabe fazer) ou "felipe". Quando a ordem é falar com um cliente, preencha "cliente" com o nome exato das pendências e ponha na ordem os fatos que o funcionário precisa (pedido, valor).
Contratação: se a área tem um trabalho recorrente que hoje cai no Felipe ou não é feito, e nenhum funcionário (nem vaga no RH) cobre, o diretor pede a contratação ao RH em "contratacao" (cargo, função concreta, motivo com número). No máximo uma por diretor e só quando faz diferença de verdade; nos outros casos, null. O RH desenha a vaga e o onboarding e o Felipe decide.
Cobre o resultado da reunião anterior: o que foi aprovado andou? o que foi adiado continua pendente? Não repita uma ordem já executada se o problema sumiu do placar. Use exatamente o status de cada ordem anterior: "sem resposta" não é "aprovado".
Regras: cada diretor só fala da área dele e segue o que o Felipe ensinou a ele (isso vale mais que qualquer outra coisa). Sem enrolação, sem elogio, sem inventar número que não está no placar. Se está tudo em ordem, diga isso em uma frase e não invente recomendação. No máximo 3 recomendações por diretor. Ordem das falas: CCO, CMO, COO, CFO, CTO. Português do Brasil.`,
    messages: [{ role: "user", content: `Hoje: ${new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone: "America/Sao_Paulo" })}.\n\n${norte}\n\n${resultados}\n\n${equipe}\n\n${bloco}` }],
  })
  const r = JSON.parse(resp.content.flatMap(c => c.type === "text" ? [c.text] : []).join("")) as { abertura: string; fechamento: string; falas: { diretor: IdDiretor; fala: string; recomendacoes: { texto: string; urgencia: "hoje" | "semana"; executor: string; cliente: string | null }[]; contratacao: { cargo: string; funcao: string; motivo: string } | null }[] }
  const id = `reuniao-${Date.now().toString(36)}`
  const reuniao: Reuniao = {
    id, em: new Date().toISOString(), abertura: r.abertura, fechamento: r.fechamento,
    falas: r.falas.filter(f => diretores.some(d => d.id === f.diretor)).map(f => {
      const d = diretores.find(x => x.id === f.diretor)!
      return { diretor: f.diretor, cargo: d.cargo, tom: d.tom, fala: f.fala, contratacao: f.contratacao ? { cargo: f.contratacao.cargo, motivo: f.contratacao.motivo, vagaId: null, erro: null } : null, recomendacoes: f.recomendacoes.slice(0, 3).map((x, k): Recomendacao => ({
        id: `${f.diretor}-${k}`, texto: x.texto, urgencia: x.urgencia, resposta: null, executor: x.executor, executorNome: x.executor === "felipe" ? "você" : exec.find(e => e.id === x.executor)?.nome ?? null,
        mensagem: null, pendencia: null, ...(x.cliente?.trim() ? { _cliente: x.cliente.trim() } : {}),
      })) }
    }),
  }
  // Os funcionários preparam as mensagens das ordens com cliente (em paralelo); o envio só depois do Aprovo
  const { redigirComoFuncionario } = await import("./funcionariosServidor")
  await Promise.all(reuniao.falas.flatMap(f => f.recomendacoes).map(async rec => {
    const x = rec as Recomendacao & { _cliente?: string }
    const cliente = x._cliente; delete x._cliente
    const func = exec.find(f => f.id === x.executor)
    if (!cliente || !func) return
    const r = await redigirComoFuncionario({ funcionario: func, cliente, ordem: x.texto, apiKey: cfg.apiKey!, conhecimento: cfg.conhecimentoAgente, cultura })
    if (r.ok) x.mensagem = { cliente, texto: r.texto }
    else x.pendencia = r.erro
  }))
  // Pedidos de contratação vão para o RH, que prepara a vaga e o onboarding (o Felipe contrata ou não)
  const { prepararVaga } = await import("./rhServidor")
  await Promise.all(reuniao.falas.map(async f => {
    const pedido = r.falas.find(x => x.diretor === f.diretor)?.contratacao
    if (!pedido || !f.contratacao) return
    const v = await prepararVaga(pedido, f.diretor, { salvar: op.salvar })
    f.contratacao = v.ok ? { ...f.contratacao, cargo: v.vaga.nome, vagaId: v.vaga.id } : { ...f.contratacao, erro: v.erro }
  }))
  if (op.salvar !== false) await mudarConfig(() => ({ ultimaReuniao: reuniao }))
  return reuniao
}

// "Aprovo" numa recomendação com mensagem: envia ao cliente pelo sistema (uma vez só) e guarda o resultado
export async function responderRecomendacao(reuniaoId: string, recId: string, resposta: "aprovo" | "depois" | null): Promise<Recomendacao | null> {
  const { lerCampos: ler } = await import("./configAtomica")
  const { ultimaReuniao } = await ler<{ ultimaReuniao?: Reuniao }>(["ultimaReuniao"])
  const rec = ultimaReuniao?.id === reuniaoId ? ultimaReuniao.falas.flatMap(f => f.recomendacoes).find(x => x.id === recId) : undefined
  if (!rec) return null
  let enviado = rec.enviado ?? null
  if (resposta === "aprovo" && rec.mensagem && !rec.enviado?.ok) {
    const { enviarAoCliente } = await import("./enviarCliente")
    const r = await enviarAoCliente(rec.mensagem.cliente, rec.mensagem.texto).catch(e => ({ ok: false as const, erro: String(e), status: 500 }))
    enviado = r.ok ? { em: new Date().toISOString(), ok: true } : { em: new Date().toISOString(), ok: false, erro: r.erro }
  }
  let final: Recomendacao | null = null
  await mudarConfig((d: { ultimaReuniao?: Reuniao }) => {
    const r = d.ultimaReuniao
    if (!r || r.id !== reuniaoId) return null
    return { ultimaReuniao: { ...r, falas: r.falas.map(f => ({ ...f, recomendacoes: f.recomendacoes.map(x => x.id === recId ? (final = { ...x, resposta, enviado }) : x) })) } }
  })
  return final
}

// Ata para o WhatsApp do Felipe (curta: uma linha por diretor, só o que é para hoje)
export function textoDaAta(r: Reuniao, link: string): string {
  const dia = new Date(r.em).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" })
  const linhas = [`🏛️ *Reunião de diretoria · ${dia}*`, "", r.abertura, ""]
  for (const f of r.falas) {
    const hoje = f.recomendacoes.filter(x => x.urgencia === "hoje")
    linhas.push(`*${f.cargo}*: ${f.fala}`)
    for (const x of (hoje.length ? hoje : f.recomendacoes).slice(0, 2)) {
      const quem = x.executor !== "felipe" ? x.executorNome : null
      linhas.push(`   → ${x.texto}${x.mensagem && quem ? ` _(${quem} já escreveu a mensagem para ${x.mensagem.cliente}: é só aprovar)_` : ""}`)
    }
    if (f.contratacao?.vagaId) linhas.push(`   → Pediu ao RH: *${f.contratacao.cargo}* (vaga pronta para você contratar)`)
  }
  linhas.push("", `*Prioridade 1:* ${r.fechamento.replace(/^\s*(a\s+)?prioridade (número|n[ºo°.]?)\s*1\s*(do dia)?\s*(é|:)?\s*/i, "").replace(/^./, c => c.toUpperCase())}`, "", `Aprovar ou adiar: ${link}`)
  return linhas.join("\n")
}
