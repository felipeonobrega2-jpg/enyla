import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"
import { mudarConfig } from "@/app/lib/configAtomica"
import { aberturaA, medirAbertura } from "@/app/lib/aberturaABServidor"
import { ABERTURA_B_PADRAO, MINIMO_POR_VARIANTE, MedicaoAbertura, TesteAbertura, Variante } from "@/app/lib/aberturaAB"

// Teste A/B da primeira mensagem (Configurações → Agentes). (Rota protegida pelo login.)
//   GET                                   → { a, teste, medida, minimo }
//   POST { ligado }                       → liga/desliga (desligado: todo lead recebe a A)
//   POST { b }                            → troca o texto da B e recomeça o teste
//   POST { ficar: "A" | "B" }             → encerra agora com essa
//   POST { novo: true }                   → recomeça (depois de decidido), com a B atual
//   POST { medir: true }                  → mede agora
type Cfg = { aberturaTeste?: TesteAbertura; aberturaMedida?: MedicaoAbertura; filtroLeads?: string; agenteAuto?: { pequenoParceiro?: boolean } }

async function ler() {
  const { data } = await supabase.from("AppConfig").select("data").eq("id", 1).single()
  return (data?.data ?? {}) as Cfg
}
const resposta = (cfg: Cfg) => NextResponse.json({ a: aberturaA(cfg), teste: cfg.aberturaTeste ?? null, medida: cfg.aberturaMedida ?? null, minimo: MINIMO_POR_VARIANTE })

export async function GET() {
  return resposta(await ler())
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({})) as { ligado?: boolean; b?: string; ficar?: Variante; novo?: boolean; medir?: boolean }
  const agora = new Date().toISOString()
  const base = (t?: TesteAbertura): TesteAbertura => t ?? { ligado: true, b: ABERTURA_B_PADRAO, inicio: agora }
  if (b.medir) {
    const cfg = await ler()
    const m = await medirAbertura(cfg)
    if (m) await mudarConfig(() => ({ aberturaMedida: m }))
  } else if (typeof b.b === "string") {
    const texto = b.b.trim().slice(0, 500)
    if (texto.length < 10) return NextResponse.json({ erro: "Texto muito curto." }, { status: 400 })
    await mudarConfig(() => ({ aberturaTeste: { ligado: true, b: texto, inicio: agora }, aberturaMedida: undefined }))
  } else if (b.ficar === "A" || b.ficar === "B") {
    await mudarConfig((d: Cfg) => ({ aberturaTeste: { ...base(d.aberturaTeste), vencedora: b.ficar, decididoEm: agora, motivo: `Você escolheu a ${b.ficar}.` } }))
  } else if (b.novo) {
    await mudarConfig((d: Cfg) => ({ aberturaTeste: { ligado: true, b: base(d.aberturaTeste).b, inicio: agora }, aberturaMedida: undefined }))
  } else if (typeof b.ligado === "boolean") {
    await mudarConfig((d: Cfg) => ({ aberturaTeste: { ...base(d.aberturaTeste), ligado: b.ligado! } }))
  } else return NextResponse.json({ erro: "nada para fazer" }, { status: 400 })
  return resposta(await ler())
}
