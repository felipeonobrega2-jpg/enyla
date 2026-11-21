import { lerConfigLinha } from "../../lib/configAtomica"
import { NextRequest, NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { supabase } from "@/app/lib/supabase"
import { mudarConfig } from "@/app/lib/configAtomica"
import { dadosDaConversa } from "@/app/lib/hoje"
import { sugestoesGrandes, ordenarGrandes, GrandeNegocio, EtapaGrande, ETAPAS_GRANDE } from "@/app/lib/grandesNegocios"

// Grandes negócios (rota protegida pelo login): lista + sugestões (GET) e edição (POST)
type Cfg = { grandesNegocios?: GrandeNegocio[]; grandesDispensados?: string[] }
const ler = async () => ((await lerConfigLinha()).data?.data ?? {}) as Cfg

export async function GET() {
  const cfg = await ler()
  const grandes = cfg.grandesNegocios ?? []
  const desde = new Date(Date.now() - 45 * 86_400_000).toISOString()
  const [{ data: cv }, { data: cards }] = await Promise.all([
    supabase.from("whatsapp_conversas").select("jid, nome, etiquetas, proxima_acao, kanban_card_id").not("jid", "like", "%@g.us").gte("ultima_at", desde).or("etiquetas.cs.{ICP},etiquetas.cs.{Oportunidade}").limit(400),
    supabase.from("KanbanCard").select("id, numero, nomeCliente, preco, quantidade, coluna").in("coluna", [0, 11]).gte("createdAt", desde),
  ])
  const jidDoCard = new Map((cv ?? []).filter(c => c.kanban_card_id).map(c => [c.kanban_card_id as string, c.jid as string]))
  const sugestoes = sugestoesGrandes({
    grandes, dispensadas: cfg.grandesDispensados,
    conversas: (cv ?? []).map(c => { const d = dadosDaConversa(c.proxima_acao); return { jid: c.jid, nome: c.nome, etiquetas: c.etiquetas, quantidade: d?.quantidade ?? null, produto: d?.produto ?? null } }),
    propostas: (cards ?? []).map(k => ({ numero: k.numero, nomeCliente: k.nomeCliente, preco: Number(k.preco) || 0, quantidade: k.quantidade, jid: jidDoCard.get(k.id) ?? null })),
  })
  return NextResponse.json({ grandes: ordenarGrandes(grandes), sugestoes })
}

const corta = (s: unknown, n: number) => String(s ?? "").trim().slice(0, n)
const num = (v: unknown) => { const n = Number(String(v ?? "").replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3})/g, "").replace(",", ".")); return isFinite(n) && n > 0 ? n : null }

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({})) as Record<string, unknown> & { acao?: string; id?: string }
  const agora = new Date().toISOString()
  let resultado: GrandeNegocio | null = null
  if (b.acao === "dispensar") {
    await mudarConfig((d: Cfg) => ({ grandesDispensados: [...new Set([...(d.grandesDispensados ?? []), corta(b.chave, 80)])].slice(-300) }))
    return NextResponse.json({ ok: true })
  }
  await mudarConfig((d: Cfg) => {
    const lista = [...(d.grandesNegocios ?? [])]
    const i = b.id ? lista.findIndex(g => g.id === b.id) : -1
    if (b.acao === "apagar") return i >= 0 ? { grandesNegocios: lista.filter(g => g.id !== b.id) } : null
    const atual: GrandeNegocio = i >= 0 ? lista[i] : { id: randomUUID(), nome: "", etapa: "contato", notas: [], criadoEm: agora, atualizadoEm: agora }
    const etapa = (ETAPAS_GRANDE.some(e => e.id === b.etapa) ? b.etapa : atual.etapa) as EtapaGrande
    const nota = corta(b.nota, 1000)
    const novo: GrandeNegocio = {
      ...atual,
      ...(b.nome !== undefined ? { nome: corta(b.nome, 80) } : {}),
      ...(b.empresa !== undefined ? { empresa: corta(b.empresa, 80) || undefined } : {}),
      ...(b.telefone !== undefined ? { telefone: corta(b.telefone, 30) || undefined } : {}),
      ...(b.produto !== undefined ? { produto: corta(b.produto, 120) || undefined } : {}),
      ...(b.volume !== undefined ? { volume: num(b.volume) } : {}),
      ...(b.valor !== undefined ? { valor: num(b.valor) } : {}),
      ...(b.proximoPasso !== undefined ? { proximoPasso: corta(b.proximoPasso, 200) || undefined } : {}),
      ...(b.proximoEm !== undefined ? { proximoEm: /^\d{4}-\d{2}-\d{2}$/.test(String(b.proximoEm)) ? String(b.proximoEm) : null } : {}),
      ...(b.jid !== undefined ? { jid: corta(b.jid, 80) || null } : {}),
      ...(b.origem !== undefined ? { origem: b.origem as GrandeNegocio["origem"] } : {}),
      ...(Array.isArray(b.numeros) ? { numeros: (b.numeros as unknown[]).map(x => corta(x, 20)).filter(Boolean) } : {}),
      etapa, atualizadoEm: agora,
      ...(etapa === "fechado" && atual.etapa !== "fechado" ? { fechadoEm: agora } : {}),
      notas: nota ? [{ em: agora, texto: nota }, ...atual.notas].slice(0, 50) : atual.notas,
    }
    if (!novo.nome) return null
    resultado = novo
    if (i >= 0) lista[i] = novo; else lista.unshift(novo)
    return { grandesNegocios: lista }
  })
  if (!resultado) return NextResponse.json({ erro: "Informe ao menos o nome." }, { status: 400 })
  return NextResponse.json({ ok: true, grande: resultado })
}
