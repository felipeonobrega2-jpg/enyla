// Pede a medida aos bons negócios que só passaram o ml (um por rodada, a cada 10 min, no horário do agente)
import { supabase } from "./supabase"
import { mudarConfig } from "./configAtomica"
import { lerCfg, lerConversa, enviar, registrar, voceAtende, Conversa } from "./agenteAuto"
import { dentroDoHorario } from "./agenteLeads"
import { dadosDaConversa, etapaDaConversa } from "./hoje"
import { devePedirMedida, textoPedirMedida, MINUTOS_ENTRE_PEDIDOS, HORAS_ESPERA_MAX, ConvMedida } from "./pedirMedida"

type Cfg = Awaited<ReturnType<typeof lerCfg>> & { medidaPedida?: Record<string, string>; medidaPedidaEm?: string; vinculosWhatsapp?: Record<string, string> }

export async function talvezPedirMedida() {
  const cfg = await lerCfg() as Cfg
  if (!cfg.agenteAuto?.ligado || !dentroDoHorario(cfg.agenteAuto?.horario)) return
  if (cfg.medidaPedidaEm && Date.now() - new Date(cfg.medidaPedidaEm).getTime() < MINUTOS_ENTRE_PEDIDOS * 60_000) return
  const desde = new Date(Date.now() - HORAS_ESPERA_MAX * 3_600_000).toISOString()
  const { data } = await supabase.from("whatsapp_conversas")
    .select("jid, nome, status_lead, etiquetas, ultima_recebida_at, ultima_enviada_at, proxima_acao")
    .gte("ultima_recebida_at", desde).order("ultima_recebida_at", { ascending: true }).limit(400)
  const ja = cfg.medidaPedida ?? {}
  const vinculados = new Set(Object.entries(cfg.vinculosWhatsapp ?? {}).filter(([, v]) => v).map(([j]) => j))
  const cands = (data ?? []).map(x => ({ ...x, dados: dadosDaConversa(x.proxima_acao), etapa: etapaDaConversa(x.proxima_acao) }) as ConvMedida)
    .filter(c => devePedirMedida(c, ja, vinculados))
  for (const alvo of cands) {
    if (await voceAtende(alvo.jid, cfg)) continue                 // você está na conversa: é sua
    // Reserva a vez (duas rodadas ao mesmo tempo: só uma passa) e marca o contato (pede uma vez só)
    let minha = false
    await mudarConfig((d: Cfg) => {
      if (d.medidaPedida?.[alvo.jid] || (d.medidaPedidaEm && Date.now() - new Date(d.medidaPedidaEm).getTime() < MINUTOS_ENTRE_PEDIDOS * 60_000)) return null
      minha = true
      const lista = Object.fromEntries(Object.entries({ ...(d.medidaPedida ?? {}), [alvo.jid]: new Date().toISOString() }).slice(-500))
      return { medidaPedida: lista, medidaPedidaEm: new Date().toISOString() }
    })
    if (!minha) return
    const c = await lerConversa(alvo.jid) as Conversa | null
    if (!c) return
    const texto = textoPedirMedida(alvo.nome, alvo.dados!)
    const env = await enviar(c, texto)
    await registrar({ em: new Date().toISOString(), jid: alvo.jid, nome: alvo.nome, perfil: "medio", texto, enviou: env.ids.length > 0, ids: env.ids,
      motivo: env.ids.length ? "Bom negócio sem medida: pedi a altura e a largura (a proposta sai quando ele mandar)" : `Pedir medida: ${env.erro ?? "não enviou"}`, passo: "Pediu medida" })
    return
  }
}
