// Conversa 1:1 do Felipe com um diretor. O diretor pensa em alto nível (diagnostica com números, planeja, decide) e
// age pelas ferramentas dele: manda um funcionário executar (mensagem a cliente fica esperando o Aprovo), pede
// contratação ao RH, pede ferramenta ao sistema, registra o plano combinado e guarda o que o Felipe ensinou.
// Ele não executa nada sozinho nem fala com cliente. Só roda no servidor.
import type Anthropic from "@anthropic-ai/sdk"
import { clienteClaude, MODELO } from "./claude"
import { DIRETORES, type IdDiretor, type LicaoDiretor, type IdBase } from "./diretoria"
import { coletarContexto } from "./reuniaoDiretoria"
import { lerConversa, gravarConversa, gravarPlano, pedirFerramenta, type AcaoConversa, type MsgConversa } from "./diretoriaServidor"
import { mudarConfig } from "./configAtomica"
import { COLUNAS_KANBAN } from "../types"

const novoId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

function ferramentas(execIds: string[]): Anthropic.Beta.BetaTool[] {
  return [
    { name: "detalhar", description: "Traz os detalhes de uma área da empresa (listas com nomes, datas e valores) para analisar antes de decidir.",
      input_schema: { type: "object", properties: { area: { type: "string", enum: ["comercial", "producao", "financeiro", "marketing", "sistema"] } }, required: ["area"] } },
    ...(execIds.length ? [{ name: "ordenar_funcionario", description: "Manda um funcionário executar uma ordem que é falar com UM cliente. O funcionário escreve a mensagem com o histórico do cliente; ela aparece para o Felipe aprovar antes de enviar. Use só quando o Felipe concordar com a ação ou pedir.",
      input_schema: { type: "object", properties: {
        funcionario: { type: "string", enum: execIds }, cliente: { type: "string", description: "Nome do cliente exatamente como nos dados" },
        ordem: { type: "string", description: "A ordem com os fatos que ele precisa (pedido, valor, o que combinar)" } }, required: ["funcionario", "cliente", "ordem"] } } as Anthropic.Beta.BetaTool] : []),
    { name: "pedir_contratacao", description: "Pede ao RH a contratação de um funcionário (agente) para um trabalho recorrente da sua área que hoje ninguém faz ou cai no Felipe. O RH desenha a vaga e o onboarding; o Felipe contrata.",
      input_schema: { type: "object", properties: { cargo: { type: "string" }, funcao: { type: "string" }, motivo: { type: "string" } }, required: ["cargo", "funcao", "motivo"] } },
    { name: "pedir_ferramenta", description: "Pede uma ferramenta de conexão com a empresa (o sistema ganhar uma capacidade: ler algo, mexer em algo, integrar algo). Entra na lista do CTO; o Felipe aprova e depois é construída.",
      input_schema: { type: "object", properties: { nome: { type: "string" }, paraQue: { type: "string" }, motivo: { type: "string" } }, required: ["nome", "paraQue", "motivo"] } },
    { name: "registrar_plano", description: "Registra o plano da sua área combinado com o Felipe (substitui o anterior). Você vai cobrar esse plano nas reuniões.",
      input_schema: { type: "object", properties: { objetivo: { type: "string" }, indicador: { type: "string", description: "Como medir, com número e prazo" }, passos: { type: "array", items: { type: "string" } } }, required: ["objetivo", "indicador", "passos"] } },
    { name: "guardar_conhecimento", description: "Guarda algo que o Felipe ensinou e que vale para sempre na sua área (regra, preferência, contexto).",
      input_schema: { type: "object", properties: { texto: { type: "string" } }, required: ["texto"] } },
  ]
}

