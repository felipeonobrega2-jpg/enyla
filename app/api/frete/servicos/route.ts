import { NextResponse } from "next/server"
import { cidades, lalamoveConfigurada, ambienteLalamove } from "@/app/lib/lalamove"
import { infoVeiculo, nomeAdicional } from "@/app/lib/frete"
import { supabase } from "@/app/lib/supabase"
import { gravarCampos } from "@/app/lib/configAtomica"

// Veículos da Lalamove em São Paulo, em português e organizados: entrega normal primeiro, aluguel por período depois.
// Cada um com capacidade, medidas e os adicionais (ajuda na carga etc.). A lista vem da API e muda com o tempo.
// (Rota protegida pelo login.)
export async function GET() {
  if (!lalamoveConfigurada()) return NextResponse.json({ configurada: false, ambiente: ambienteLalamove(), servicos: [] })
  const r = await cidades()
  if (!r.ok) return NextResponse.json({ configurada: true, ambiente: ambienteLalamove(), servicos: [], erro: r.erro })
  const lista = r.dados ?? []
  const sp = lista.find(c => /s[ãa]o paulo/i.test(c.name)) ?? lista[0]
  const m = (x?: { value: string; unit: string }) => x ? Number(x.value) : null
  const servicos = (sp?.services ?? []).map(s => {
    const info = infoVeiculo(s.key, s.description)
    const d = s.dimensions
    return {
      key: s.key, nome: info.nome, periodo: info.periodo, ordem: info.ordem,
      carga: s.load ? `até ${Number(s.load.value).toLocaleString("pt-BR")} ${s.load.unit}` : "",
      medidas: d?.length && d.width && d.height ? `${m(d.length)} × ${m(d.width)} × ${m(d.height)} ${d.length.unit}` : "",
      adicionais: (s.specialRequests ?? []).filter(x => !x.offline_time).map(x => ({ key: x.name, nome: nomeAdicional(x.name, x.description), grupo: x.parent_type ?? null, max: x.max_selection ?? 1 })),
    }
  }).sort((a, b) => a.ordem - b.ordem)
  // Guarda a lista crua (chaves reais da Lalamove) para ajustar os nomes quando aparecer algo novo
  const { data: cfgRow } = await supabase.from("AppConfig").select("data").eq("id", 1).single()
  const cfg = (cfgRow?.data ?? {}) as Record<string, unknown>
  await gravarCampos({ lalamoveServicos: { em: new Date().toISOString(), cidade: sp?.name, servicos: sp?.services ?? [] } })
  return NextResponse.json({ configurada: true, ambiente: ambienteLalamove(), cidade: sp?.name ?? null, servicos })
}
