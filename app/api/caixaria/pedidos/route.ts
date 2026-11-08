import { NextResponse } from "next/server"
import { pedidosSite } from "@/app/caixaria/lib/servidor"

// Caixaria · pedidos do site, últimos 90 dias (rota protegida pelo login)
export async function GET() {
  try {
    const pedidos = await pedidosSite(90)
    return NextResponse.json({ pedidos: pedidos.map(p => ({
      id: p.id, numero: p.numero, status: p.status, forma: p.forma, criadoEm: p.criado_em, total: Number(p.subtotal), pago: Number(p.valor_pago),
      cliente: p.cliente, cidade: p.entrega ? `${p.entrega.cidade}/${p.entrega.uf}` : "",
      itens: (p.itens ?? []).map(i => ({ nome: i.nome, medida: i.medida, qtd: i.qtd, acab: i.acab, prazo: i.prazo, marca: i.marca ?? null, freteIncluso: !!i.freteIncluso, total: p.forma === "cartao" && i.cartao ? i.cartao : i.total })),
      metodo: (p.mp_pagamentos ?? []).find(x => x.status === "approved")?.metodo ?? null,
    })) })
  } catch (e) {
    console.error("caixaria/pedidos", e)
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 })
  }
}