type Ctx = Awaited<ReturnType<typeof coletarContexto>>
function detalhe(ctx: Ctx, area: string): string {
  const h = (ctx.hoje ?? {}) as Record<string, unknown>
  const corta = (x: unknown) => JSON.stringify(x).slice(0, 7000)
  if (area === "comercial") return corta({ responder: h.responder, orcar: h.orcar, resolver: h.resolver, meta: h.meta })
  if (area === "producao") return corta(ctx.kanban.filter(c => c.coluna >= 2 && c.coluna <= 8).map(c => ({ numero: c.numero, cliente: c.nomeCliente, etapa: COLUNAS_KANBAN[c.coluna] ?? c.coluna, entregaPrevista: c.dataEntregaPrevista ?? null })))
  if (area === "financeiro") return corta(ctx.fin)
  if (area === "marketing") return corta({ anuncio: h.anuncio, marketing: h.marketing, gastos: h.gastos })
  return corta({ rotinas: ctx.rot?.rotinas, whatsapp: ctx.esc?.whatsapp, semCredito: ctx.esc?.semCredito, cota: ctx.esc?.cota, agentes: (ctx.esc?.mesas ?? []).map((m: { nome: string; estado: string }) => ({ nome: m.nome, estado: m.estado })) })
}

function resumoAcao(a: AcaoConversa): string {
  if (a.tipo === "mensagem") return `mensagem do ${a.funcionario} para ${a.cliente} (${a.status === "aguardando" ? "esperando o Aprovo do Felipe" : a.status})`
  if (a.tipo === "vaga") return `pediu ao RH: ${a.nome}`
  if (a.tipo === "ferramenta") return `pediu ferramenta: ${a.nome}`
  if (a.tipo === "plano") return `registrou o plano: ${a.objetivo}`
  if (a.tipo === "aprendi") return `guardou: ${a.texto}`
  return a.texto
}

