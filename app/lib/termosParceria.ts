// Termos de Parceria ENYLA: texto versionado, regras do aceite e da trava de distribuição. Parte pura (sem banco).
// O texto vigente vem da tabela `termos_parceria` (trocar o registro dispensa deploy); TERMOS_INICIAIS é a versão 0.3, usada
// como semente da tabela e como reserva se a tabela ainda não existir. Este módulo só exibe o texto e registra o aceite:
// nenhuma lógica de cobrança, desconto, pagamento ou multa.
import { SERVICOS_PARCEIRO, type CadastroParceiro } from "./parceiros"

export type TermosParceria = { versao: string; titulo: string; texto: string; rascunho: boolean; vigenteDesde: string }

export const TEXTO_CAIXA_ACEITE = "Li e aceito os termos. Não vou contatar nem atender diretamente, por 24 meses após o último serviço, clientes que a ENYLA me encaminhar."
export const MARCADOR_SERVICOS = "{servicos}"

export const TERMOS_INICIAIS: TermosParceria = {
  versao: "0.3",
  titulo: "Termos de Parceria ENYLA, versão 0.3, aguardando revisão de advogado",
  rascunho: true,
  vigenteDesde: "2026-11-26T00:00:00-03:00",
  texto: [
    `1. Objeto. A ENYLA encaminha à Parceira, conforme a demanda dos seus clientes, os serviços oferecidos no cadastro de parceiros, entre eles: ${MARCADOR_SERVICOS}, e outros serviços informados no cadastro, como manuseio e montagem. Cada serviço é combinado por pedido.`,
    "2. Cadastro. O cadastro é gratuito. Não há exclusividade: a Parceira segue atendendo os próprios clientes normalmente.",
    "3. Volume. A ENYLA não garante quantidade mínima nem frequência de pedidos.",
    "4. Preço e prazo. A Parceira informa preço e prazo de cada serviço, ou deixa cadastrados um preço de referência e um prazo médio, que dão prioridade na distribuição dos pedidos.",
    "5. Pagamento. 50% antes do início do serviço e 50% na retirada, por PIX, em conta de mesma titularidade do CNPJ ou CPF cadastrado. O adiantamento é pago somente para chave na mesma titularidade do CNPJ ou CPF do cadastro.",
    "6. Logística. Retirada e entrega do material são de responsabilidade da ENYLA. A Parceira entrega o serviço pronto somente à ENYLA ou a quem ela indicar. Quando a Parceira presta o próprio serviço de transporte, segue as instruções do pedido.",
    "7. Não aliciamento. Durante a parceria e por 24 meses após o último serviço, a Parceira não pode procurar, oferecer serviços, orçar ou atender, direta ou indiretamente (por sócios, funcionários ou outra empresa), nenhum cliente que conheceu por meio da ENYLA. Isso inclui clientes cuja marca, arte ou material ela tenha recebido em pedido da ENYLA.",
    "8. Multa. Cada cliente abordado ou atendido em violação da cláusula 7 gera multa equivalente ao faturamento desse cliente com a ENYLA nos 12 meses anteriores à violação, com valor mínimo de R$ 10.000,00 por cliente, sem prejuízo de perdas e danos.",
    "9. Confidencialidade. Artes, marcas, quantidades, preços e qualquer informação dos pedidos são confidenciais. A Parceira não pode copiar, divulgar, fotografar para portfólio nem usar esse material fora do serviço.",
    "10. Identificação. A Parceira não coloca etiqueta, nota, cartão ou qualquer identificação própria no material.",
    "11. Qualidade e material. Serviço com defeito causado pela Parceira é refeito sem custo, no prazo que a ENYLA indicar. Material da ENYLA perdido ou estragado pela Parceira é ressarcido pelo custo, valor que pode ser descontado dos 50% da retirada.",
    "12. Aceite. O aceite é registrado no cadastro com data, hora e versão destes termos. Quem se cadastrou antes desta versão aceita antes do primeiro pedido. Parceiras que já prestam serviço à ENYLA aceitam pelo mesmo link, sem interrupção dos pedidos em andamento.",
    "13. Foro. [Comarca a definir.]",
  ].join("\n"),
}

/** Lista de serviços do formulário /parceiros (mesma fonte: SERVICOS_PARCEIRO), para os termos e o formulário nunca divergirem. */
export const listaServicosFormulario = () => SERVICOS_PARCEIRO.map(s => s.nome.toLowerCase()).join(", ")

/** Troca o marcador {servicos} pela lista do formulário. */
export const renderTermos = (texto: string) => texto.split(MARCADOR_SERVICOS).join(listaServicosFormulario())

export type StatusTermos = "aceito" | "pendente_termos"
type ComTermos = Pick<CadastroParceiro, "termosVersao" | "termosAceitosEm">
export const statusTermos = (c: ComTermos): StatusTermos => c.termosVersao && c.termosAceitosEm ? "aceito" : "pendente_termos"

export type PedidoParaTrava = { emProducao?: boolean }
export type OrigemParceira = "formulario" | "fornecedor_em_operacao"
/**
 * Trava da distribuição (para o PR de distribuição da #252). Só vale para parceira cadastrada via /parceiros que ainda não
 * aceitou. Fornecedor em operação e pedido já em produção nunca são bloqueados: para eles o aceite é só pendência visível.
 */
export function podeReceberPedido(parceira: ComTermos & { origem?: OrigemParceira }, pedido: PedidoParaTrava = {}): boolean {
  if (pedido.emProducao) return true
  if (parceira.origem === "fornecedor_em_operacao") return true
  return statusTermos(parceira) === "aceito"
}

/** Campos que a ordem de serviço enviada à parceira NUNCA pode ter (dado do cliente final). */
export const CAMPOS_PROIBIDOS_NA_ORDEM = ["nome", "cliente", "telefone", "whatsapp", "email", "endereco", "cnpj", "cpf", "documento"] as const

export const linkAceiteTermos = (base: string, token: string) => `${base.replace(/\/$/, "")}/parceiros/termos?aceite=1&t=${encodeURIComponent(token)}`
