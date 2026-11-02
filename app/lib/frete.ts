// Frete com a Lalamove: endereços, telefone no formato que a API exige, status em português e os lançamentos
// que cada corrida gera no pedido (o custo sempre; a cobrança do cliente quando o frete é "cobrado à parte").

import type { LancamentoFinanceiro } from "../types"

export type Endereco = {
  cep?: string; rua?: string; numero?: string; complemento?: string; bairro?: string; cidade?: string; uf?: string
  texto: string          // como vai para o motorista
  lat: number; lng: number
}
export type LocalRetirada = { id: string; nome: string; contato?: string; telefone?: string; endereco: Endereco }
// Uma parada da corrida como fica guardada (nome do lugar + endereço)
export type ParadaFrete = { nome: string; texto: string; lat: number; lng: number }

export type Frete = {
  order_id: string
  pedido_numero: string | null
  card_id: string | null
  lote_id: string | null
  cliente: string | null
  status: string
  share_link: string | null
  valor: number
  cobrar_cliente: boolean
  retirada: { nome: string; texto: string } | null
  entrega: { texto: string } | null
  paradas: ParadaFrete[] | null
  descricao: string | null
  motorista: { nome?: string; telefone?: string; placa?: string; foto?: string; lat?: number; lng?: number; em?: string } | null
  veiculo: string | null
  lancamentos: string[]
  ambiente: string
  criado_em: string
  atualizado_em: string
}

export const textoEndereco = (e: Omit<Endereco, "texto" | "lat" | "lng">) =>
  [[e.rua, e.numero].filter(Boolean).join(", "), e.complemento, e.bairro, [e.cidade, e.uf].filter(Boolean).join(" - "), e.cep].filter(Boolean).join(" · ")

// Telefone brasileiro → E.164 (+55DDDNÚMERO). Inválido: null.
export function telefoneE164(tel: string | null | undefined): string | null {
  let d = (tel ?? "").replace(/\D/g, "")
  if (!d) return null
  if (d.startsWith("00")) d = d.slice(2)
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return "+" + d
  if (d.length === 10 || d.length === 11) return "+55" + d
  return null
}

export const STATUS_FRETE: Record<string, { nome: string; tom: "info" | "acento" | "sucesso" | "alerta" | "perigo" | "neutro"; final?: boolean }> = {
  ASSIGNING_DRIVER: { nome: "Procurando motorista", tom: "alerta" },
  ON_GOING: { nome: "Motorista a caminho da retirada", tom: "info" },
  PICKED_UP: { nome: "Coletado, a caminho do cliente", tom: "acento" },
  COMPLETED: { nome: "Entregue", tom: "sucesso", final: true },
  CANCELED: { nome: "Cancelado", tom: "neutro", final: true },
  REJECTED: { nome: "Recusado", tom: "perigo", final: true },
  EXPIRED: { nome: "Expirou sem motorista", tom: "perigo", final: true },
}
export const statusFinal = (s: string) => !!STATUS_FRETE[s]?.final

// Nomes dos veículos (a chave vem da API e pode mudar; sem tradução, mostra a descrição da Lalamove)
export const NOME_VEICULO: Record<string, string> = {
  LALAGO: "Moto", MOTORCYCLE: "Moto", CAR: "Carro", UV_FIORINO: "Utilitário (Fiorino)", VAN: "Van",
  TRUCK175: "Caminhão 1,75 t", TRUCK330: "Caminhão 3,3 t", TRUCK550: "Caminhão 5,5 t",
}

// Lançamentos de uma corrida: custo pago (sai da carteira da Lalamove) e, se for cobrado à parte, receita a receber
export function lancamentosDoFrete(f: {
  orderId: string; valor: number; cliente?: string | null; numero?: string | null; trajeto?: string
  cardId?: string | null; loteId?: string | null; cobrarCliente: boolean; hoje: string; criadoEm: string; novoId: () => string
}): LancamentoFinanceiro[] {
  const vinculo = f.loteId ? { loteId: f.loteId, loteNumero: f.numero ?? undefined } : f.cardId ? { cardId: f.cardId, cardNumero: f.numero ?? undefined } : {}
  const base = { ...(f.cliente ? { nomeCliente: f.cliente } : {}), criadoEm: f.criadoEm, categoria: "frete", ...vinculo }
  const custo: LancamentoFinanceiro = {
    ...base, id: f.novoId(), tipo: "despesa", descricao: `Frete Lalamove${f.numero ? ` ${f.numero}` : f.trajeto ? `: ${f.trajeto}` : ""}`, valor: f.valor,
    dataVencimento: f.hoje, dataPagamento: f.hoje, status: "pago", obs: `Corrida ${f.orderId}`,
  }
  if (!f.cobrarCliente || !f.cliente) return [custo]
  return [custo, {
    ...base, id: f.novoId(), tipo: "receita", descricao: `Frete${f.numero ? ` ${f.numero}` : ""} (cobrado do cliente)`, valor: f.valor,
    dataVencimento: f.hoje, status: "pendente", obs: `Corrida ${f.orderId}`,
  }]
}

// Mensagem de rastreio para o cliente (a sua frase de sempre)
export const textoRastreio = (link: string) => `A Lalamove está cuidando da sua entrega! Você pode rastrear a rota em tempo real aqui: ${link}`
