// Mensagem fixa (sem IA) à gráfica do Prospector que responde pela primeira vez, enquanto o modo parceiro está desligado.
// Só para contatos de prospectos_parceiros que não são cliente (A/B/C/indefinido ficam de fora). Uma vez por contato (marca no
// histórico, gravada antes do envio e comparando atualizado_em), só dentro da janela 8h–20h, respeitando opt_out/descartado.
import { supabase } from "./supabase"
import { evo } from "./evolution"
import { celularWhatsapp, dentroDoHorario, URL_CADASTRO_PARCEIROS } from "./prospectorEnvio"
import { prospectoDoJid, type ProspectoDoJid } from "./prospectorTrava"
import { prospectoExcluido } from "./ordemProspecto"

export const MARCA_BOAS_VINDAS = "boas_vindas_fixa"

export const TEXTO_BOAS_VINDAS =
  `Olá! Que bom ter o seu retorno. Para fazer parte da rede de gráficas parceiras da ENYLA, o cadastro leva uns 5 minutos: ${URL_CADASTRO_PARCEIROS}\n\n` +
  `Os Termos de Parceria aparecem no próprio cadastro, para você ler e aceitar antes de concluir. O pagamento é 50% antes do serviço e 50% na retirada, por PIX.\n\n` +
  `Equipe ENYLA`

type Motivo = "enviado" | "nao_prospecto" | "excluido" | "ja_cadastrou" | "ja_enviada" | "fora_da_janela" | "nao_e_lead" | "sem_numero" | "perdeu_a_vez" | "falha_envio"

const temMarca = (h: unknown) => Array.isArray(h) && h.some(e => (e as { marca?: string })?.marca === MARCA_BOAS_VINDAS)

/** Chamada quando chega mensagem da conversa `jid`. Devolve por que enviou ou não (para teste e registro). */
export async function boasVindasParceiro(jid: string | null | undefined, agora: Date = new Date()): Promise<{ enviou: boolean; motivo: Motivo }> {
  const nao = (motivo: Motivo) => ({ enviou: false, motivo })
  const p = await prospectoDoJid(jid)
  if (!p || !jid) return nao("nao_prospecto")
  if (prospectoExcluido(p)) return nao("excluido")
  if (p.etapa === "cadastrou") return nao("ja_cadastrou")
  if (temMarca(p.historico_etapas)) return nao("ja_enviada")
  if (!dentroDoHorario(agora)) return nao("fora_da_janela")
  const { nivelDoDestinatario } = await import("./nivelCliente")
  if ((await nivelDoDestinatario(jid)).nivel !== "lead") return nao("nao_e_lead")
  const numero = celularWhatsapp(p.telefone) ?? (jid.endsWith("@s.whatsapp.net") || jid.endsWith("@lid") ? jid : null)
  if (!numero) return nao("sem_numero")

  // Marca ANTES de enviar: só um dos disparos simultâneos ganha (update condicionado ao atualizado_em lido).
  const em = new Date().toISOString()
  const hist = Array.isArray(p.historico_etapas) ? p.historico_etapas : []
  const { data } = await supabase.from("prospectos_parceiros")
    .update({ historico_etapas: [...hist, { etapa: p.etapa, em, marca: MARCA_BOAS_VINDAS, motivo: "mensagem fixa de boas-vindas (cadastro e termos)" }], atualizado_em: em })
    .eq("id", p.id).eq("atualizado_em", p.atualizado_em).select("id")
  if (!Array.isArray(data) || !data.length) return nao("perdeu_a_vez")

  const r = await evo<{ key?: { id?: string } }>("/message/sendText/{i}", { method: "POST", body: JSON.stringify({ number: numero, text: TEXTO_BOAS_VINDAS }) })
  if (!r.ok) return nao("falha_envio")
  await registrarEnvio(p.id, em)
  return { enviou: true, motivo: "enviado" }
}

async function registrarEnvio(id: number, em: string) {
  for (let i = 0; i < 3; i++) {
    const { data: l } = await supabase.from("prospectos_parceiros").select("id, etapa, historico_etapas, atualizado_em").eq("id", id).maybeSingle()
    if (!l) return
    const atual = l as Pick<ProspectoDoJid, "etapa" | "historico_etapas" | "atualizado_em"> & { id: number }
    const hist = Array.isArray(atual.historico_etapas) ? atual.historico_etapas : []
    const novo = new Date().toISOString()
    const { data } = await supabase.from("prospectos_parceiros")
      .update({ historico_etapas: [...hist, { etapa: atual.etapa, em: novo, motivo: "boas-vindas fixa enviada", mensagem: { direcao: "enviada", canal: "whatsapp", por: "boas_vindas_fixa", texto: TEXTO_BOAS_VINDAS, em } }], atualizado_em: novo })
      .eq("id", id).eq("atualizado_em", atual.atualizado_em).select("id")
    if (Array.isArray(data) && data.length) return
  }
}
