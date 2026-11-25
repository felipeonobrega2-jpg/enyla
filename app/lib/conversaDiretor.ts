// Conversa 1:1 do Felipe com um diretor. O diretor pensa em alto nível (diagnostica com números, planeja, decide) e
// age pelas ferramentas dele: manda um funcionário executar (mensagem a cliente fica esperando o Aprovo), pede
// contratação ao RH, pede ferramenta ao sistema, registra o plano combinado e guarda o que o Felipe ensinou.
// Ele não executa nada sozinho nem fala com cliente. Só roda no servidor.
import type Anthropic from "@anthropic-ai/sdk"
import { clienteClaude, MODELO } from "./claude"
import { registrarUsoIA } from "./gastosServidor"
import { DIRETORES, type IdDiretor, type LicaoDiretor, type IdBase } from "./diretoria"
import { coletarContexto } from "./reuniaoDiretoria"
import { lerConversa, gravarConversa, gravarPlano, pedirFerramenta, type AcaoConversa, type MsgConversa } from "./diretoriaServidor"
import { lerCampos, mudarConfig } from "./configAtomica"
import { COLUNAS_KANBAN } from "../types"
import { ehComercial, ordenarComercial, comerciaisDoDiretor } from "./ordemComercial"
import { detalheProducao } from "./etapasProducao"
import { comDigital } from "./digitalProducao"
import type { Rastreio } from "./prazoProducao"
import { definirFeriadosLocais } from "./diasUteis"
import { CONFIG_PADRAO } from "../config"

// Só leitura do histórico de etapas; se falhar, o detalhe sai sem as datas
async function lerRastreios(): Promise<Rastreio[]> {
  try {
    const { supabase } = await import("./supabase")
    const { data } = await supabase.from("Tracking").select("numero, etapas")
    return (data ?? []).map(t => ({ numero: t.numero as string, etapas: (t.etapas ?? []) as Rastreio["etapas"] }))
  } catch { return [] }
}

// Só leitura dos pedidos digitais (mesmo array da configuração); se falhar, o detalhe sai sem eles
// e acerta os feriados (AppConfig.feriados) usados nos dias úteis
async function lerDigitais(): Promise<Parameters<typeof comDigital>[1]> {
  try {
    const c = await lerCampos<{ pedidosDigitais?: (NonNullable<Parameters<typeof comDigital>[1]>[number] & { jid: string })[]; feriados?: unknown }>(["pedidosDigitais", "feriados"])
    definirFeriadosLocais((c.feriados ?? CONFIG_PADRAO.feriados) as never)
    const pedidos = c.pedidosDigitais ?? []
    const { lerSugestoes } = await import("./arteAprovadaServidor")
    const sug = await lerSugestoes(pedidos)   // só leitura: nada é gravado
    return pedidos.map(p => { const s = sug.find(x => x.pedido === p.id); return s ? { ...p, sugestaoArteAprovada: { trecho: s.trecho, em: s.em } } : p })
  } catch { return [] }
}

// Versão do código que montou a foto: deploy novo invalida a foto guardada no banco
export const VERSAO_CODIGO = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.VERCEL_DEPLOYMENT_ID ?? process.env.npm_package_version ?? "local"

function producaoBase(ctx: Ctx, rastreios: Rastreio[]): string {
  return detalheProducao(ctx.kanban.filter(c => c.coluna >= 2 && c.coluna <= 8).map(c => ({ ...c, aguardandoPagamento: ctx.segurados[c.numero] ?? null })), rastreios, COLUNAS_KANBAN as unknown as string[])
}

/** Detalhe da produção para a porta externa: a base vem da foto, mas o bloco digital é montado na hora da leitura
 *  (uma leitura barata da configuração), então os pedidos DIG nunca ficam atrás do retrato. */
export async function producaoAtual(foto: Foto): Promise<string> {
  if (!foto.producaoBase) return foto.detalhes.producao
  return comDigital(foto.producaoBase, await lerDigitais())
}

const novoId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

