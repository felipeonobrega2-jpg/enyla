// RH: o quadro de funcionários (agentes que executam as ordens da diretoria). Os diretores pedem contratação na
// reunião; o RH desenha a vaga e o onboarding (conceitos da empresa, o que pode e o que não pode); o Felipe aprova.
// Contratado, o funcionário vira executor nas reuniões e vai acumulando aprendizados. Puro.
import type { IdDiretor } from "./diretoria"

// O que o sistema já deixa um funcionário fazer. Hoje só uma: escrever a UM cliente (enviada após o Aprovo do Felipe).
// Função que precisa de outra ferramenta fica registrada com o que falta, sem executar.
export type Capacidade = "mensagem_cliente" | "sem_ferramenta"
export type Licao = { id: string; texto: string; em: string }
export type Funcionario = {
  id: string; nome: string; setor: IdDiretor; qualificacao: string; capacidade: Capacidade; ferramentaQueFalta?: string | null
  onboarding: { conceitos: string[]; pode: string[]; naoPode: string[] }
  status: "solicitado" | "contratado" | "recusado"; solicitadoPor: IdDiretor | "felipe"; motivo: string; em: string; decididoEm?: string
  aprendizados: Licao[]; fixo?: boolean
}

const CONCEITOS_BASE = [
  "A ENYLA é uma gráfica de embalagens: Offset (com o Felipe) e Digital (100% IA, produzido na Villa).",
  "Falamos como empresa (\"nós\"), cordiais e diretos; o cliente nunca fica sem resposta.",
  "Nunca inventar data, valor ou número de pedido que não esteja na ordem ou na conversa.",
]
export const FIXOS: Funcionario[] = [
  { id: "posvenda", nome: "Pós-venda", setor: "coo", capacidade: "mensagem_cliente", fixo: true, status: "contratado", solicitadoPor: "felipe", motivo: "Equipe inicial", em: "2026-11-23T00:00:00.000Z", aprendizados: [],
    qualificacao: "Fala com o cliente sobre o pedido dele: atraso, nova data, pedido pronto, entrega",
    onboarding: { conceitos: CONCEITOS_BASE, pode: ["Avisar atraso pedindo desculpa", "Combinar nova data de entrega", "Avisar que o pedido ficou pronto"], naoPode: ["Prometer data que a produção não confirmou", "Dar desconto ou compensação"] } },
  { id: "cobranca", nome: "Cobrança", setor: "cfo", capacidade: "mensagem_cliente", fixo: true, status: "contratado", solicitadoPor: "felipe", motivo: "Equipe inicial", em: "2026-11-23T00:00:00.000Z", aprendizados: [],
    qualificacao: "Lembra o cliente de um pagamento vencido ou de um sinal que não caiu, com cordialidade, oferecendo o Pix",
    onboarding: { conceitos: CONCEITOS_BASE, pode: ["Lembrar valor e pedido em aberto", "Oferecer o Pix"], naoPode: ["Ameaçar, falar em juros ou protesto", "Negociar desconto ou parcelamento sem o Felipe"] } },
]

// Quadro completo: os fixos (com o que foi aprendido e salvo) + os contratados/solicitados pelo RH
export function quadro(salvos?: Funcionario[] | null): Funcionario[] {
  const lista = salvos ?? []
  const fixos = FIXOS.map(f => { const s = lista.find(x => x.id === f.id); return s ? { ...f, aprendizados: s.aprendizados ?? [] } : f })
  return [...fixos, ...lista.filter(x => !FIXOS.some(f => f.id === x.id))]
}
export const executores = (q: Funcionario[]) => q.filter(f => f.status === "contratado" && f.capacidade === "mensagem_cliente")

// Texto do onboarding + aprendizados, para o prompt do funcionário
export function treinamento(f: Funcionario): string {
  const o = f.onboarding
  return [
    o.conceitos.length ? `Conceitos da empresa:\n${o.conceitos.map(c => `- ${c}`).join("\n")}` : "",
    o.pode.length ? `Você pode:\n${o.pode.map(c => `- ${c}`).join("\n")}` : "",
    o.naoPode.length ? `Você não pode:\n${o.naoPode.map(c => `- ${c}`).join("\n")}` : "",
    f.aprendizados.length ? `O que você aprendeu no trabalho (vale mais que o resto):\n${f.aprendizados.slice(0, 40).map(c => `- ${c.texto}`).join("\n")}` : "",
  ].filter(Boolean).join("\n\n")
}
