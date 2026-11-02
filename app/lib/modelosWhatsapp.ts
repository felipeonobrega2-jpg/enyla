// Mensagens prontas que levam o link da página do cliente (só o servidor sabe gerar o link). Só roda no servidor.
import { tokenCliente } from "./portalCliente"

export function textoModelo(modelo: string, nome: string, numero: string, origem: string): string {
  const link = `${origem}/c/${tokenCliente(nome)}`
  const primeiro = nome.trim().split(" ")[0]
  const textos: Record<string, string> = {
    "reposicao": `Oi, ${primeiro}! Tudo bem? Passando para ver como estão as embalagens por aí. Se estiver na hora de repor, dá para repetir o último pedido em 1 toque, pelo mesmo preço:\n${link}`,
    "como-ficou": `Oi, ${primeiro}! Tudo bem? Suas embalagens do pedido ${numero} chegaram. Como ficou? Conta pra gente com uma nota rapidinha aqui:\n${link}\n\nE se puder mandar uma foto delas em uso, a gente adora ver!`,
  }
  return textos[modelo] ?? link
}
