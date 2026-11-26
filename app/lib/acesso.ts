// Controle de acesso por perfil. Puro (sem banco, sem rede): o proxy lê o estado e chama `avaliar`.
//
// Perfis:
//  - admin:   o Felipe (senha única de sempre, ou usuário com este perfil). Sem restrição.
//  - diretor: login próprio de cada diretor. Acesso total, igual ao admin, MENOS o que um interruptor bloquear.
//
// Os 7 bloqueios são interruptores por perfil, todos DESLIGADOS por padrão (decisão do Felipe, 26/11/2026).
// Ligado = o diretor é barrado (403) no servidor naquela ação. Os interruptores ficam em `dados_sistema`
// (coleção "acesso"), então ligar/desligar não pede deploy.

export const PERFIS = ["admin", "diretor"] as const
export type Perfil = (typeof PERFIS)[number]

export const BLOQUEIOS = ["apagar", "financeiro", "cobranca", "preco", "configuracao", "mensagem_externa", "meta"] as const
export type Bloqueio = (typeof BLOQUEIOS)[number]

export const ROTULO_BLOQUEIO: Record<Bloqueio, string> = {
  apagar: "apagar qualquer registro",
  financeiro: "lançar, editar ou apagar no financeiro (pagamento, recebível, despesa, cobrança)",
  cobranca: "disparar cobrança",
  preco: "mudar preço, tabela de preço ou orçamento Offset",
  configuracao: "mexer em usuários, papéis, chaves, tokens e integrações/configuração",
  mensagem_externa: "mandar mensagem a contato externo (cliente, lead ou parceiro)",
  meta: "mudar campanha, verba ou publicar anúncio da Meta",
}

export type Interruptores = Record<Bloqueio, boolean>
export const INTERRUPTORES_PADRAO: Interruptores = {
  apagar: false, financeiro: false, cobranca: false, preco: false, configuracao: false, mensagem_externa: false, meta: false,
}
// Estado vindo do banco: só `true` explícito liga. Qualquer outra coisa (ausente, lixo) = desligado.
export function normalizarInterruptores(bruto: unknown): Interruptores {
  const o = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>
  return Object.fromEntries(BLOQUEIOS.map(b => [b, o[b] === true])) as Interruptores
}

// Campos da configuração (AppConfig) por bloqueio. A tela salva a configuração inteira numa rota só; o que conta é
// qual campo mudou de verdade.
export const CAMPOS_CONFIG: Record<"preco" | "financeiro" | "configuracao" | "meta", readonly string[]> = {
  preco: ["materiais", "custos", "multiplicadores", "fornecedores"],
  financeiro: ["contas", "gastosFixos", "categoriasReceita", "categoriasDespesa", "baselineFaturamento", "metaMensal", "metas"],
  configuracao: ["apiKey", "groqKey", "geminiKey", "metaToken", "metaContaId", "metaContaEscolhida", "whatsappConexao", "lalamoveCarteira", "sinalPct", "feriados"],
  meta: ["campanhaDigital", "gastosMeta"],
}

const M_ESCRITA = (m: string) => m !== "GET" && m !== "HEAD" && m !== "OPTIONS"
const comeca = (p: string, base: string) => p === base || p.startsWith(base + "/")

// Quais bloqueios uma chamada toca (pode ser mais de um). Só olha método e caminho; a rota de configuração
// é refinada por campo em `bloqueiosDaConfig`.
export function bloqueiosDaRota(metodo: string, caminho: string): Bloqueio[] {
  const m = metodo.toUpperCase()
  const p = caminho.replace(/\/+$/, "")
  if (!p.startsWith("/api/")) return []
  const r = new Set<Bloqueio>()
  if (m === "DELETE") r.add("apagar")
  // Financeiro: tudo o que grava lançamento, caixa, banco e gastos
  if (M_ESCRITA(m) && ["/api/lancamentos", "/api/caixa", "/api/gastos", "/api/banco/corrigir", "/api/banco/aplicar", "/api/banco/aprendizado", "/api/digital/receber"].some(b => comeca(p, b))) r.add("financeiro")
  // Cobrança: link de Pix (um GET já gera a cobrança) e a conta Asaas
  if (comeca(p, "/api/pix-link") || (M_ESCRITA(m) && comeca(p, "/api/asaas/conta"))) r.add("cobranca")
  // Preço, tabela e custos
  if (M_ESCRITA(m) && ["/api/cartuxo/custos", "/api/cartuxo/chapas", "/api/cartuxo/facas"].some(b => comeca(p, b))) r.add("preco")
  // Usuários, chaves, tokens, integrações
  if (M_ESCRITA(m) && ["/api/usuarios", "/api/config/acesso-externo", "/api/config/groq", "/api/config/gemini", "/api/meta/token", "/api/whatsapp/configurar", "/api/whatsapp/qr"].some(b => comeca(p, b))) r.add("configuracao")
  // Mensagem direta a contato externo (cliente, lead, parceiro). `ordenar_funcionario` não passa por aqui.
  if (M_ESCRITA(m) && ["/api/whatsapp/enviar", "/api/whatsapp/enviar-cliente", "/api/whatsapp/reativacao", "/api/whatsapp/atender", "/api/prospector/enviar", "/api/fornecedores/avisar-pedido"].some(b => comeca(p, b))) r.add("mensagem_externa")
  // Meta: campanha, verba, anúncio
  if (M_ESCRITA(m) && ["/api/campanha-digital"].some(b => comeca(p, b))) r.add("meta")
  return [...r]
}

export function bloqueiosDaConfig(camposAlterados: string[]): Bloqueio[] {
  const r = new Set<Bloqueio>()
  for (const [b, campos] of Object.entries(CAMPOS_CONFIG) as [keyof typeof CAMPOS_CONFIG, readonly string[]][]) {
    if (camposAlterados.some(c => campos.includes(c))) r.add(b)
  }
  return [...r]
}

export const ehRotaDeConfig = (metodo: string, caminho: string) => metodo.toUpperCase() === "POST" && caminho.replace(/\/+$/, "") === "/api/config"

export type Decisao = { ok: true } | { ok: false; status: 403; bloqueio: Bloqueio; erro: string }

export function avaliar(perfil: string | undefined, interruptores: Interruptores, tocados: Bloqueio[]): Decisao {
  if (perfil !== "diretor") return { ok: true }   // admin: sem restrição. Perfil desconhecido nunca chega aqui logado (ver proxy).
  const barrado = tocados.find(b => interruptores[b])
  if (!barrado) return { ok: true }
  return { ok: false, status: 403, bloqueio: barrado, erro: `Perfil diretor sem permissão para ${ROTULO_BLOQUEIO[barrado]}. Peça ao Felipe.` }
}
