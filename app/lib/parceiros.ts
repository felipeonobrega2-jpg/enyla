// Parceiros ENYLA: cadastro público de quem presta serviço (impressão, acabamento, corte e vinco, colagem, faca…).
// Cada serviço tem o jeito de cobrar, o tempo médio de entrega (ou "não consigo mensurar") e observações.
// Puro: tipos, opções e validação (o formulário e o servidor usam os mesmos).
import type { FornecedorProducao, Servico } from "./producao"

export type IdServicoParceiro =
  | "impressaoOffset" | "impressaoDigital" | "laminacao" | "verniz" | "hotStamping" | "relevo"
  | "corteVinco" | "colagem" | "faca" | "papel" | "arte" | "fechamento" | "transporte" | "outro"

export const SERVICOS_PARCEIRO: { id: IdServicoParceiro; nome: string; dica: string; servico?: Servico }[] = [
  { id: "impressaoOffset", nome: "Impressão offset", dica: "Folhas impressas em máquina offset", servico: "impressao" },
  { id: "impressaoDigital", nome: "Impressão digital", dica: "Tiragens curtas, cartão e adesivo" },
  { id: "laminacao", nome: "Laminação", dica: "Fosca, brilho, soft touch", servico: "laminacao" },
  { id: "verniz", nome: "Verniz", dica: "UV total, localizado, com relevo", servico: "verniz" },
  { id: "hotStamping", nome: "Hot stamping", dica: "Dourado, prata, holográfico", servico: "hotStamping" },
  { id: "relevo", nome: "Relevo / baixo-relevo", dica: "Seco ou americano" },
  { id: "corteVinco", nome: "Corte e vinco", dica: "Corte com faca e vinco", servico: "corteVinco" },
  { id: "colagem", nome: "Colagem", dica: "Manual ou em coladeira", servico: "colagem" },
  { id: "faca", nome: "Fabricação de faca", dica: "Facas de corte e vinco" },
  { id: "papel", nome: "Papel e cartão", dica: "Venda de papel, cartão, kraft" },
  { id: "arte", nome: "Criação de arte", dica: "Design de embalagem", servico: "arte" },
  { id: "fechamento", nome: "Fechamento de arquivo", dica: "Pré-impressão, prova, CTP", servico: "fechamento" },
  { id: "transporte", nome: "Transporte / frete", dica: "Leva e traz material" },
  { id: "outro", nome: "Outro serviço", dica: "Conta pra gente qual" },
]

export type FormaCobranca = "milheiro" | "folha" | "unidade" | "m2" | "acertoMilheiro" | "trabalho" | "hora" | "kg" | "tabela" | "varia"
export const FORMAS_COBRANCA: { id: FormaCobranca; nome: string; unidade: string | null }[] = [
  { id: "milheiro", nome: "Por milheiro", unidade: "por mil" },
  { id: "acertoMilheiro", nome: "Acerto + milheiro", unidade: "por mil (+ acerto)" },
  { id: "folha", nome: "Por folha", unidade: "por folha" },
  { id: "unidade", nome: "Por unidade", unidade: "por unidade" },
  { id: "m2", nome: "Por m²", unidade: "por m²" },
  { id: "kg", nome: "Por kg", unidade: "por kg" },
  { id: "hora", nome: "Por hora", unidade: "por hora" },
  { id: "trabalho", nome: "Valor fechado por trabalho", unidade: "por trabalho" },
  { id: "tabela", nome: "Tenho uma tabela", unidade: null },
  { id: "varia", nome: "Depende do pedido", unidade: null },
]

export type ServicoCadastrado = {
  id: IdServicoParceiro
  qual?: string                    // "outro": qual serviço
  cobranca: FormaCobranca | null
  valor?: number | null            // valor de referência na unidade da cobrança
  acerto?: number | null           // acerto + milheiro
  prazoDias: number | null         // dias úteis em média
  prazoVaria: boolean              // "não consigo mensurar agora"
  minimo?: string                  // pedido mínimo
  obs?: string
}

