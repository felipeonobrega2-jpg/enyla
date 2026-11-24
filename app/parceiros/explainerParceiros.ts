// Texto do explainer de 42s da LP /parceiros. Edite aqui, não no JSX.
// Roteiro final da Lívia (CMO), 24/11/2026. Não reescrever nem acrescentar frase.

export const DURACAO_S = 42

export type CenaExplainer = {
  /** início da cena, em segundos */
  de: number
  linhas: string[]
  apoio?: string
}

export const EXPLAINER = {
  selo: "Parceiros ENYLA",
  cena1: { de: 0, pequena: "Máquina parada é custo.", titulo: "Nunca mais fique ocioso." },
  cena2: { de: 6, linhas: ["A ENYLA traz os pedidos.", "Você produz."], apoio: "Embalagens para marcas de todo o Brasil, distribuídas entre gráficas parceiras." },
  cena3: {
    de: 14,
    linhas: ["Você cadastra o que sua máquina faz.", "O pedido chega completo."],
    cartao: { titulo: "Novo pedido para você", detalhe: "Arquivo · medida · quantidade · prazo", canal: "No WhatsApp e no e-mail" },
  },
  cena4: { de: 22, percentuais: ["50% na entrada", "50% na retirada"], apoio: "Valor e forma combinados antes de cada pedido. Sem surpresa." },
  cena5: { de: 30, linhas: ["Entregou bem, no prazo e rápido?", "Seu score sobe e você recebe mais pedidos."], apoio: "Pedidos frequentes para quem entrega bem." },
  cena6: { de: 37, linhas: ["Cadastro gratuito.", "Leva uns 5 minutos."], botao: "Quero ser parceiro", apoio: "Dá para parar e continuar depois." },
} as const

/** Número da cena (1 a 6) para o instante t, em segundos. */
export function cenaEm(t: number): 1 | 2 | 3 | 4 | 5 | 6 {
  if (t >= EXPLAINER.cena6.de) return 6
  if (t >= EXPLAINER.cena5.de) return 5
  if (t >= EXPLAINER.cena4.de) return 4
  if (t >= EXPLAINER.cena3.de) return 3
  if (t >= EXPLAINER.cena2.de) return 2
  return 1
}
