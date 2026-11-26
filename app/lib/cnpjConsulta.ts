// Consulta pública de CNPJ (BrasilAPI) para o formulário /parceiros: razão social, situação e endereço.
// Só ajuda a preencher; se a consulta falhar o cadastro segue normal (a validação do dígito é local).
import { cnpjValido } from "./parceiros"

export type DadosCnpj = {
  razaoSocial: string; nomeFantasia: string; situacao: string; ativa: boolean
  cep: string; rua: string; numero: string; complemento: string; bairro: string; cidade: string; uf: string
}
type Fetcher = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>

const t = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim()

export async function consultarCnpj(cnpj: string, f: Fetcher = fetch as unknown as Fetcher): Promise<{ ok: true; dados: DadosCnpj } | { ok: false; motivo: "invalido" | "nao_encontrado" | "indisponivel" }> {
  const c = cnpj.replace(/\D/g, "")
  if (!cnpjValido(c)) return { ok: false, motivo: "invalido" }
  try {
    const r = await f(`https://brasilapi.com.br/api/cnpj/v1/${c}`, { signal: AbortSignal.timeout(8000) })
    if (r.status === 404 || r.status === 400) return { ok: false, motivo: "nao_encontrado" }
    if (!r.ok) return { ok: false, motivo: "indisponivel" }
    const j = await r.json() as Record<string, unknown>
    const situacao = t(j.descricao_situacao_cadastral)
    return { ok: true, dados: {
      razaoSocial: t(j.razao_social).slice(0, 160), nomeFantasia: t(j.nome_fantasia).slice(0, 120), situacao, ativa: /^ativa$/i.test(situacao),
      cep: t(j.cep).replace(/\D/g, "").slice(0, 8),
      rua: [t(j.descricao_tipo_de_logradouro), t(j.logradouro)].filter(Boolean).join(" ").slice(0, 160),
      numero: t(j.numero).slice(0, 20), complemento: t(j.complemento).slice(0, 80), bairro: t(j.bairro).slice(0, 80),
      cidade: t(j.municipio).slice(0, 80), uf: t(j.uf).slice(0, 2).toUpperCase(),
    } }
  } catch { return { ok: false, motivo: "indisponivel" } }
}