export type CadastroParceiro = {
  id: string
  em: string
  status: "novo" | "aprovado" | "recusado"
  gerente: string                  // gerente de contas da ENYLA que fala com ele
  // empresa
  nomeFantasia: string
  razaoSocial?: string
  documento: string                // CNPJ ou CPF (só números)
  tipoDocumento: "cnpj" | "cpf"
  cidade: string
  uf: string
  endereco?: string
  // contato
  responsavel: string
  whatsapp: string                 // só números, com DDD
  email: string
  contatoProducao?: string         // quem recebe o material
  // serviços
  servicos: ServicoCadastrado[]
  // operação
  capacidade?: string
  horario?: string
  maquinas?: string
  arquivos: { nome: string; url: string }[]  // tabela de preços, orçamento de exemplo
  comoConheceu?: string
  aceite: boolean
  fornecedorId?: string            // depois de aprovado: o fornecedor criado no sistema
}

export const GERENTE_PADRAO = "Felipe"

const soDigitos = (s: string) => (s ?? "").replace(/\D/g, "")

export function cnpjValido(v: string): boolean {
  const c = soDigitos(v)
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false
  const dv = (base: string, pesos: number[]) => { const s = base.split("").reduce((t, d, i) => t + Number(d) * pesos[i], 0) % 11; return s < 2 ? 0 : 11 - s }
  const d1 = dv(c.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  const d2 = dv(c.slice(0, 12) + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  return c.endsWith(`${d1}${d2}`)
}
export function cpfValido(v: string): boolean {
  const c = soDigitos(v)
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false
  const dv = (n: number) => { const s = c.slice(0, n).split("").reduce((t, d, i) => t + Number(d) * (n + 1 - i), 0) * 10 % 11; return s === 10 ? 0 : s }
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10])
}
export const emailValido = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((e ?? "").trim())
export const whatsappValido = (w: string) => { const d = soDigitos(w).replace(/^55(?=\d{10,11}$)/, ""); return d.length === 10 || d.length === 11 }

export function mascaraDocumento(v: string, tipo: "cnpj" | "cpf") {
  const d = soDigitos(v).slice(0, tipo === "cnpj" ? 14 : 11)
  return tipo === "cnpj"
    ? d.replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d)/, "$1-$2")
    : d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2")
}
export function mascaraTelefone(v: string) {
  const d = soDigitos(v).replace(/^55(?=\d{10,11}$)/, "").slice(0, 11)
  if (d.length <= 2) return d.length ? `(${d}` : ""
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

// Erros por etapa do formulário (o mesmo vale no servidor)
export type Etapa = "empresa" | "contato" | "servicos" | "detalhes" | "final"
export function errosDaEtapa(c: Partial<CadastroParceiro>, etapa: Etapa): Record<string, string> {
  const e: Record<string, string> = {}
  if (etapa === "empresa") {
    if (!c.nomeFantasia?.trim()) e.nomeFantasia = "Como sua empresa é conhecida?"
    if (c.tipoDocumento === "cpf" ? !cpfValido(c.documento ?? "") : !cnpjValido(c.documento ?? "")) e.documento = c.tipoDocumento === "cpf" ? "Confira o CPF" : "Confira o CNPJ"
    if (!c.cidade?.trim()) e.cidade = "Qual a cidade?"
    if (!/^[A-Za-z]{2}$/.test(c.uf ?? "")) e.uf = "UF"
  }
  if (etapa === "contato") {
    if (!c.responsavel?.trim()) e.responsavel = "Com quem a gente fala?"
    if (!whatsappValido(c.whatsapp ?? "")) e.whatsapp = "WhatsApp com DDD"
    if (!emailValido(c.email ?? "")) e.email = "Confira o e-mail"
  }
  if (etapa === "servicos" && !(c.servicos?.length)) e.servicos = "Escolha pelo menos um serviço"
  if (etapa === "detalhes") for (const s of c.servicos ?? []) {
    if (s.id === "outro" && !s.qual?.trim()) e[`${s.id}.qual`] = "Qual serviço?"
    if (!s.cobranca) e[`${s.id}.cobranca`] = "Como você cobra?"
    if (!s.prazoVaria && !(s.prazoDias && s.prazoDias > 0 && s.prazoDias <= 120)) e[`${s.id}.prazo`] = "Informe o tempo médio ou marque que varia"
  }
  if (etapa === "final" && !c.aceite) e.aceite = "Precisa concordar para enviar"
  return e
}
export const errosDoCadastro = (c: Partial<CadastroParceiro>) =>
  (["empresa", "contato", "servicos", "detalhes", "final"] as Etapa[]).reduce((t, et) => ({ ...t, ...errosDaEtapa(c, et) }), {} as Record<string, string>)

// Limpa o que veio do formulário (texto curto, números dentro do razoável)
export function limparCadastro(x: Partial<CadastroParceiro>): Omit<CadastroParceiro, "id" | "em" | "status" | "gerente" | "arquivos"> {
  const t = (s: unknown, max = 200) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max)
  const n = (v: unknown, max: number) => { const k = Number(v); return Number.isFinite(k) && k > 0 && k <= max ? Math.round(k * 100) / 100 : null }
  const ids = new Set(SERVICOS_PARCEIRO.map(s => s.id)), formas = new Set(FORMAS_COBRANCA.map(f => f.id))
  return {
    nomeFantasia: t(x.nomeFantasia, 120), razaoSocial: t(x.razaoSocial, 160) || undefined,
    tipoDocumento: x.tipoDocumento === "cpf" ? "cpf" : "cnpj", documento: soDigitos(x.documento ?? "").slice(0, 14),
    cidade: t(x.cidade, 80), uf: t(x.uf, 2).toUpperCase(), endereco: t(x.endereco, 240) || undefined,
    responsavel: t(x.responsavel, 100), whatsapp: soDigitos(x.whatsapp ?? "").slice(-13), email: t(x.email, 160).toLowerCase(),
    contatoProducao: t(x.contatoProducao, 160) || undefined,
    servicos: (x.servicos ?? []).filter(s => ids.has(s.id)).slice(0, 20).map(s => ({
      id: s.id, qual: s.id === "outro" ? t(s.qual, 80) : undefined,
      cobranca: s.cobranca && formas.has(s.cobranca) ? s.cobranca : null,
      valor: n(s.valor, 1_000_000), acerto: n(s.acerto, 1_000_000),
      prazoDias: s.prazoVaria ? null : n(s.prazoDias, 120), prazoVaria: !!s.prazoVaria,
      minimo: t(s.minimo, 120) || undefined, obs: t(s.obs, 600) || undefined,
    })),
    capacidade: t(x.capacidade, 300) || undefined, horario: t(x.horario, 160) || undefined, maquinas: t(x.maquinas, 600) || undefined,
    comoConheceu: t(x.comoConheceu, 200) || undefined, aceite: !!x.aceite,
  }
}

