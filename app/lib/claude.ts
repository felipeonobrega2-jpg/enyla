import Anthropic from "@anthropic-ai/sdk"
import { registrarUsoIA } from "./gastosServidor"
import type { UsoIA } from "./gastos"

// Modelo e parâmetros comuns da Forma IA e do assistente.
// A chave vem das Configurações do sistema (config.apiKey), enviada pela tela.
export const MODELO = "claude-opus-5-5"

// Se o modelo recusar por política de segurança, o servidor refaz a mesma
// requisição num modelo alternativo escolhido pela categoria da recusa.
export const FALLBACK = {
  betas: ["server-side-fallback-2026-07-01"] as Anthropic.Beta.AnthropicBeta[],
  fallbacks: "default" as const,
}

// Cliente da IA. Toda resposta registra o custo do dia (seção Gastos): o uso vem na própria resposta da API.
export function clienteClaude(apiKey: string) {
  const c = new Anthropic({ apiKey })
  for (const alvo of [c.messages, c.beta.messages] as unknown as { create: (...a: unknown[]) => Promise<unknown> }[]) {
    const original = alvo.create.bind(alvo)
    alvo.create = async (...args: unknown[]) => {
      const r = await original(...args)
      if (r && typeof r === "object" && "usage" in r && "model" in r)
        await registrarUsoIA(String((r as { model: string }).model), (r as { usage: UsoIA }).usage).catch(() => null)
      return r
    }
  }
  return c
}

export const MSG_RECUSA = "A IA não pôde responder a esse pedido. Reformule a pergunta e tente de novo."

// Erro da API em mensagem legível + status HTTP para a tela
export function erroClaude(e: unknown): { error: string; status: number } {
  if (e instanceof Anthropic.AuthenticationError) return { error: "Chave da API inválida. Confira em Configurações.", status: 401 }
  if (e instanceof Anthropic.PermissionDeniedError) return { error: "A chave da API não tem permissão para este modelo.", status: 403 }
  if (e instanceof Anthropic.RateLimitError) return { error: "Limite de uso da IA atingido. Tente de novo em instantes.", status: 429 }
  if (e instanceof Anthropic.BadRequestError) return { error: `Pedido recusado pela API: ${e.message}`, status: 400 }
  if (e instanceof Anthropic.APIConnectionError) return { error: "Sem conexão com a IA. Tente de novo.", status: 502 }
  if (e instanceof Anthropic.APIError) return { error: `Erro da IA (${e.status ?? "?"}): ${e.message}`, status: e.status ?? 500 }
  return { error: "Erro inesperado ao falar com a IA.", status: 500 }
}
