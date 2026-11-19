// Captador de parceiros no servidor: monta os candidatos, põe na fila os que você aprovou e envia aos poucos
// (pelo vigia, a cada 5 min: no máximo 2 convites e 1 lembrete, seg a sex das 9h às 18h, dentro do limite do número).
import { supabase } from "./supabase"
import { mudarConfig } from "./configAtomica"
import { nomeParaChamar } from "./nomeDePessoa"
import { montarCandidatos, lerListaManual, textoConvite, linkConvite, precisaLembrete, TEMPLATE_PADRAO, TEMPLATE_LEMBRETE, type Convite, type Candidato } from "./captacao"
import type { FornecedorProducao } from "./producao"

type Cfg = Record<string, unknown> & { captacaoParceiros?: Convite[]; cadastrosParceiros?: { whatsapp: string }[]; producao?: { fornecedores?: FornecedorProducao[] }; agenteAuto?: { avisoNumero?: string } }
const lerCfg = async () => ((await supabase.from("AppConfig").select("data").eq("id", 1).single()).data?.data ?? {}) as Cfg
const novoId = () => `CV${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`

export async function listarCaptacao(): Promise<{ candidatos: Candidato[]; convites: Convite[] }> {
  const cfg = await lerCfg()
  const { data: conversas } = await supabase.from("whatsapp_conversas").select("jid, nome, ultima_msg, ultima_at").contains("etiquetas", ["Fornecedora"]).limit(800)
  const candidatos = montarCandidatos({
    conversas: (conversas ?? []) as never, fornecedores: cfg.producao?.fornecedores ?? [],
    nomesDaCasa: ((cfg as { fornecedores?: { nome: string; contato?: string }[] }).fornecedores ?? []).flatMap(f => [f.nome, f.contato ?? ""]),
    cadastrosWhatsapp: (cfg.cadastrosParceiros ?? []).map(c => c.whatsapp), convites: cfg.captacaoParceiros ?? [],
  })
  return { candidatos, convites: cfg.captacaoParceiros ?? [] }
}

// Você aprovou: entram na fila com o texto já personalizado (o vigia envia aos poucos)
export async function convidar(itens: { jid: string; nome: string | null; origem: Convite["origem"] }[], template?: string) {
  const tpl = (template ?? "").trim() || TEMPLATE_PADRAO
  const agora = new Date().toISOString()
  let n = 0
  await mudarConfig((d: Cfg) => {
    const ja = new Set((d.captacaoParceiros ?? []).map(c => c.jid))
    const novos: Convite[] = itens.filter(i => !ja.has(i.jid) && !i.jid.includes("@g.us")).slice(0, 200).map(i => {
      const id = novoId()
      return { id, jid: i.jid, nome: i.nome, origem: i.origem, status: "fila", criadoEm: agora, texto: textoConvite(tpl, nomeParaChamar(i.nome), linkConvite(id)) }
    })
    n = novos.length
    return { captacaoParceiros: [...novos, ...(d.captacaoParceiros ?? [])].slice(0, 2000) }
  })
  return n
}
export const convidarLista = (texto: string, template?: string) => convidar(lerListaManual(texto).map(x => ({ ...x, origem: "manual" as const })), template)

export async function mudarConvite(id: string, m: Partial<Convite>) {
  await mudarConfig((d: Cfg) => ({ captacaoParceiros: (d.captacaoParceiros ?? []).map(c => c.id === id ? { ...c, ...m } : c) }))
}

// Abriu o link do convite (página pública chama)
export async function conviteAberto(id: string) {
  await mudarConfig((d: Cfg) => {
    const c = (d.captacaoParceiros ?? []).find(x => x.id === id)
    if (!c || c.abriuEm) return null
    return { captacaoParceiros: (d.captacaoParceiros ?? []).map(x => x.id === id ? { ...x, abriuEm: new Date().toISOString(), status: x.status === "enviado" ? "abriu" as const : x.status } : x) }
  })
}
export async function conviteCadastrou(id: string, cadastroId: string) {
  await mudarConvite(id, { status: "cadastrou", cadastrouEm: new Date().toISOString(), cadastroId })
}