export const nomeServico = (s: ServicoCadastrado) => s.id === "outro" ? (s.qual || "Outro") : SERVICOS_PARCEIRO.find(x => x.id === s.id)?.nome ?? s.id
export const textoPrazo = (s: ServicoCadastrado) => s.prazoVaria ? "varia muito (sem média)" : s.prazoDias ? `${s.prazoDias} ${s.prazoDias === 1 ? "dia útil" : "dias úteis"}` : "—"
export function textoCobranca(s: ServicoCadastrado) {
  const f = FORMAS_COBRANCA.find(x => x.id === s.cobranca)
  if (!f) return "—"
  const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
  if (s.cobranca === "acertoMilheiro" && (s.valor || s.acerto)) return `${s.acerto ? `acerto ${brl(s.acerto)} + ` : ""}${s.valor ? `${brl(s.valor)} por mil` : "milheiro"}`
  return s.valor && f.unidade ? `${brl(s.valor)} ${f.unidade}` : f.nome
}

// Aprovado: vira fornecedor de produção no sistema (preços ficam para você conferir; o prazo vem do que ele disse)
export function paraFornecedor(c: CadastroParceiro, id: string): FornecedorProducao {
  const prazos = c.servicos.map(s => s.prazoDias).filter((d): d is number => !!d)
  const resumo = c.servicos.map(s => `${nomeServico(s)}: ${textoCobranca(s)} · ${textoPrazo(s)}${s.minimo ? ` · mínimo ${s.minimo}` : ""}`).join(" | ")
  return {
    id, nome: c.nomeFantasia, ativo: true, servicos: {}, frete: 0,
    prazoDias: prazos.length ? Math.max(...prazos) : 5,
    obs: `Cadastro Parceiros ENYLA (${new Date(c.em).toLocaleDateString("pt-BR")}): ${resumo}`.slice(0, 1500),
    contato: c.contatoProducao || c.responsavel, telefone: c.whatsapp,
  }
}
