import { NextResponse } from "next/server"
import { cidades, lalamoveConfigurada, ambienteLalamove } from "@/app/lib/lalamove"
import { NOME_VEICULO } from "@/app/lib/frete"

// Veículos da Lalamove em São Paulo (a lista vem da API e muda com o tempo). (Rota protegida pelo login.)
export async function GET() {
  if (!lalamoveConfigurada()) return NextResponse.json({ configurada: false, ambiente: ambienteLalamove(), servicos: [] })
  const r = await cidades()
  if (!r.ok) return NextResponse.json({ configurada: true, ambiente: ambienteLalamove(), servicos: [], erro: r.erro })
  const lista = r.dados ?? []
  const sp = lista.find(c => /s[ãa]o paulo/i.test(c.name)) ?? lista[0]
  return NextResponse.json({
    configurada: true, ambiente: ambienteLalamove(), cidade: sp?.name ?? null,
    servicos: (sp?.services ?? []).map(s => ({ key: s.key, nome: NOME_VEICULO[s.key] ?? s.description ?? s.key, descricao: s.description ?? "", carga: s.load ? `${s.load.value} ${s.load.unit}` : "" })),
  })
}
