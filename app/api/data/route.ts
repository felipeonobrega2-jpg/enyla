import { NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"
import { defaultConfig } from "@/app/config"

export async function GET() {
  try {
    const [historico, kanban, clientes, propostas, config, contadores, parceiros, negocios] = await Promise.all([
      supabase.from("HistoricoItem").select("*").order("createdAt", { ascending: false }),
      supabase.from("KanbanCard").select("*").order("createdAt", { ascending: false }),
      supabase.from("Cliente").select("*").order("nome"),
      supabase.from("PropostaCustom").select("*").order("createdAt", { ascending: false }),
      supabase.from("AppConfig").select("data").eq("id", 1).single(),
      supabase.from("Contador").select("*"),
      supabase.from("Parceiro").select("*").order("nome"),
      supabase.from("NegocioParceiro").select("*").order("criadoEm", { ascending: false }),
    ])

    return NextResponse.json({
      historico:       historico.data ?? [],
      kanban:          kanban.data ?? [],
      clientes:        clientes.data ?? [],
      propostasCustom: propostas.data ?? [],
      contador:        (contadores.data ?? []).find((c: { chave: string; valor: number }) => c.chave === "orc")?.valor ?? 0,
      contadorProp:    (contadores.data ?? []).find((c: { chave: string; valor: number }) => c.chave === "prop")?.valor ?? 0,
      config:          config.data?.data ?? defaultConfig,
      parceiros:       parceiros.data ?? [],
      negocios:        negocios.data ?? [],
    })
  } catch (e: unknown) {
    console.error(e)
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: "DB error", detail: msg }, { status: 500 })
  }
}