function ferramentas(execIds: string[]): Anthropic.Beta.BetaTool[] {
  return [
    { name: "detalhar", description: "Traz os detalhes de uma área da empresa (listas com nomes, datas e valores) para analisar antes de decidir.",
      input_schema: { type: "object", properties: { area: { type: "string", enum: ["comercial", "producao", "financeiro", "marketing", "sistema"] } }, required: ["area"] } },
    ...(execIds.length ? [{ name: "ordenar_funcionario", description: "Manda um funcionário executar uma ordem que é falar com UM cliente. O funcionário escreve a mensagem com o histórico do cliente; ela aparece para o Felipe aprovar antes de enviar. Use só quando o Felipe concordar com a ação ou pedir.",
      input_schema: { type: "object", properties: {
        funcionario: { type: "string", enum: execIds }, cliente: { type: "string", description: "Nome do cliente exatamente como nos dados (para Atendente, Follow-up e Reativação: nome do contato ou telefone do lead)" },
        jid: { type: "string", description: "Só para Atendente, Follow-up e Reativação: o jid da conversa do lead, se souber (no lugar do nome)" },
        ordem: { type: "string", description: "A ordem com os fatos que ele precisa (pedido, valor, o que combinar)" } }, required: ["funcionario", "ordem"] } } as Anthropic.Beta.BetaTool] : []),
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
function detalhe(ctx: Ctx, area: string, rastreios: Rastreio[] = [], digitais: Parameters<typeof comDigital>[1] = []): string {
  const h = (ctx.hoje ?? {}) as Record<string, unknown>
  const corta = (x: unknown) => JSON.stringify(x).slice(0, 7000)
  if (area === "comercial") return corta({ responder: h.responder, orcar: h.orcar, resolver: h.resolver, meta: h.meta })
  if (area === "producao") return comDigital(producaoBase(ctx, rastreios), digitais)
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

// As ferramentas de um diretor: usadas na conversa com o Felipe e pela porta de acesso dos diretores na nuvem
// (api/externo). Mensagem a cliente nunca sai daqui: fica esperando o Aprovo do Felipe.
export async function executarFerramenta(diretor: IdDiretor, nome: string, x: Record<string, unknown>, op: { ctx: Foto; apiKey: string; grava: boolean }): Promise<{ saida: string; acao?: AcaoConversa; status?: number }> {
  const { ctx, grava } = op
  try {
    if (nome === "detalhar") return { saida: ctx.detalhes[String(x.area)] ?? "Área desconhecida." }
    if (nome === "ordenar_funcionario" && ehComercial(x.funcionario)) {
      return ordenarComercial(diretor, x, { apiKey: op.apiKey, cultura: ctx.cultura, novoId })
    }
    if (nome === "ordenar_funcionario") {
      const func = ctx.exec.find(f => f.id === x.funcionario)
      if (!func) return { saida: "Funcionário não encontrado no quadro." }
      if (!x.cliente) return { saida: "Falta o cliente." }
      const { redigirComoFuncionario } = await import("./funcionariosServidor")
      const r = await redigirComoFuncionario({ funcionario: func, cliente: String(x.cliente), ordem: String(x.ordem), apiKey: op.apiKey, conhecimento: (await lerCampos<{ conhecimentoAgente?: import("./agenteLeads").Conhecimento[] }>(["conhecimentoAgente"])).conhecimentoAgente, cultura: ctx.cultura })
      if (r.ok) return { acao: { id: novoId(), tipo: "mensagem", funcionario: func.nome, cliente: String(x.cliente), texto: r.texto, status: "aguardando" }, saida: `${func.nome} escreveu e a mensagem está esperando o Aprovo do Felipe: "${r.texto}"` }
      return { acao: { id: novoId(), tipo: "falha", texto: r.erro }, saida: `Não deu: ${r.erro}` }
    }
    if (nome === "pedir_contratacao") {
      const { prepararVaga } = await import("./rhServidor")
      const r = await prepararVaga({ cargo: String(x.cargo), funcao: String(x.funcao), motivo: String(x.motivo) }, diretor, { salvar: grava })
      if (!r.ok) return { saida: r.erro }
      return { acao: { id: novoId(), tipo: "vaga", vagaId: r.vaga.id, nome: r.vaga.nome, resumo: r.vaga.qualificacao }, saida: `O RH preparou a vaga "${r.vaga.nome}" (${r.vaga.capacidade === "sem_ferramenta" ? `ainda sem ferramenta: ${r.vaga.ferramentaQueFalta}` : "pode trabalhar assim que contratado"}). Está esperando o Felipe contratar.` }
    }
    if (nome === "pedir_ferramenta") {
      const p = { nome: String(x.nome), paraQue: String(x.paraQue), motivo: String(x.motivo), pedidoPor: diretor }
      const f = grava ? await pedirFerramenta(p) : { ...p, id: "simulada", em: "", status: "pedida" as const }
      return { acao: { id: novoId(), tipo: "ferramenta", ferramentaId: f.id, nome: f.nome, resumo: f.paraQue }, saida: f.status === "pedida" ? "Pedido registrado na lista do CTO, esperando o Felipe aprovar." : `Já existia esse pedido (${f.status}).` }
    }
    if (nome === "registrar_plano") {
      const passos = (x.passos as string[] ?? []).slice(0, 10).map(String)
      if (grava) await gravarPlano(diretor, { objetivo: String(x.objetivo), indicador: String(x.indicador), passos })
      return { acao: { id: novoId(), tipo: "plano", objetivo: String(x.objetivo), indicador: String(x.indicador), passos }, saida: "Plano registrado. Ele aparece nas próximas reuniões." }
    }
    if (nome === "guardar_conhecimento") {
      const t = String(x.texto).slice(0, 1500)
      const licao: LicaoDiretor = { id: `${diretor}-${Date.now().toString(36)}`, texto: t, em: new Date().toISOString() }
      if (grava) await mudarConfig((d: { conhecimentoDiretoria?: Partial<Record<IdBase, LicaoDiretor[]>> }) => ({ conhecimentoDiretoria: { ...(d.conhecimentoDiretoria ?? {}), [diretor]: [licao, ...((d.conhecimentoDiretoria ?? {})[diretor] ?? [])].slice(0, 300) } }))
      return { acao: { id: novoId(), tipo: "aprendi", texto: t }, saida: "Guardado." }
    }
    return { saida: "Ferramenta desconhecida." }
  } catch (e) { return { saida: `Erro: ${String(e).slice(0, 200)}` } }
}

// Foto da empresa para as conversas: juntar os números leva ~15 s (a tela Hoje é a parte pesada). A foto pronta fica
// guardada no banco (dados_sistema) e na memória; a conversa usa a que existe (até 12 h, com o horário dela no prompt)
// e uma nova é montada em segundo plano ao abrir a conversa e depois de cada resposta, quando passa de 3 min.
// Assim a resposta nunca espera a coleta; só sem foto nenhuma (ou muito velha) a primeira fala espera.
const AREAS = ["comercial", "producao", "financeiro", "marketing", "sistema"] as const
export type Foto = { em: string; norte: string; resultados: string; equipe: string; bloco: string; ferramentasTxt: string; cultura: string[]; exec: Ctx["exec"]; detalhes: Record<string, string>; decisoes?: Record<string, { texto: string; chave: string }[]>; versao?: string; producaoBase?: string }
let memFoto: { lidaEm: number; foto: Promise<Foto> } | null = null
let montando: Promise<Foto> | null = null
async function montarFoto(salvar: boolean): Promise<Foto> {
  const ctx = await coletarContexto()
  const rastreios = await lerRastreios()
  const digitais = await lerDigitais()
  const foto: Foto = { em: new Date().toISOString(), norte: ctx.norte, resultados: ctx.resultados, equipe: ctx.equipe, bloco: ctx.bloco, ferramentasTxt: ctx.ferramentasTxt,
    cultura: ctx.cultura, exec: ctx.exec, decisoes: ctx.decisoesTodas, versao: VERSAO_CODIGO, producaoBase: producaoBase(ctx, rastreios), detalhes: Object.fromEntries(AREAS.map(a => [a, detalhe(ctx, a, rastreios, digitais)])) }
  const { gravarFoto } = await import("./diretoriaServidor")
  if (salvar) await gravarFoto(foto).catch(() => null)
  return foto
}
export function renovarFoto(salvar = true): Promise<Foto> {
  montando ??= montarFoto(salvar).finally(() => { montando = null })
  const p = montando
  p.then(() => { memFoto = { lidaEm: Date.now(), foto: p } }, () => null)
  return p
}
const idade = (f: Foto) => Date.now() - Date.parse(f.em)
/** A foto guardada só vale se foi montada por esta versão do código (deploy novo refaz) e tem menos de 12 h. */
export const fotoValida = (f: Pick<Foto, "em" | "versao"> | null | undefined, versao = VERSAO_CODIGO, agora = Date.now()) =>
  !!f && f.versao === versao && agora - Date.parse(f.em) < 12 * 3600_000
export async function fotoRapida(salvar = true): Promise<Foto> {
  if (memFoto && Date.now() - memFoto.lidaEm < 60_000) return memFoto.foto
  const { lerFoto } = await import("./diretoriaServidor")
  const salva = await lerFoto<Foto>().catch(() => null)
  if (salva && fotoValida(salva)) { memFoto = { lidaEm: Date.now(), foto: Promise.resolve(salva) }; return salva }
  return renovarFoto(salvar)
}
// Chamado depois de responder (e ao abrir a conversa): se a foto passou de 3 min, monta outra para a próxima fala
export async function aquecerFoto() {
  const f = await fotoRapida().catch(() => null)
  if (!f || idade(f) > 180_000) await renovarFoto().catch(() => null)
}

// A área de cada diretor já vai detalhada no prompt (evita uma volta extra só para "detalhar" a própria área)
const MINHA_AREA: Record<IdDiretor, string> = { coo: "producao", cco: "comercial", cmo: "marketing", cfo: "financeiro", cto: "sistema" }

// simular: não grava nada (conversa, vaga, ferramenta, plano, lição); serve para testar com os dados reais
// voz: reunião por voz (resposta curta, falada). aoVivo: recebe o texto da resposta enquanto ela é escrita
export async function conversar(diretor: IdDiretor, textoFelipe: string, op: { simular?: boolean; historico?: MsgConversa[]; voz?: boolean; aoVivo?: (pedaco: string) => void } = {}): Promise<MsgConversa[]> {
  const grava = !op.simular
  const info = DIRETORES.find(d => d.id === diretor)!
  const [ctx, cfg] = await Promise.all([fotoRapida(grava), lerCampos<{ apiKey?: string }>(["apiKey"])])
  if (!cfg.apiKey) throw new Error("Sem chave da IA nas Configurações.")
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

Hoje: ${new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone: "America/Sao_Paulo" })}. Os números abaixo são de ${new Date(ctx.em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}${idade(ctx) > 30 * 60_000 ? " (foto de mais de meia hora atrás; se o Felipe perguntar de algo que pode ter mudado, avise o horário)" : ""}.

${ctx.norte}

# Sua área agora
${meu}

${ctx.equipe}

${ctx.ferramentasTxt}

${ctx.resultados}

# Detalhes da sua área (dados de agora)
${ctx.detalhes[MINHA_AREA[diretor]] ?? ""}

# As outras áreas (para contexto)
${blocos.filter(b => b !== meu).map(b => b.split("\n").slice(0, 3).join("\n")).join("\n\n")}`
  // Reunião por voz: fala de verdade, curta. Vem depois do trecho guardado em cache (o cache vale para os dois modos)
  const modo = op.voz
    ? `Agora vocês estão numa reunião por voz: sua resposta vai ser falada em voz alta. Responda como numa conversa: 1 a 3 frases curtas (até 60 palavras), sem listas, sem markdown, sem códigos longos (diga "o pedido do Raniere", não "ORC-2026-233"), números arredondados. Se o assunto pedir detalhe, dê o essencial e ofereça mandar o detalhe no chat. Faça uma pergunta de volta quando fizer sentido.`
    : "Conversa por escrito, no chat."

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
  const cli = clienteClaude(cfg.apiKey, "diretoria")
  const execIds = [...ctx.exec.map(f => f.id), ...comerciaisDoDiretor(diretor).map(f => f.id)]
  let textoFinal = ""
  for (let volta = 0; volta < 8; volta++) {
    // Streaming: o texto sai enquanto é escrito (a tela mostra e a voz começa na primeira frase). Esforço baixo na voz
    // (resposta curta de conversa) e médio no chat. O começo fixo do prompt (ferramentas + contexto) fica em cache.
    const fluxo = cli.beta.messages.stream({
      model: MODELO, max_tokens: op.voz ? 1500 : 3000, thinking: { type: "adaptive" }, output_config: { effort: op.voz ? "low" : "medium" },
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }, { type: "text", text: modo }],
      tools: ferramentas(execIds), messages: msgs,
    })
    let jaFalou = false
    if (op.aoVivo) fluxo.on("text", t => { if (!jaFalou && textoFinal) { op.aoVivo!("\n\n"); } jaFalou = true; op.aoVivo!(t) })
    const resp = await fluxo.finalMessage()
    await registrarUsoIA(resp.model, resp.usage as Parameters<typeof registrarUsoIA>[1], "diretoria").catch(() => null)
    const texto = resp.content.flatMap(c => c.type === "text" ? [c.text] : []).join("\n").trim()
    if (texto) textoFinal = textoFinal ? `${textoFinal}\n\n${texto}` : texto
    const usos = resp.content.filter((c): c is Anthropic.Beta.BetaToolUseBlock => c.type === "tool_use")
    if (resp.stop_reason !== "tool_use" || !usos.length) break
    msgs.push({ role: "assistant", content: resp.content })
    const resultados: Anthropic.Beta.BetaToolResultBlockParam[] = []
    for (const u of usos) {
      const r = await executarFerramenta(diretor, u.name, u.input as Record<string, unknown>, { ctx, apiKey: cfg.apiKey!, grava })
      if (r.acao) acoes.push(r.acao)
      const saida = r.saida
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
    const r = await enviarAoCliente(acao.cliente, acao.texto, acao.jid).catch(e => ({ ok: false as const, erro: String(e), status: 500 }))
    if (r.ok) { acao.status = "enviado"; acao.em = new Date().toISOString(); delete acao.erro }
    else { acao.status = "erro"; acao.erro = r.erro }
  }
  await gravarConversa(diretor, todas)
  return todas
}
