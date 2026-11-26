// Controle de acesso por papel (puro, sem banco). Dois papéis:
//  - admin: tudo. Entra com a senha única (ADMIN_PASSWORD_HASH) ou com um usuário de papel admin.
//  - diretor: acesso total, MENOS o que estiver com o interruptor LIGADO. Os 7 interruptores nascem todos
//    DESLIGADOS (diretor com acesso total, decisão do Felipe em 26/11/2026, 6h28) e o admin liga um a um pela tela
//    de administração, sem deploy. Interruptor ligado = o servidor responde 403 com mensagem clara.
// A guarda roda no proxy.ts (servidor), antes de qualquer rota de /api. Esconder botão não é a defesa.

export type Papel = "admin" | "diretor"
export const PAPEIS: Papel[] = ["admin", "diretor"]
export const ehPapel = (x: unknown): x is Papel => x === "admin" || x === "diretor"

export const INTERRUPTORES = [
  { id: "apagar", nome: "Apagar registro", msg: "Apagar registro está bloqueado para o perfil diretor." },
  { id: "financeiro", nome: "Lançar, editar ou apagar no financeiro", msg: "Lançar, editar ou apagar no financeiro (pagamento, recebível, despesa) está bloqueado para o perfil diretor." },
  { id: "cobranca", nome: "Disparar cobrança", msg: "Disparar cobrança está bloqueado para o perfil diretor." },
  { id: "preco", nome: "Mudar preço, tabela de preço ou orçamento Offset", msg: "Mudar preço, tabela de preço ou orçamento Offset está bloqueado para o perfil diretor." },
  { id: "configuracao", nome: "Usuários, papéis, chaves, tokens e integrações", msg: "Mexer em usuários, papéis, chaves, tokens e integrações está bloqueado para o perfil diretor." },
  { id: "mensagem_externa", nome: "Mensagem direta a cliente, lead ou parceiro", msg: "Mensagem a contato externo (cliente, lead ou parceiro) só pelo funcionário, com o Aprovo do Felipe. Está bloqueada para o perfil diretor." },
  { id: "meta", nome: "Campanha, verba ou anúncio da Meta", msg: "Mudar campanha, verba ou publicar anúncio da Meta está bloqueado para o perfil diretor (a leitura dos números segue liberada)." },
] as const
export type InterruptorId = typeof INTERRUPTORES[number]["id"]
export type Interruptores = Partial<Record<InterruptorId, boolean>>
export const ehInterruptor = (x: unknown): x is InterruptorId => INTERRUPTORES.some(i => i.id === x)

// Só `true` liga. Ausente, null ou qualquer outra coisa = desligado (padrão).
export const interruptorLigado = (cfg: Interruptores | null | undefined, id: InterruptorId) => cfg?.[id] === true

const escrita = (metodo: string) => !["GET", "HEAD", "OPTIONS"].includes(metodo.toUpperCase())

// A quais interruptores uma chamada pertence (por método e caminho). Vazio = livre para o diretor.
export function classificar(metodo: string, caminho: string): InterruptorId[] {
  const m = metodo.toUpperCase()
  const p = caminho.replace(/\/+$/, "")
  const e = escrita(m)
  const ids = new Set<InterruptorId>()
  const casa = (re: RegExp) => re.test(p)

  if (m === "DELETE" || (e && casa(/\/(apagar|excluir|remover)(\/|$)/))) ids.add("apagar")
  if (e && (casa(/^\/api\/(lancamentos|gastos|caixa)(\/|$)/) || casa(/^\/api\/banco\/(aplicar|corrigir|sincronizar)$/)
    || casa(/^\/api\/(asaas|infinitepay)(\/|$)/))) ids.add("financeiro")
  if (e && casa(/^\/api\/(asaas|infinitepay|pix-link)(\/|$)/)) ids.add("cobranca")
  if (e && casa(/^\/api\/cartuxo\/(custos|chapas)$/)) ids.add("preco")
  // Configuração: usuários e papéis (qualquer método: a lista de usuários nem é lida), chaves, tokens, integrações
  if (casa(/^\/api\/usuarios(\/|$)/)) ids.add("configuracao")
  if (e && (casa(/^\/api\/config\/(acesso-externo|gemini|groq)(\/|$)/) || casa(/^\/api\/meta\/token$/)
    || casa(/^\/api\/whatsapp\/(configurar|qr|destino)$/))) ids.add("configuracao")
  if (e && casa(/^\/api\/(whatsapp\/(enviar|enviar-cliente|reativacao|atender)|prospector\/enviar)$/)) ids.add("mensagem_externa")
  if (e && (casa(/^\/api\/meta(\/|$)/) || casa(/^\/api\/campanha-digital(\/|$)/))) ids.add("meta")
  return [...ids]
}

// POST /api/config grava a configuração inteira (a tela manda tudo, inclusive ideias e fornecedores, que o diretor
// pode mexer). Por isso o que conta é o que MUDOU em relação ao salvo: preço, chave, financeiro.
const CAMPOS_PRECO = ["custos", "multiplicadores", "materiais"] as const
const CAMPOS_CHAVE = ["apiKey"] as const
const CAMPOS_FINANCEIRO = ["contas", "gastosFixos", "categoriasReceita", "categoriasDespesa"] as const
export const CAMPOS_CONFIG_VIGIADOS: string[] = [...CAMPOS_PRECO, ...CAMPOS_CHAVE, ...CAMPOS_FINANCEIRO]

const igual = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

export function classificarConfig(corpo: Record<string, unknown>, salvo: Record<string, unknown>): InterruptorId[] {
  const mudou = (k: string) => k in corpo && !igual(corpo[k], salvo[k])
  const ids = new Set<InterruptorId>()
  if (CAMPOS_PRECO.some(mudou)) ids.add("preco")
  if (CAMPOS_CHAVE.some(mudou)) ids.add("configuracao")
  if (CAMPOS_FINANCEIRO.some(mudou)) ids.add("financeiro")
  return [...ids]
}

export type Decisao = { permitido: true } | { permitido: false; status: 403; interruptor: InterruptorId; mensagem: string }

export function decidir(papel: Papel | undefined, cfg: Interruptores | null | undefined, ids: InterruptorId[]): Decisao {
  if (papel === "admin") return { permitido: true }
  if (papel !== "diretor") return { permitido: false, status: 403, interruptor: "configuracao", mensagem: "Perfil sem permissão." }
  for (const id of ids) {
    if (interruptorLigado(cfg, id)) {
      return { permitido: false, status: 403, interruptor: id, mensagem: INTERRUPTORES.find(i => i.id === id)!.msg }
    }
  }
  return { permitido: true }
}

// Rotas só do admin, mesmo com todos os interruptores desligados (o diretor não vira admin nem cria usuário)
export const soAdmin = (caminho: string) => /^\/api\/usuarios(\/|$)/.test(caminho)
