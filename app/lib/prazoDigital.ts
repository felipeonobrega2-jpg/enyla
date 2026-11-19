// Prazo de produção do digital (aprendizado do Felipe, 19/11): conta a partir do sinal pago e da arte aprovada.
// Até 200 caixinhas: 7 a 10 dias úteis. De 500 para cima: 14 dias úteis. 300 ainda sem regra: usa o maior (14),
// que é o prazo seguro de prometer.
export function prazoDigital(quantidade: number): { min: number; max: number; texto: string } {
  if (quantidade <= 200) return { min: 7, max: 10, texto: "7 a 10 dias úteis" }
  return { min: 14, max: 14, texto: "14 dias úteis" }
}
