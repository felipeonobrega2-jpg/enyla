// Termos da proposta offset (tickets altos): o cliente lê e aceita na página de aprovação, junto com o "Aprovo".
// A versão aceita fica na aprovação e no rastreio. Mudou o texto: suba a VERSAO.
// Decisões do Felipe (13/11/2026): quantidade pode variar até 10% (cobra o entregue); sinal devolvido até a arte ser
// aprovada, descontando faca, clichê e fotolito já feitos; 3 rodadas de ajuste na arte.
import type { SecaoTermos } from "./termosDigital"

export const VERSAO_TERMOS_OFFSET = "2026-11-13.1"
export const VARIACAO_OFFSET_PCT = 10

export function termosOffset(p: { quantidade: number | null; sinalPct: number; prazoDiasUteis: number | null; validaAte: string | null }): SecaoTermos[] {
  const q = p.quantidade ? `${p.quantidade.toLocaleString("pt-BR")} unidades` : "a quantidade escolhida"
  const data = (iso: string) => iso.split("-").reverse().join("/")
  return [
    { titulo: "Quem vende", itens: [
      "ENYLA é a marca da Jerograf Embalagens Personalizadas, CNPJ 03.999.896/0001-52, com produção na Estrada Velha de Itapevi, 3614, Vila Militar, Barueri – SP.",
      "O atendimento é pelo WhatsApp em que você recebeu esta proposta.",
    ] },
    { titulo: "O que está incluído", itens: [
      "O que está listado em \"O que está incluso\" nesta página, na medida e no material da proposta. O que não estiver na lista não está incluído.",
    ] },
    { titulo: "Quantidade", itens: [
      `A impressão offset tem perda de produção: a entrega de ${q} pode variar até ${VARIACAO_OFFSET_PCT}% para mais ou para menos.`,
      "O valor final acompanha a quantidade entregue (o preço por unidade da proposta).",
    ] },
    { titulo: "Arte", itens: [
      "Quando a arte é feita pela Enyla, você recebe a primeira versão e tem até 3 rodadas de ajuste incluídas. Mudanças além disso, ou uma ideia totalmente nova, são combinadas à parte.",
      "Se você mandar a arte pronta, conferimos o arquivo (medida, sangria, resolução) antes de imprimir.",
      "Nada é impresso sem a sua aprovação. Ao aprovar, você confirma textos, nomes, ortografia, códigos e informações da embalagem.",
      "Você garante que pode usar a marca, o logo e as imagens da arte.",
      "A cor impressa pode variar um pouco em relação à tela e entre lotes diferentes.",
    ] },
    { titulo: "Prazo", itens: [
      p.prazoDiasUteis
        ? `A produção leva até ${p.prazoDiasUteis} dias úteis, contados depois do sinal pago e da arte aprovada.`
        : "O prazo de produção conta a partir do sinal pago e da arte aprovada.",
      "O frete, quando não estiver na proposta, é combinado à parte.",
    ] },
    { titulo: "Pagamento", itens: [
      `${p.sinalPct}% de sinal para começar. O restante é pago na entrega, conforme combinado.`,
    ] },
    { titulo: "Desistência", itens: [
      "Até você aprovar a arte, se desistir, devolvemos o sinal, descontando o que já tiver sido feito sob medida para o seu pedido (faca de corte, clichê, fotolito).",
      "Depois da arte aprovada, a embalagem é produzida sob medida para a sua marca e o sinal não é devolvido.",
    ] },
    { titulo: "Entrega e problemas", itens: [
      "Confira as caixas ao receber. Se alguma vier com defeito de impressão, corte ou colagem, avise em até 7 dias, com fotos, e refazemos as unidades com problema.",
    ] },
    { titulo: "Validade", itens: [
      p.validaAte ? `Esta proposta vale até ${data(p.validaAte)}.` : "Esta proposta vale pelo prazo informado no orçamento.",
    ] },
  ]
}
