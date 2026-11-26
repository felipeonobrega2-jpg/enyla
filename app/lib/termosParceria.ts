// Termos de Parceria ENYLA: texto versionado, aceite e trava de pedido. Só exibe o texto e grava o aceite:
// nenhuma lógica de cobrança, desconto, pagamento ou multa mora aqui.
import { SERVICOS_PARCEIRO } from "./parceiros"

export type TermoParceria = { versao: string; texto: string; vigenteDesde: string; rascunho: boolean }
export type AceiteTermos = { versao: string; em: string; ip: string | null; userAgent: string | null }

/** Marcador do item 1: vira a lista de tipos de serviço do formulário /parceiros (mesma fonte, nunca diverge). */
export const MARCADOR_SERVICOS = "{lista de tipos de serviço do formulário}"

// Registro inicial. O texto final (com revisão jurídica) entra como nova linha em `termos_parceria`, sem deploy.
export const TERMO_INICIAL: TermoParceria = {
  versao: "0.3", rascunho: true, vigenteDesde: "2026-11-26T00:00:00Z",
  texto: [
    `1. Objeto. A ENYLA encaminha à Parceira, conforme a demanda dos seus clientes, os serviços oferecidos no cadastro de parceiros, entre eles: ${MARCADOR_SERVICOS}. Cada serviço é combinado por pedido.`,
    "2. Cadastro. O cadastro é gratuito. Não há exclusividade: a Parceira segue atendendo os próprios clientes normalmente.",
    "3. Volume. A ENYLA não garante quantidade mínima nem frequência de pedidos.",
    "4. Preço e prazo. A Parceira informa preço e prazo de cada serviço, ou deixa cadastrados um preço de referência e um prazo médio, que dão prioridade na distribuição dos pedidos.",
    "5. Pagamento. 50% antes do início do serviço e 50% na retirada, por PIX, em conta de mesma titularidade do CNPJ ou CPF cadastrado. O adiantamento só é pago depois de conferido o documento e confirmado que a chave PIX está no mesmo nome.",
    "6. Logística. Retirada e entrega do material são de responsabilidade da ENYLA. A Parceira entrega o serviço pronto somente à ENYLA ou a quem ela indicar.",
    "7. Não aliciamento. Durante a parceria e por 24 meses após o último serviço, a Parceira não pode procurar, oferecer serviços, orçar ou atender, direta ou indiretamente (por sócios, funcionários ou outra empresa), nenhum cliente que conheceu por meio da ENYLA. Isso inclui clientes cuja marca, arte ou material ela tenha recebido em pedido da ENYLA.",
    "8. Multa. Cada cliente abordado ou atendido em violação da cláusula 7 gera multa equivalente ao faturamento desse cliente com a ENYLA nos 12 meses anteriores à violação, com valor mínimo de R$ 10.000,00 por cliente, sem prejuízo de perdas e danos.",
    "9. Confidencialidade. Artes, marcas, quantidades, preços e qualquer informação dos pedidos são confidenciais. A Parceira não pode copiar, divulgar, fotografar para portfólio nem usar esse material fora do serviço.",
    "10. Identificação. A Parceira não coloca etiqueta, nota, cartão ou qualquer identificação própria no material.",
    "11. Qualidade e material. Serviço com defeito causado pela Parceira é refeito sem custo, no prazo que a ENYLA indicar. Material da ENYLA perdido ou estragado pela Parceira é ressarcido pelo custo, valor que pode ser descontado dos 50% da retirada.",
    "12. Aceite. O aceite é registrado no cadastro com data, hora e versão destes termos. Quem se cadastrou antes desta versão aceita antes do primeiro pedido. Parceiras que já prestam serviço à ENYLA aceitam pelo mesmo link, sem interrupção dos pedidos em andamento.",
    "13. Foro. [Comarca a definir.]",
  ].join("\n"),
}

/** Nomes dos serviços do formulário /parceiros (a própria lista SERVICOS_PARCEIRO), na ordem do formulário. */
export const nomesDosServicos = () => SERVICOS_PARCEIRO.map(s => s.nome)

/** Texto pronto para exibir: o marcador do item 1 vira a lista do formulário. Devolve uma cláusula por linha. */
export function clausulas(t: Pick<TermoParceria, "texto">): string[] {
  const lista = nomesDosServicos().map(n => n.toLowerCase()).join(", ")
  return t.texto.split("\n").map(l => l.trim()).filter(Boolean).map(l => l.split(MARCADOR_SERVICOS).join(lista))
}

/** A mais recente já em vigor (vigenteDesde <= agora). Sem registro válido, o termo inicial. */
export function termoVigente(linhas: { versao?: unknown; texto?: unknown; vigente_desde?: unknown; rascunho?: unknown }[] | null | undefined, agora = new Date()): TermoParceria {
  const validas = (linhas ?? []).filter(l => typeof l.versao === "string" && l.versao && typeof l.texto === "string" && l.texto.trim() && typeof l.vigente_desde === "string" && new Date(l.vigente_desde) <= agora)
    .sort((a, b) => +new Date(b.vigente_desde as string) - +new Date(a.vigente_desde as string))
  const l = validas[0]
  return l ? { versao: l.versao as string, texto: l.texto as string, vigenteDesde: l.vigente_desde as string, rascunho: l.rascunho !== false } : TERMO_INICIAL
}

export const TEXTO_CAIXA = "Li e aceito os termos. Não vou contatar nem atender diretamente, por 24 meses após o último serviço, clientes que a ENYLA me encaminhar."
export const ERRO_SEM_ACEITE = "Marque a caixa para aceitar os Termos de Parceria e enviar"

// ── Pendência e trava ────────────────────────────────────────────────────────
/** Pendente: ainda não aceitou nenhuma versão dos termos (aceitar uma versão anterior não deixa pendente). */
export const pendenteTermos = (c: { termos?: AceiteTermos | null }) => !c.termos

export type OrigemParceira = "parceiros" | "fornecedor"
/**
 * Pode receber pedido novo? A trava vale só para quem se cadastrou por /parceiros (origem "parceiros").
 * Fornecedor já em operação nunca é bloqueado (o aceite fica só como pendência visível), e pedido em
 * produção nunca é afetado, mesmo que a parceira ainda não tenha aceitado.
 */
export function podeReceberPedido(p: { origem: OrigemParceira; aceitou: boolean; pedidoEmProducao?: boolean }): boolean {
  if (p.pedidoEmProducao) return true
  if (p.origem === "fornecedor") return true
  return p.aceitou
}
