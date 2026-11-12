// Termos do pedido digital: o cliente lê e aceita na página do pedido antes de pagar o sinal. A versão aceita fica
// guardada no pedido (quando e qual versão). Mudou o texto: suba a VERSAO (quem já aceitou fica com a dele).
// Decisões do Felipe (12/11/2026): 2 rodadas de ajuste na arte; sinal devolvido até a aprovação da arte; quantidade
// exata (o digital não tem perda).

export const VERSAO_TERMOS = "2026-11-12"

export type SecaoTermos = { titulo: string; itens: string[] }

export function termosDigital(p: { quantidade: number; medidas: { a: number; l: number; p: number }; validadeDias: number }): SecaoTermos[] {
  const cm = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })
  return [
    { titulo: "O que está incluído", itens: [
      `${p.quantidade.toLocaleString("pt-BR")} caixas em impressão digital, papel triplex 300 g, na medida ${cm(p.medidas.a)} × ${cm(p.medidas.l)} × ${cm(p.medidas.p)} cm (altura × largura × profundidade).`,
      "Laminação fosca ou brilho, na caixa inteira (não dá para misturar fosco e brilho na mesma caixa).",
      "A arte, criada pela nossa equipe a partir do que você contar na página do pedido.",
      "Não estão incluídos acabamentos especiais (alto relevo, hot stamping, verniz localizado): esses só existem no offset.",
    ] },
    { titulo: "Medida", itens: [
      "A caixa é feita na medida mostrada nesta página. Confira antes de pagar: se o seu frasco for diferente, fale com a gente no WhatsApp que ajustamos.",
      "Depois que a arte é aprovada, a medida não muda mais neste pedido.",
    ] },
    { titulo: "Arte", itens: [
      "Você recebe a primeira versão e tem até 2 rodadas de ajuste incluídas. Mudanças além disso, ou uma ideia totalmente nova, são combinadas à parte.",
      "Nada é impresso sem a sua aprovação. Ao aprovar, você confirma textos, nomes, ortografia e informações da caixa.",
      "Você garante que pode usar a marca, o logo e as imagens que nos enviar.",
      "A cor impressa pode variar um pouco em relação à tela do celular ou do computador.",
    ] },
    { titulo: "Prazo", itens: [
      "A produção leva de 3 a 5 dias úteis, contados depois do sinal pago e da arte aprovada. O tempo da entrega (frete) é à parte.",
    ] },
    { titulo: "Pagamento", itens: [
      "50% de sinal para começar. O restante, com o frete, é pago antes do envio: o pedido sai quando estiver quitado.",
      "Você recebe exatamente a quantidade contratada.",
    ] },
    { titulo: "Desistência", itens: [
      "Até você aprovar a arte, se desistir, devolvemos o sinal inteiro.",
      "Depois da arte aprovada, a caixa é produzida sob medida para a sua marca e o sinal não é devolvido.",
    ] },
    { titulo: "Entrega e problemas", itens: [
      "Confira as caixas ao receber. Se alguma vier com defeito de impressão ou de corte, avise em até 7 dias, com fotos, e refazemos as unidades com problema.",
    ] },
    { titulo: "Validade", itens: [
      `Este orçamento vale por ${p.validadeDias} dias a partir da data em que foi feito.`,
    ] },
  ]
}