// simular: não grava nada (conversa, vaga, ferramenta, plano, lição); serve para testar com os dados reais
export async function conversar(diretor: IdDiretor, textoFelipe: string, op: { simular?: boolean; historico?: MsgConversa[] } = {}): Promise<MsgConversa[]> {
  const grava = !op.simular
  const info = DIRETORES.find(d => d.id === diretor)!
  const ctx = await coletarContexto()
  if (!ctx.cfg.apiKey) throw new Error("Sem chave da IA nas Configurações.")
  const historico = op.historico ?? await lerConversa(diretor)
  const minha: MsgConversa = { id: novoId(), de: "felipe", texto: textoFelipe.slice(0, 4000), em: new Date().toISOString() }
  const colegas = DIRETORES.filter(d => d.id !== diretor).map(d => `${d.nome.split(" ")[0]} (${d.cargo}, ${d.area})`).join(", ")
  const blocos = ctx.bloco.split(/\n\n(?=## )/)
  const meu = blocos.find(b => b.includes(`, ${info.cargo} (`)) ?? ""
  const system = `Você é ${info.nome}, ${info.cargo} da ENYLA (gráfica de embalagens; Offset com o Felipe, Digital 100% IA). Sua área: ${info.area} (${info.faz}). Seu jeito: ${info.jeito}
Você está numa conversa 1:1 com o Felipe, o CEO. Seus colegas de diretoria: ${colegas}.
Como você trabalha:
- Pensa em alto nível: diagnostica com números, liga a área às metas e à cultura, propõe plano (objetivo, indicador com número e prazo, passos) e decide.
- Não executa você mesmo. Execução é de funcionários qualificados (ordenar_funcionario, só ordens de falar com UM cliente) ou do Felipe. Falta gente: pedir_contratacao. Falta o sistema se conectar a algo: pedir_ferramenta. Combinaram um plano: registrar_plano. O Felipe ensinou algo que vale para sempre: guardar_conhecimento.
- Só diga que fez algo (pediu, registrou, mandou, guardou) se chamou a ferramenta NESTA resposta; o Felipe vê na tela cada ação feita. Se disser "vou pedir", peça de verdade na mesma resposta. O que já foi feito antes aparece como [O que eu fiz: ...]; não repita.
- Use as ferramentas quando a conversa pedir, sem perguntar se pode registrar; mas mensagem a cliente só quando o Felipe concordar com a ação (ela ainda passa pelo Aprovo dele).
- Fale como um executivo de verdade: direto, primeira pessoa, sem elogio nem enrolação. Discorde com argumento quando achar que o Felipe está errado. Pergunte quando faltar informação. Respostas curtas (até 150 palavras), a não ser que ele peça um plano detalhado. Sem emoji e sem markdown pesado (no máximo listas simples).
- Nunca invente número: use os dados abaixo ou "detalhar". Orçar o Offset é do Felipe por decisão dele, até ele terminar de treinar o agente de orçamentos.
Português do Brasil.

Hoje: ${new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone: "America/Sao_Paulo" })}.

${ctx.norte}

# Sua área agora
${meu}

${ctx.equipe}

${ctx.ferramentasTxt}

${ctx.resultados}

# As outras áreas (para contexto)
${blocos.filter(b => b !== meu).map(b => b.split("\n").slice(0, 3).join("\n")).join("\n\n")}`

  const msgs: Anthropic.Beta.BetaMessageParam[] = []
  for (const m of historico.slice(-30)) {
    const texto = m.de === "diretor" && m.acoes?.length ? `${m.texto}\n\n[O que eu fiz: ${m.acoes.map(resumoAcao).join("; ")}]` : m.texto
    const papel = m.de === "felipe" ? "user" : "assistant"
    if (msgs.length && msgs[msgs.length - 1].role === papel) (msgs[msgs.length - 1] as { content: string }).content += `\n\n${texto}`
    else msgs.push({ role: papel, content: texto })
  }
  if (msgs.length && msgs[0].role === "assistant") msgs.shift()
  if (msgs.length && msgs[msgs.length - 1].role === "user") (msgs[msgs.length - 1] as { content: string }).content += `\n\n${minha.texto}`
  else msgs.push({ role: "user", content: minha.texto })

  const acoes: AcaoConversa[] = []
  const cli = clienteClaude(ctx.cfg.apiKey)
  const execIds = ctx.exec.map(f => f.id)
  let textoFinal = ""
  for (let volta = 0; volta < 8; volta++) {
    const resp = await cli.beta.messages.create({
      model: MODELO, max_tokens: 3000, thinking: { type: "adaptive" }, output_config: { effort: "medium" },
      system, tools: ferramentas(execIds), messages: msgs,
    })
    const texto = resp.content.flatMap(c => c.type === "text" ? [c.text] : []).join("\n").trim()
    if (texto) textoFinal = textoFinal ? `${textoFinal}\n\n${texto}` : texto
    const usos = resp.content.filter((c): c is Anthropic.Beta.BetaToolUseBlock => c.type === "tool_use")
    if (resp.stop_reason !== "tool_use" || !usos.length) break
    msgs.push({ role: "assistant", content: resp.content })
    const resultados: Anthropic.Beta.BetaToolResultBlockParam[] = []
    for (const u of usos) {
      const x = u.input as Record<string, unknown>
      let saida = ""
      try {
        if (u.name === "detalhar") saida = detalhe(ctx, String(x.area))
        else if (u.name === "ordenar_funcionario") {
          const func = ctx.exec.find(f => f.id === x.funcionario)
          if (!func) saida = "Funcionário não encontrado no quadro."
          else {
            const { redigirComoFuncionario } = await import("./funcionariosServidor")
            const r = await redigirComoFuncionario({ funcionario: func, cliente: String(x.cliente), ordem: String(x.ordem), apiKey: ctx.cfg.apiKey!, conhecimento: ctx.cfg.conhecimentoAgente, cultura: ctx.cultura })
            if (r.ok) { acoes.push({ id: novoId(), tipo: "mensagem", funcionario: func.nome, cliente: String(x.cliente), texto: r.texto, status: "aguardando" }); saida = `${func.nome} escreveu e a mensagem está esperando o Aprovo do Felipe: "${r.texto}"` }
            else { acoes.push({ id: novoId(), tipo: "falha", texto: r.erro }); saida = `Não deu: ${r.erro}` }
          }
        } else if (u.name === "pedir_contratacao") {
          const { prepararVaga } = await import("./rhServidor")
          const r = await prepararVaga({ cargo: String(x.cargo), funcao: String(x.funcao), motivo: String(x.motivo) }, diretor, { salvar: grava })
          if (r.ok) { acoes.push({ id: novoId(), tipo: "vaga", vagaId: r.vaga.id, nome: r.vaga.nome, resumo: r.vaga.qualificacao }); saida = `O RH preparou a vaga "${r.vaga.nome}" (${r.vaga.capacidade === "sem_ferramenta" ? `ainda sem ferramenta: ${r.vaga.ferramentaQueFalta}` : "pode trabalhar assim que contratado"}). Está esperando o Felipe contratar.` }
          else saida = r.erro
        } else if (u.name === "pedir_ferramenta") {
          const p = { nome: String(x.nome), paraQue: String(x.paraQue), motivo: String(x.motivo), pedidoPor: diretor }
          const f = grava ? await pedirFerramenta(p) : { ...p, id: "simulada", em: "", status: "pedida" as const }
          acoes.push({ id: novoId(), tipo: "ferramenta", ferramentaId: f.id, nome: f.nome, resumo: f.paraQue })
          saida = f.status === "pedida" ? "Pedido registrado na lista do CTO, esperando o Felipe aprovar." : `Já existia esse pedido (${f.status}).`
        } else if (u.name === "registrar_plano") {
          const passos = (x.passos as string[] ?? []).slice(0, 10)
          if (grava) await gravarPlano(diretor, { objetivo: String(x.objetivo), indicador: String(x.indicador), passos })
          acoes.push({ id: novoId(), tipo: "plano", objetivo: String(x.objetivo), indicador: String(x.indicador), passos })
          saida = "Plano registrado. Ele aparece nas próximas reuniões."
        } else if (u.name === "guardar_conhecimento") {
          const t = String(x.texto).slice(0, 1500)
          const licao: LicaoDiretor = { id: `${diretor}-${Date.now().toString(36)}`, texto: t, em: new Date().toISOString() }
          if (grava) await mudarConfig((d: { conhecimentoDiretoria?: Partial<Record<IdBase, LicaoDiretor[]>> }) => ({ conhecimentoDiretoria: { ...(d.conhecimentoDiretoria ?? {}), [diretor]: [licao, ...((d.conhecimentoDiretoria ?? {})[diretor] ?? [])].slice(0, 300) } }))
          acoes.push({ id: novoId(), tipo: "aprendi", texto: t })
          saida = "Guardado."
        } else saida = "Ferramenta desconhecida."
      } catch (e) { saida = `Erro: ${String(e).slice(0, 200)}` }
      resultados.push({ type: "tool_result", tool_use_id: u.id, content: saida })
    }
    msgs.push({ role: "user", content: resultados })
  }
  const dele: MsgConversa = { id: novoId(), de: "diretor", texto: textoFinal || "(sem resposta)", em: new Date().toISOString(), ...(acoes.length ? { acoes } : {}) }
  const todas = [...historico, minha, dele]
  if (grava) await gravarConversa(diretor, todas)
  return todas
}

// Felipe responde a um cartão de mensagem na conversa: "aprovo" envia pelo sistema (uma vez só); "descartar" descarta
export async function responderAcao(diretor: IdDiretor, acaoId: string, resposta: "aprovo" | "descartar", textoEditado?: string): Promise<MsgConversa[]> {
  const todas = await lerConversa(diretor)
  const acao = todas.flatMap(m => m.acoes ?? []).find(a => a.id === acaoId)
  if (!acao || acao.tipo !== "mensagem" || acao.status === "enviado") return todas
  if (resposta === "descartar") acao.status = "descartado"
  else {
    if (textoEditado?.trim()) acao.texto = textoEditado.trim().slice(0, 4000)
    const { enviarAoCliente } = await import("./enviarCliente")
    const r = await enviarAoCliente(acao.cliente, acao.texto).catch(e => ({ ok: false as const, erro: String(e), status: 500 }))
    if (r.ok) { acao.status = "enviado"; acao.em = new Date().toISOString(); delete acao.erro }
    else { acao.status = "erro"; acao.erro = r.erro }
  }
  await gravarConversa(diretor, todas)
  return todas
}
