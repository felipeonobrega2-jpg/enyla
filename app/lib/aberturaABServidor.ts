// Teste A/B da abertura no servidor: liga sozinho na primeira vez, mede (no máximo a cada 6 h, no webhook) e,
// quando dá, fica com a melhor e avisa no seu WhatsApp.
import { supabase } from "./supabase"
import { mudarConfig, gravarCampos } from "./configAtomica"
import { filtroDoAgente, saudacaoDoFiltro, ehMensagemAutomaticaDoWhatsapp } from "./agenteLeads"
import { qualidadeDoLead } from "./marketing"
import { evo } from "./evolution"
import { seuNumero } from "./agenteAuto"
import { ABERTURA_B_PADRAO, decidir, qualVariante, respostaDoLead, vazio, MedicaoAbertura, TesteAbertura } from "./aberturaAB"

type Cfg = { aberturaTeste?: TesteAbertura; aberturaMedida?: MedicaoAbertura; filtroLeads?: string; agenteAuto?: { pequenoParceiro?: boolean; avisoNumero?: string } }
const HORAS_MEDIR = 6

async function lerCfg(): Promise<Cfg> {
  const { data } = await supabase.from("AppConfig").select("data").eq("id", 1).single()
  return (data?.data ?? {}) as Cfg
}

export const aberturaA = (cfg: Cfg) => saudacaoDoFiltro(filtroDoAgente(cfg)) ?? ""

// Mede desde o início do teste: leads novos (primeira mensagem dele depois do início, sem conversa antes),
// qual abertura receberam e o que fizeram nas 24 h seguintes. Abertura que não é nenhuma das duas não conta.
export async function medirAbertura(cfg: Cfg): Promise<MedicaoAbertura | null> {
  const t = cfg.aberturaTeste
  if (!t) return null
  const a = aberturaA(cfg)
  const { data: convs } = await supabase.from("whatsapp_conversas").select("jid, status_lead, etiquetas")
    .gte("ultima_at", t.inicio).not("jid", "like", "%@g.us").limit(3000)
  const m: MedicaoAbertura = { em: new Date().toISOString(), A: vazio(), B: vazio() }
  const lista = convs ?? []
  for (let i = 0; i < lista.length; i += 15) {
    await Promise.all(lista.slice(i, i + 15).map(async c => {
      const { data: ms } = await supabase.from("whatsapp_mensagens").select("from_me, corpo, tipo, ts").eq("jid", c.jid).order("ts").limit(40)
      const L = (ms ?? []).filter(x => !(x.from_me && ehMensagemAutomaticaDoWhatsapp(x.corpo, x.tipo)))
      const p = L.findIndex(x => !x.from_me)
      if (p < 0 || L.slice(0, p).some(x => x.from_me) || L[p].ts < t.inicio) return
      const o = L.findIndex((x, k) => k > p && x.from_me)
      if (o < 0) return
      const v = qualVariante(L[o].corpo, a, t.b)
      if (!v) return
      const t0 = new Date(L[o].ts).getTime()
      if (Date.now() - t0 < 24 * 3_600_000) return                // ainda dentro das 24 h: conta quando fechar
      const depois = L.filter(x => !x.from_me && new Date(x.ts).getTime() > t0 && new Date(x.ts).getTime() - t0 < 24 * 3_600_000)
      const r = respostaDoLead(depois)
      const s = m[v]
      s.leads++
      if (r.respondeu) s.responderam++
      if (r.volume) s.volume++
      if (qualidadeDoLead(c) === "mql") s.mql++
    }))
  }
  return m
}

// Chamado no webhook: liga o teste na primeira vez; mede a cada 6 h; decide e avisa
export async function talvezTesteAbertura() {
  const cfg = await lerCfg()
  if (!cfg.aberturaTeste) {
    await mudarConfig((d: Cfg) => (d.aberturaTeste ? null : { aberturaTeste: { ligado: true, b: ABERTURA_B_PADRAO, inicio: new Date().toISOString() } }))
    return
  }
  const t = cfg.aberturaTeste
  if (!t.ligado || t.vencedora) return
  if (cfg.aberturaMedida && Date.now() - new Date(cfg.aberturaMedida.em).getTime() < HORAS_MEDIR * 3_600_000) return
  await gravarCampos({ aberturaMedida: { ...(cfg.aberturaMedida ?? { A: vazio(), B: vazio() }), em: new Date().toISOString() } })   // trava antes de medir
  const m = await medirAbertura(cfg)
  if (!m) return
  const d = decidir(m)
  let decidiu = false
  await mudarConfig((x: Cfg) => {
    const atual = x.aberturaTeste
    if (!atual || atual.inicio !== t.inicio || atual.b !== t.b) return { aberturaMedida: m }   // mudou o teste enquanto media
    if (!d || atual.vencedora) return { aberturaMedida: m }
    decidiu = true
    return { aberturaMedida: m, aberturaTeste: { ...atual, vencedora: d.vencedora, decididoEm: new Date().toISOString(), motivo: d.motivo } }
  })
  if (decidiu && d) {
    const destino = (cfg.agenteAuto?.avisoNumero ?? "").replace(/\D/g, "") || await seuNumero()
    if (destino) await evo("/message/sendText/{i}", { method: "POST", body: JSON.stringify({ number: destino,
      text: `🧪 *Teste da primeira mensagem terminou*\n${d.motivo}\nDaqui pra frente todo lead novo recebe a ${d.vencedora}. Dá para começar outro teste em Configurações → Agentes.` }) }).catch(() => null)
  }
}
