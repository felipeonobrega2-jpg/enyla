// Despachante dos e-mails para o cliente (rodado pelo vigia, a cada 5 min): olha o que aconteceu nos pedidos e manda
// cada e-mail uma vez só (trava por evento na tabela agente_tratadas). Só eventos a partir do lançamento (20/11/2026),
// para não disparar e-mail de pedido antigo. No máximo POR_RODADA envios por vez.
import { supabase } from "./supabase"
import { enviarEmail, emailConfigurado } from "./email"
import { reservarTratada, liberarTratada } from "./registroAgente"
import { emailPedidoAprovado, emailSinalRecebido, emailArteParaAprovar, emailArteAprovada, emailMaterialPronto, emailPedidoEnviado } from "./emailsCliente"
import type { Email } from "./emailsEnyla"

const DESDE = "2026-11-20T12:00:00.000Z"
const POR_RODADA = 8
const SITE = "https://app.enyla.com.br"
const recente = (iso?: string | null) => !!iso && iso >= DESDE && Date.now() - new Date(iso).getTime() < 7 * 86_400_000

type Ped = { id: string; nome: string | null; email?: string; quantidade: number; total: number; sinal: number; status: string; statusEm?: string
  sinalPagoEm?: string; arteEnviadaEm?: string; arteAprovadaEm?: string; artes?: { url: string }[]; restante?: number; teste?: boolean
  prontoEm?: string; restantePagoEm?: string; frete?: number; entrega?: unknown }
type Aprov = { numero: string; cardId: string; nomeCliente: string; aprovadoPor: string; quantidade: number; preco: number; sinal: number; em: string; email?: string }
type Cfg = { pedidosDigitais?: Ped[]; aprovacoesOnline?: Aprov[] }
type Envio = { chave: string; para: string; email: Email }

