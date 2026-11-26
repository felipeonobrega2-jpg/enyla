// Porta externa, ação mensagem_parceira: canal INTERNO dos diretores até a gráfica parceira de produção (Villa/Leandro) sobre um pedido
// Digital (DIG-xxxx). Não fala com cliente (o destino vem só dos contatos do digital), não mexe em cobrança nem apaga nada.
// Cada envio é registrado no pedido (mensagensParceira): quem mandou, o texto e a hora; o registro só cresce.
import { DIRETORES } from "./diretoria"

export type ResultadoMensagemParceira =
  | { ok: true; id: string; enviado: boolean; em: string; aviso?: string }
  | { ok: false; status: 400 | 403 | 404 | 500; erro: string }

export const PODEM_MANDAR_PARCEIRA = ["coo", "cto"]
export const MAX_TEXTO_PARCEIRA = 1000

export function validarMensagemParceira(b: Record<string, unknown>): { erro: string } | { id: string; texto: string } {
  const id = typeof b.id === "string" ? b.id.trim().toUpperCase() : ""
  if (!/^DIG-\d+$/.test(id)) return { erro: "id: pedido Digital no formato DIG-0000." }
  const texto = typeof b.texto === "string" ? b.texto.trim() : ""
  if (!texto) return { erro: "texto: obrigatório." }
  if (texto.length > MAX_TEXTO_PARCEIRA) return { erro: `texto: no máximo ${MAX_TEXTO_PARCEIRA} caracteres.` }
  return { id, texto }
}

export async function mensagemParceiraExterno(diretor: string, b: Record<string, unknown>): Promise<ResultadoMensagemParceira> {
  if (!PODEM_MANDAR_PARCEIRA.includes(diretor)) return { ok: false, status: 403, erro: "mensagem_parceira: só o COO e o CTO. Nada foi enviado." }
  const v = validarMensagemParceira(b)
  if ("erro" in v) return { ok: false, status: 400, erro: v.erro }
  const por = DIRETORES.find(d => d.id === diretor)?.nome ?? diretor
  const { enviarParaParceira } = await import("./digitalServidor")
  const r = await enviarParaParceira(v.id, por, v.texto)
  if (!r.achou) return { ok: false, status: 404, erro: `Pedido ${v.id} não encontrado.` }
  return { ok: true, id: v.id, enviado: r.enviado, em: r.em,
    ...(r.enviado ? {} : { aviso: r.semNumero ? "Sem o número da Villa em Digital → Contatos: ficou só registrado, nada foi enviado." : "Não saiu agora: ficou registrado como não enviado." }) }
}
