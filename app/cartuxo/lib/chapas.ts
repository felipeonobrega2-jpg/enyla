// Painel de chapas da Cartuxo: montagem das chapas compartilhadas (gang run).
//
// Regras (Felipe, 08/11/2026):
// - Faca pronta: cada chapa é de um modelo de caixa só (mesma faca) e de um acabamento só (laminação fosca ou brilho).
// - Cada lugar da chapa rende 1.000 caixas (rodada de 1.000 folhas). Um pedido de 3.000 un ocupa 3 lugares.
// - Produção normal: o cliente recebe em até 30 dias úteis depois de aprovar a arte; a produção leva 15 d.u.,
//   então a chapa precisa fechar até 15 d.u. depois da primeira arte aprovada dentro dela.
// - Sem produção expressa (saiu em 09/11/2026): toda chapa é compartilhada.
// - Lugar vago pode ser preenchido com trabalho da ENYLA ou com estoque de caixas similares.
// - O cliente nunca vê nada disso: no site só aparecem preço e prazo.

import { somarDiasUteis, diasUteisEntre } from "@/app/lib/diasUteis"

export const PRODUCAO_DU = 15          // dias úteis de produção na gráfica
export const PROMESSA_NORMAL_DU = 30   // prazo máximo prometido na produção normal
export const FOLGA_NORMAL_DU = PROMESSA_NORMAL_DU - PRODUCAO_DU

export type StatusChapa = "aberta" | "producao" | "pronta"
export type TipoLugar = "cliente" | "enyla" | "estoque"

export type Ocupacao = {
  id: string
  tipo: TipoLugar
  lugares: number
  descricao: string
  // cliente
  pedido?: string          // número CX-...
  pedidoId?: string
  itemIdx?: number
  parte?: number           // pedido maior que uma chapa: 0, 1, 2...
  cliente?: string
  telefone?: string
  marca?: string
  receita?: number         // valor pago por este item (sem frete à parte)
  frete?: number           // frete embutido (ofertas do Google), sai da receita
  arte?: number            // custo da arte deste pedido
  pagoEm?: string
  arteAprovadaEm?: string | null
}

export type Chapa = {
  id: string
  numero: number
  modelo: string           // slug da caixa (faca)
  modeloNome: string
  acabamento: string       // "laminacao-fosca" | "laminacao-brilho"
  expressa: boolean       // sempre false (a coluna fica no banco por compatibilidade)
  lugares: number          // caixas desse modelo por chapa
  formato: string
  rodada: number           // custo fixo da chapa inteira
  colagemPorMil: number
  ocupacao: Ocupacao[]
  status: StatusChapa
  criadaEm: string
  fechadaEm?: string | null
  prontaEm?: string | null
}

// Item pago vindo do site (cartuxo_pedidos.itens[n])
export type ItemPago = {
  pedidoId: string; pedido: string; itemIdx: number; pagoEm: string
  cliente: string; telefone: string
  slug: string; nome: string; qtd: number; marca?: string; total: number; cartao?: number; forma: string
  chapa?: { prazoId: string; acabId: string; porChapa: number; formato: string; rodada: number; colagemPorMil: number; arte: number; frete: number }
}

export const ROTULO_ACAB: Record<string, string> = { "laminacao-fosca": "Laminação fosca", "laminacao-brilho": "Laminação brilho" }
export const ROTULO_STATUS: Record<StatusChapa, string> = { aberta: "Montando", producao: "Em produção", pronta: "Pronta" }

const id = () => crypto.randomUUID()
export const ocupados = (c: Chapa) => c.ocupacao.reduce((s, o) => s + o.lugares, 0)
export const vagos = (c: Chapa) => Math.max(0, c.lugares - ocupados(c))
const chaveItem = (pedidoId: string, itemIdx: number) => `${pedidoId}#${itemIdx}`

