// E-mails da ENYLA no servidor: monta (emailsEnyla) e envia (Resend). Nunca derruba o fluxo que chamou:
// devolve se saiu ou por que não saiu.
import { supabase } from "./supabase"
import { enviarEmail } from "./email"
import { emailCadastroRecebido, emailParceiroAprovado, emailNovoPedido, type DadosPedidoParceiro } from "./emailsEnyla"
import { nomeServico, type CadastroParceiro } from "./parceiros"
import { SERVICOS, type FornecedorProducao, type Servico } from "./producao"

export async function whatsappGerente(): Promise<string | null> {
  const env = (process.env.WHATSAPP_GERENTE ?? "").replace(/\D/g, "")
  if (env) return env
  const { seuNumero } = await import("./agenteAuto")
  return Promise.race([seuNumero().catch(() => null), new Promise<null>(r => setTimeout(() => r(null), 2500))])
}
const primeiro = (nome?: string | null) => (nome ?? "").trim().split(/\s+/)[0] || null

export async function emailDoCadastro(c: CadastroParceiro, tipo: "recebido" | "aprovado") {
  const w = await whatsappGerente()
  const e = tipo === "recebido"
    ? emailCadastroRecebido({ primeiroNome: primeiro(c.responsavel) ?? "parceiro", empresa: c.nomeFantasia, servicos: c.servicos.map(nomeServico), whatsappGerente: w })
    : emailParceiroAprovado({ primeiroNome: primeiro(c.responsavel) ?? "parceiro", empresa: c.nomeFantasia, whatsappGerente: w })
  const r = await enviarEmail(c.email, e)
  return { tipo, em: new Date().toISOString(), ok: r.ok, ...(r.ok ? {} : { erro: r.erro }) }
}

// Pedido enviado ao fornecedor: busca os dados do pedido (cards e arquivos de arte/faca) e manda o e-mail
export async function emailDoPedido(a: { fornecedor: FornecedorProducao; pedidoKey: string; servicos: Servico[]; enviadoEm: string; prazoPrevisto?: string | null; obs?: string | null }) {
  if (!a.fornecedor.email) return { ok: false as const, erro: "fornecedor sem e-mail" }
  const [tipo, id] = [a.pedidoKey.startsWith("lote-") ? "lote" : "card", a.pedidoKey.replace(/^(lote|card)-/, "")]
  const { data: cards } = await supabase.from("KanbanCard").select("id, numero, loteNumero, quantidade, dimensoes, materialNome, cores, acabamentos, observacoes_os").eq(tipo === "lote" ? "loteId" : "id", id)
  const cs = (cards ?? []) as { id: string; numero: string; loteNumero?: string | null; quantidade: number; dimensoes: string; materialNome: string; cores?: string | null; acabamentos?: string[] | null; observacoes_os?: string | null }[]
  if (!cs.length) return { ok: false as const, erro: "pedido não encontrado" }
  const { data: arqs } = await supabase.from("pedido_arquivos").select("nome, url, tipo").in("card_id", cs.map(c => c.id)).in("tipo", ["arte", "faca"])
  const pedido: DadosPedidoParceiro = {
    numero: cs[0].loteNumero || cs[0].numero,
    servicos: a.servicos.map(s => SERVICOS.find(x => x.id === s)?.nome ?? s),
    quantidade: cs.reduce((t, c) => t + (c.quantidade || 0), 0) || null,
    medida: [...new Set(cs.map(c => c.dimensoes).filter(Boolean))].map(m => /×|x/.test(m) && !/cm/.test(m) ? `${m} cm` : m).join(" · ") || null,
    material: [...new Set(cs.map(c => c.materialNome).filter(Boolean))].join(" · ") || null,
    cores: cs[0].cores ?? null, acabamentos: cs[0].acabamentos ?? null,
    obs: [a.obs, cs[0].observacoes_os].filter(Boolean).join(" · ") || null,
    prazo: a.prazoPrevisto ?? null, enviadoEm: a.enviadoEm,
    arquivos: (arqs ?? []).map(x => ({ nome: `${x.tipo === "faca" ? "Faca" : "Arte"} · ${x.nome}`, url: x.url })),
  }
  const w = await whatsappGerente()
  return enviarEmail(a.fornecedor.email, emailNovoPedido({ primeiroNome: primeiro(a.fornecedor.contato), empresa: a.fornecedor.nome, pedido, whatsappGerente: w }))
}
