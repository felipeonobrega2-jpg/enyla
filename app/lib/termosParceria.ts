// Termos de Parceria: partes puras (texto, validação, registro do aceite). O banco fica em termosParceriaServidor.ts.

export const TEXTO_CAIXA_TERMOS = "Li e aceito os termos. Não vou contatar nem atender diretamente, por 24 meses após o último serviço, clientes que a ENYLA me encaminhar."
export const ERRO_TERMOS = "Para enviar, marque que leu e aceita os Termos de Parceria."
export const LINK_TERMOS = "/parceiros/termos"

// Usado só se a tabela termos_parceria ainda não existir ou estiver vazia
export const TERMOS_PROVISORIO = {
  versao: "rascunho-1",
  rascunho: true,
  vigente_desde: "2026-11-26T00:00:00Z",
  texto: "RASCUNHO. Texto provisório, sem valor jurídico. A parceira não contatará nem atenderá diretamente, por 24 meses após o último serviço, os clientes que a ENYLA lhe encaminhar, sob pena de multa (valor a definir).",
}

export type Termos = typeof TERMOS_PROVISORIO
export type MetaAceite = { ip: string | null; userAgent: string | null }

export const aceitouTermos = (valor: unknown) => valor === "1" || valor === "true" || valor === true

export function metaDaRequisicao(req: Request): MetaAceite {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip")
  return { ip: ip ? ip.slice(0, 64) : null, userAgent: req.headers.get("user-agent")?.slice(0, 300) ?? null }
}

export const registroDoAceite = (versao: string, meta: MetaAceite, agora = new Date()) => ({
  status: "aceito" as const, termos_versao: versao, termos_aceitos_em: agora.toISOString(), ip: meta.ip, user_agent: meta.userAgent,
})

// Parceira sem aceite registrado (ou pendente) não recebe pedido (a distribuição, num PR futuro, usa esta função)
export const pendenteTermos = (aceite?: { status?: string } | null) => aceite?.status !== "aceito"

// Trava da distribuição de pedidos NOVOS (PR futuro da #252). Vale só para parceira cadastrada via /parceiros (origem "cadastro_parceiros").
// Fornecedor/produtor já em operação (ex.: quem produz o Digital) e pedido já em produção NUNCA são bloqueados:
// para eles o aceite é só pendência visível no painel, aceita pelo mesmo link.
export function podeReceberPedido(o: { origem: "cadastro_parceiros" | "fornecedor"; aceite?: { status?: string } | null; pedidoEmProducao?: boolean }): boolean {
  if (o.pedidoEmProducao) return true
  if (o.origem !== "cadastro_parceiros") return true
  return !pendenteTermos(o.aceite)
}