// Coloca nas chapas os itens pagos que ainda não estão em nenhuma. Devolve as chapas novas/alteradas.
export function alocar(chapas: Chapa[], itens: ItemPago[], agora = new Date().toISOString()): { chapas: Chapa[]; novos: number } {
  const ja = new Set(chapas.flatMap(c => c.ocupacao.filter(o => o.pedidoId).map(o => chaveItem(o.pedidoId!, o.itemIdx!))))
  let numero = chapas.reduce((m, c) => Math.max(m, c.numero), 0)
  const lista = chapas.map(c => ({ ...c, ocupacao: [...c.ocupacao] }))
  let novos = 0

  for (const it of [...itens].sort((a, b) => a.pagoEm.localeCompare(b.pagoEm))) {
    if (ja.has(chaveItem(it.pedidoId, it.itemIdx)) || !it.chapa) continue
    const ch = it.chapa
    // Receita do item: no cartão o cliente pagou o valor do cartão
    const receitaTotal = it.forma === "cartao" && it.cartao ? it.cartao : it.total
    let falta = Math.max(1, Math.round(it.qtd / 1000))
    const totalLugares = falta
    let primeiro = true
    let parteIdx = 0

    while (falta > 0) {
      // Mesmo pedido fica numa chapa só (duas impressões da mesma arte podem sair com tom diferente).
      // Só divide quando o pedido é maior que uma chapa inteira.
      let alvo: Chapa | undefined = lista.find(c => c.status === "aberta" && !c.expressa && c.modelo === it.slug && c.acabamento === ch.acabId
        && vagos(c) >= Math.min(falta, c.lugares))
      if (!alvo) {
        alvo = {
          id: id(), numero: ++numero, modelo: it.slug, modeloNome: it.nome, acabamento: ch.acabId, expressa: false,
          lugares: ch.porChapa, formato: ch.formato, rodada: ch.rodada, colagemPorMil: ch.colagemPorMil,
          ocupacao: [], status: "aberta", criadaEm: agora,
        }
        lista.push(alvo)
      }
      const n = Math.min(falta, vagos(alvo))
      const parte = n / totalLugares
      alvo.ocupacao.push({
        id: id(), tipo: "cliente", lugares: n,
        descricao: `${it.nome}${it.marca ? ` · ${it.marca}` : ""}`,
        pedido: it.pedido, pedidoId: it.pedidoId, itemIdx: it.itemIdx, parte: parteIdx++, cliente: it.cliente, telefone: it.telefone, marca: it.marca,
        receita: Math.round(receitaTotal * parte * 100) / 100,
        frete: Math.round((ch.frete ?? 0) * parte * 100) / 100,
        arte: primeiro ? ch.arte : 0,
        pagoEm: it.pagoEm, arteAprovadaEm: null,
      })
      falta -= n
      primeiro = false
    }
    ja.add(chaveItem(it.pedidoId, it.itemIdx))
    novos++
  }
  return { chapas: lista, novos }
}

// Contas da chapa
export function contas(c: Chapa) {
  const clientes = c.ocupacao.filter(o => o.tipo === "cliente")
  const receita = clientes.reduce((s, o) => s + (o.receita ?? 0), 0)
  const arte = clientes.reduce((s, o) => s + (o.arte ?? 0), 0)
  const frete = clientes.reduce((s, o) => s + (o.frete ?? 0), 0)
  const unidades = ocupados(c) * 1000
  const colagem = (unidades / 1000) * c.colagemPorMil
  const custo = c.rodada + colagem + arte + frete
  const sobra = receita - custo
  // Receita média por lugar de cliente, para estimar quantos lugares pagam a chapa
  const lugaresCliente = clientes.reduce((s, o) => s + o.lugares, 0)
  const porLugar = lugaresCliente ? receita / lugaresCliente : 0
  const custoVariavelLugar = c.colagemPorMil + (lugaresCliente ? (arte + frete) / lugaresCliente : 0)
  const equilibrio = porLugar > custoVariavelLugar ? Math.ceil(c.rodada / (porLugar - custoVariavelLugar)) : null
  const sobraCheia = porLugar ? sobra + vagos(c) * (porLugar - custoVariavelLugar) : null
  return { receita, custo, sobra, colagem, arte, frete, lugaresCliente, equilibrio, sobraCheia, unidades }
}

// Até quando a chapa pode esperar mais pedidos (ISO aaaa-mm-dd), e o que falta para fechar
export function prazo(c: Chapa, hoje = new Date().toLocaleDateString("sv-SE")) {
  const clientes = c.ocupacao.filter(o => o.tipo === "cliente")
  const aprovadas = clientes.filter(o => o.arteAprovadaEm).map(o => o.arteAprovadaEm!.slice(0, 10)).sort()
  const semArte = clientes.filter(o => !o.arteAprovadaEm).length
  const primeira = aprovadas[0] ?? null
  const fecharAte = primeira ? somarDiasUteis(primeira, FOLGA_NORMAL_DU) : null
  const diasRestantes = fecharAte ? diasUteisEntre(hoje, fecharAte) : null
  const cheia = vagos(c) === 0
  const podeFechar = clientes.length > 0 && semArte === 0
  // O que fazer agora
  let acao: "fechar" | "fechar_logo" | "aguardar_arte" | "esperar" | null = null
  if (c.status === "aberta") {
    if (podeFechar && (cheia || (diasRestantes !== null && diasRestantes <= 0))) acao = "fechar"
    else if (podeFechar && diasRestantes !== null && diasRestantes <= 3) acao = "fechar_logo"
    else if (semArte > 0 && (cheia || (diasRestantes !== null && diasRestantes <= 3))) acao = "aguardar_arte"
    else acao = "esperar"
  }
  return { fecharAte, diasRestantes, semArte, cheia, podeFechar, acao }
}
