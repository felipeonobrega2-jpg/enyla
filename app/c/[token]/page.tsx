import type { Metadata } from "next"
import { carregarPortal } from "@/app/lib/portalCliente"
import PortalClient from "./PortalClient"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Seus pedidos — Enyla", robots: { index: false, follow: false } }

export default async function PaginaCliente({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const portal = await carregarPortal(token)
  // Só o que o cliente precisa ver (sem custos, despesas ou anotações internas)
  const dados = portal && {
    nome: portal.nome,
    pedidos: portal.pedidos.map(p => ({
      key: p.key, numero: p.numero, coluna: p.coluna, dataFechamento: p.dataFechamento ?? null,
      dataEntregaPrevista: p.dataEntregaPrevista ?? null, dataEntregaReal: p.dataEntregaReal ?? null,
      venda: p.venda, recebido: p.venda - p.aReceber, aReceber: p.aReceber, quantidade: p.quantidade,
      itens: p.cards.map(c => ({ numero: c.numero, dimensoes: c.dimensoes, material: c.materialNome, quantidade: c.quantidade })),
      etapas: p.etapas.filter(e => !e.tipo || e.tipo === "coluna" || e.tipo === "aprovacao").map(e => ({ coluna: e.coluna, dataHora: e.dataHora, tipo: e.tipo ?? "coluna" })),
      arquivos: p.arquivos.filter(a => ["arte", "mockup", "foto"].includes(a.tipo as string)).map(a => ({ id: a.id, nome: a.nome, url: a.url, tipo: a.tipo as string, quando: a.created_at })),
    })),
  }
  return <PortalClient dados={dados} token={token} />
}