export async function talvezEmailsDoCliente(cfg: Cfg): Promise<{ enviados: number; erros: string[] } | string> {
  if (!emailConfigurado()) return "sem chave da Resend"
  const fila: Envio[] = []
  const { linkPedido } = await import("./digitalLink")
  const { prazoDigital } = await import("./prazoDigital")
  const whatsapp = await import("./agenteAuto").then(m => m.seuNumero()).catch(() => null)

  // Digital
  for (const p of cfg.pedidosDigitais ?? []) {
    if (p.teste || !p.email || p.status === "cancelado") continue
    const link = linkPedido(p.id)
    const arteUrl = (p.artes ?? []).at(-1)?.url ?? null
    const prazo = prazoDigital(p.quantidade).texto
    if (recente(p.sinalPagoEm)) fila.push({ chave: `email:sinal:${p.id}`, para: p.email, email: emailSinalRecebido({ nome: p.nome, id: p.id, quantidade: p.quantidade, total: p.total, sinal: p.sinal, em: p.sinalPagoEm!, link, prazo, whatsapp }) })
    const versao = Math.max(1, (p.artes ?? []).length)
    if (recente(p.arteEnviadaEm) && !p.arteAprovadaEm) fila.push({ chave: `email:arte:${p.id}:${p.arteEnviadaEm}`, para: p.email, email: emailArteParaAprovar({ nome: p.nome, id: p.id, versao, link, arteUrl, whatsapp }) })
    if (recente(p.arteAprovadaEm)) fila.push({ chave: `email:arteok:${p.id}`, para: p.email, email: emailArteAprovada({ nome: p.nome, id: p.id, em: p.arteAprovadaEm!, versao, link, arteUrl, prazo, whatsapp }) })
    if (recente(p.prontoEm) && !p.restantePagoEm && p.restante) fila.push({ chave: `email:pronto:${p.id}`, para: p.email, email: emailMaterialPronto({ nome: p.nome, id: p.id, quantidade: p.quantidade, restante: p.restante, frete: p.frete ?? null, link, temEndereco: !!p.entrega, whatsapp }) })
    if (p.status === "enviado" && recente(p.statusEm)) fila.push({ chave: `email:enviado:${p.id}`, para: p.email, email: emailPedidoEnviado({ nome: p.nome, numero: p.id, quantidade: p.quantidade, link, digital: true, whatsapp }) })
  }

  // Offset: aprovado na página
  const aprovs = (cfg.aprovacoesOnline ?? []).filter(a => a.email && recente(a.em))
  if (aprovs.length) {
    const { data: cards } = await supabase.from("KanbanCard").select("id, dimensoes, materialNome, dataEntregaPrevista").in("id", aprovs.map(a => a.cardId))
    for (const a of aprovs) {
      const c = (cards ?? []).find(x => x.id === a.cardId)
      const prazo = c?.dataEntregaPrevista ? `entrega prevista em ${String(c.dataEntregaPrevista).split("-").reverse().join("/")}` : null
      fila.push({ chave: `email:aprovado:${a.numero}`, para: a.email!, email: emailPedidoAprovado({
        nome: a.aprovadoPor || a.nomeCliente, numero: a.numero, quantidade: a.quantidade, preco: a.preco, sinal: a.sinal, aprovadoPor: a.aprovadoPor, em: a.em,
        descricao: c ? [c.dimensoes && c.dimensoes !== "0×0×0" ? `${c.dimensoes} cm` : null, c.materialNome].filter(Boolean).join(" · ") || null : null, prazo,
        linkPix: `${SITE}/pix/${encodeURIComponent(a.numero)}?v=${a.sinal.toFixed(2)}&c=${encodeURIComponent(a.nomeCliente)}`,
        linkRastreio: `${SITE}/track/${encodeURIComponent(a.numero)}`, whatsapp,
      }) })
    }
  }

  // Offset: chegou na Expedição (saiu para entrega), pelo rastreio
  const { data: exp } = await supabase.from("KanbanCard").select("id, numero, nomeCliente, quantidade").eq("coluna", 8).limit(50)
  if (exp?.length) {
    const { data: trks } = await supabase.from("Tracking").select("numero, etapas").in("numero", exp.map(c => c.numero))
    const nomes = [...new Set(exp.map(c => c.nomeCliente))]
    const { data: clientes } = await supabase.from("Cliente").select("nome, email").in("nome", nomes).not("email", "is", null)
    for (const c of exp) {
      const email = (cfg.aprovacoesOnline ?? []).find(a => a.numero === c.numero && a.email)?.email ?? (clientes ?? []).find(x => x.nome === c.nomeCliente)?.email
      if (!email) continue
      const etapa = ((trks ?? []).find(t => t.numero === c.numero)?.etapas as { coluna: number; dataHora: string }[] | undefined ?? []).filter(e => e.coluna === 8).pop()
      const iso = etapa ? paraIso(etapa.dataHora) : null
      if (!recente(iso)) continue
      fila.push({ chave: `email:expedicao:${c.numero}`, para: email, email: emailPedidoEnviado({ nome: c.nomeCliente, numero: c.numero, quantidade: c.quantidade, link: `${SITE}/track/${encodeURIComponent(c.numero)}`, whatsapp }) })
    }
  }

  let enviados = 0
  const erros: string[] = []
  for (const e of fila) {
    if (enviados >= POR_RODADA) break
    const minha = await reservarTratada(e.chave)
    if (minha === false) continue           // já mandado
    if (minha === null) { erros.push("sem a tabela de travas"); break }
    const r = await enviarEmail(e.para, e.email)
    if (r.ok) enviados++
    else { erros.push(`${e.chave}: ${r.erro}`); await liberarTratada(e.chave).catch(() => null) }   // tenta de novo na próxima rodada
  }
  return { enviados, erros }
}

// "20/11/2026, 14:05:33" (horário de Brasília) → ISO
export function paraIso(dataHora: string): string | null {
  const m = dataHora.match(/^(\d{2})\/(\d{2})\/(\d{4}),?\s+(\d{2}):(\d{2})(?::(\d{2}))?/)
  if (!m) return null
  return new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6] ?? "00"}-03:00`).toISOString()
}
