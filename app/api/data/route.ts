import { NextResponse } from "next/server"
import { prisma } from "@/app/lib/prisma"
import { defaultConfig } from "@/app/config"

export async function GET() {
  try {
    const [historicoRows, kanbanRows, clientesRows, propostasRows, configRow, contadores] =
      await Promise.all([
        prisma.historicoItem.findMany({ orderBy: { createdAt: "desc" } }),
        prisma.kanbanCard.findMany({ orderBy: { createdAt: "desc" } }),
        prisma.cliente.findMany({ orderBy: { nome: "asc" } }),
        prisma.propostaCustom.findMany({ orderBy: { createdAt: "desc" } }),
        prisma.appConfig.findFirst(),
        prisma.contador.findMany(),
      ])

    const historico = historicoRows.map((h) => ({
      form:    h.form,
      calculo: h.calculo,
      data:    h.data,
      numero:  h.numero ?? undefined,
    }))

    const kanban = kanbanRows.map((c) => ({
      id:            c.id,
      numero:        c.numero ?? "",
      nomeCliente:   c.nomeCliente,
      dimensoes:     c.dimensoes,
      materialNome:  c.materialNome,
      preco:         c.preco,
      quantidade:    c.quantidade,
      data:          c.data,
      coluna:        c.coluna,
      motivoPerdido: c.motivoPerdido ?? undefined,
      opcoes:        c.opcoes ?? undefined,
    }))

    const propostas = propostasRows.map((p) => ({
      id:            p.id,
      numero:        p.numero ?? "",
      nomeCliente:   p.nomeCliente,
      descricao:     p.descricao ?? "",
      material:      p.material ?? "",
      dimensoes:     p.dimensoes ?? "",
      incluirVerniz: p.incluirVerniz,
      comFaca:       p.comFaca,
      valorFaca:     p.valorFaca,
      numSKUs:       p.numSKUs,
      validadeDias:  p.validadeDias,
      obsCliente:    p.obsCliente ?? "",
      data:          p.data,
      linhas:        p.linhas,
      parcFator:     p.parcFator,
      cardId:        p.cardId ?? "",
    }))

    return NextResponse.json({
      historico,
      kanban,
      clientes:       clientesRows,
      propostasCustom: propostas,
      contador:       contadores.find((c) => c.chave === "orc")?.valor ?? 0,
      contadorProp:   contadores.find((c) => c.chave === "prop")?.valor ?? 0,
      config:         configRow?.data ?? defaultConfig,
    })
  } catch (e: unknown) {
    console.error(e)
    const msg = e instanceof Error ? e.message : String(e)
    const code = (e as { code?: string }).code
    return NextResponse.json({ error: "DB error", detail: msg, code }, { status: 500 })
  }
}