// O convidado respondeu no WhatsApp: a conversa é sua (o agente de vendas não atende) e você recebe o aviso
export async function talvezRespostaDeConvite(jid: string, texto: string | null): Promise<boolean> {
  const cfg = await lerCfg()
  const c = (cfg.captacaoParceiros ?? []).find(x => x.jid === jid && x.status !== "fila")
  if (!c) return false
  if (!c.respondeuEm) {
    const semInteresse = /n[aã]o (tenho )?interess|n[aã]o quero|n[aã]o trabalho|pode tirar|remove|para de/i.test(texto ?? "")
    await mudarConvite(c.id, { respondeuEm: new Date().toISOString(), ...(c.status === "enviado" || c.status === "abriu" ? { status: semInteresse ? "sem_interesse" : "respondeu" } : {}) })
    try {
      const { evo } = await import("./evolution")
      const { seuNumero } = await import("./agenteAuto")
      const destino = (cfg.agenteAuto?.avisoNumero ?? "").replace(/\D/g, "") || await seuNumero()
      if (destino) await evo("/message/sendText/{i}", { method: "POST", body: JSON.stringify({ number: destino, text: `🤝 *${c.nome ?? jid.split("@")[0]} respondeu o convite de parceiro*\n“${(texto ?? "").slice(0, 200)}”\n\nA conversa é sua (o agente não responde).` }) })
    } catch { /* o registro já foi feito */ }
  }
  return true
}

// Horário de convite: seg a sex, 9h às 18h (São Paulo)
function horarioDeConvite(agora = new Date()) {
  const sp = new Date(agora.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }))
  return sp.getDay() >= 1 && sp.getDay() <= 5 && sp.getHours() >= 9 && sp.getHours() < 18
}

// Vigia: até 2 convites e 1 lembrete por rodada, respeitando o limite de envios do número
export async function processarFilaCaptacao(): Promise<string> {
  if (!horarioDeConvite()) return "fora do horário"
  const cfg = await lerCfg()
  const lista = cfg.captacaoParceiros ?? []
  const fila = lista.filter(c => c.status === "fila").sort((a, b) => a.criadoEm.localeCompare(b.criadoEm)).slice(0, 2)
  const lembrar = lista.filter(c => precisaLembrete(c)).slice(0, 1)
  if (!fila.length && !lembrar.length) return "nada"
  const { enviar, lerConversa } = await import("./agenteAuto")
  const conversa = async (c: Convite) => (await lerConversa(c.jid).catch(() => null)) ?? { jid: c.jid, nome: c.nome, telefone: c.jid.endsWith("@s.whatsapp.net") ? c.jid.split("@")[0] : null, etiquetas: null, status_lead: null }
  let feitos = 0
  for (const c of fila) {
    const r = await enviar(await conversa(c), c.texto, undefined, { proativo: true })
    if (r.ids.length) { await mudarConvite(c.id, { status: "enviado", enviadoEm: new Date().toISOString() }); feitos++ }
    else if (/limite|fila/.test(r.erro ?? "")) break            // volta na próxima rodada
    else await mudarConvite(c.id, { status: "erro", erro: r.erro })
  }
  for (const c of lembrar) {
    // Respondeu fora do horário do agente (sem registro): não lembra, marca que respondeu
    const { data: resp } = await supabase.from("whatsapp_mensagens").select("id").eq("jid", c.jid).eq("from_me", false).gt("ts", c.enviadoEm!).limit(1)
    if (resp?.length) { await mudarConvite(c.id, { status: "respondeu", respondeuEm: new Date().toISOString() }); continue }
    const r = await enviar(await conversa(c), textoConvite(TEMPLATE_LEMBRETE, nomeParaChamar(c.nome), linkConvite(c.id)), undefined, { proativo: true })
    if (r.ids.length) { await mudarConvite(c.id, { lembreteEm: new Date().toISOString() }); feitos++ }
  }
  return `${feitos} enviado(s)`
}
