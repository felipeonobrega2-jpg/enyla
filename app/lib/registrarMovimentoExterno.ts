// Porta externa, ação registrar_movimento (só CTO e COO): abre (enviar) ou fecha (receber) um movimento de fornecedor
// em AppConfig.producao.movimentos, os mesmos campos que a tela grava (enviadoEm, recebidoEm, prazoPrevisto).
// Só grava ali: não muda KanbanCard.coluna nem Tracking, não manda WhatsApp, e-mail nem aviso a cliente ou fornecedor.
// enviadoEm e recebidoEm são datas reais; prazoPrevisto é sempre previsão (nunca confirmação do fornecedor).
// Auditoria: AppConfig.movimentosPorta (chave JSON nova, aditiva) com quem, quando (Brasília) e o payload.
// Gancho #183: o cronograma deve reusar esta ação ou os mesmos campos de movimentos, sem um segundo livro de datas.
import { supabase } from "./supabase"
import { lerCampos, mudarConfig } from "./configAtomica"
import { brasilia } from "./lancarDespesaExterno"
import { somarDiasUteis } from "./diasUteis"
import { normalizarProducao, SERVICOS, type ConfigProducao, type EtapaPedido, type MovimentoFornecedor, type Servico } from "./producao"

export type RegistroMovimento = { autor: string; em: string; emIso: string; operacao: "enviar" | "receber"; payload: Record<string, unknown> }
export type ResultadoMovimento =
  | { ok: true; resultado: string; movimento: MovimentoFornecedor; registro: RegistroMovimento }
  | { ok: false; status: 400 | 404 | 409; erro: string }

const ETAPAS: EtapaPedido[] = ["arte", "impressao", "acabamento", "corteVinco", "colagem", "outro"]
const DATA = /^\d{4}-\d{2}-\d{2}$/
const dataOk = (v: unknown): v is string => typeof v === "string" && DATA.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v
const texto = (v: unknown) => typeof v === "string" ? v.trim() : ""
const erro = (status: 400 | 404 | 409, e: string): ResultadoMovimento => ({ ok: false, status, erro: e })

// loteNumero → pedidoKey, igual ao da tela (lote-<loteId>); pedidoKey vem direto
async function chavePedido(b: Record<string, unknown>): Promise<{ key: string } | ResultadoMovimento> {
  const key = texto(b.pedidoKey), lote = texto(b.loteNumero)
  if (key) return { key }
  if (!lote) return erro(400, "pedidoKey ou loteNumero: obrigatório.")
  const { data } = await supabase.from("KanbanCard").select("id, loteId, loteNumero").eq("loteNumero", lote)
  const card = ((data ?? []) as { loteId?: string | null }[]).find(c => c.loteId)
  return card ? { key: `lote-${card.loteId}` } : erro(404, `Lote ${lote} não encontrado no kanban.`)
}

export async function registrarMovimentoExterno(diretor: string, b: Record<string, unknown>): Promise<ResultadoMovimento> {
  const operacao = b.operacao
  if (operacao !== "enviar" && operacao !== "receber") return erro(400, "operacao: enviar ou receber.")
  const etapaBruta = texto(b.etapa)
  if (etapaBruta && !ETAPAS.includes(etapaBruta as EtapaPedido)) return erro(400, `etapa: ${ETAPAS.join(", ")}.`)
  const etapa = etapaBruta as EtapaPedido
  const id = texto(b.id)

  let key = ""
  if (operacao === "enviar" || !id) {
    if (!etapa) return erro(400, "etapa: obrigatória.")
    const k = await chavePedido(b)
    if (!("key" in k)) return k
    key = k.key
  }

  if (operacao === "receber") {
    if (!dataOk(b.recebidoEm)) return erro(400, "recebidoEm: data real AAAA-MM-DD.")
    return gravar(diretor, "receber", cfg => {
      const movs = cfg.movimentos
      const achados = movs.filter(m => id ? m.id === id : m.pedidoKey === key && m.etapa === etapa)
      const m = achados.find(x => !x.recebidoEm) ?? achados.at(-1)
      if (!m) return erro(404, "Movimento não encontrado.")
      if (m.recebidoEm) return m.recebidoEm === b.recebidoEm
        ? { ok: true, resultado: `Movimento ${m.id} já estava recebido em ${m.recebidoEm} (nada foi alterado).`, movimento: m, novos: null }
        : erro(409, `Movimento ${m.id} já tem recebidoEm ${m.recebidoEm}, diferente de ${b.recebidoEm}. Nada foi alterado.`)
      if ((b.recebidoEm as string) < m.enviadoEm) return erro(400, `recebidoEm não pode ser anterior a enviadoEm (${m.enviadoEm}).`)
      const novo = { ...m, recebidoEm: b.recebidoEm as string }
      return { ok: true, resultado: `Movimento ${m.id} fechado: recebido em ${novo.recebidoEm}.`, movimento: novo, novos: movs.map(x => x === m ? novo : x) }
    })
  }

  if (!dataOk(b.enviadoEm)) return erro(400, "enviadoEm: data real AAAA-MM-DD.")
  if (b.prazoPrevisto !== undefined && !dataOk(b.prazoPrevisto)) return erro(400, "prazoPrevisto: data prevista AAAA-MM-DD.")
  const fornecedorId = texto(b.fornecedorId)
  if (!fornecedorId) return erro(400, "fornecedorId: obrigatório (fornecedor ativo de AppConfig.producao.fornecedores).")
  const servicos = b.servicos
  const validos = SERVICOS.map(s => s.id)
  if (!Array.isArray(servicos) || !servicos.length || servicos.some(s => !validos.includes(s as Servico))) return erro(400, `servicos: lista com ao menos um de ${validos.join(", ")}.`)
  const enviadoEm = b.enviadoEm as string
  const pedidoLabel = texto(b.pedidoLabel) || (texto(b.loteNumero) ? `Lote ${texto(b.loteNumero)}` : key)
  return gravar(diretor, "enviar", cfg => {
    const forn = cfg.fornecedores.find(f => f.id === fornecedorId)
    if (!forn) return erro(404, `Fornecedor ${fornecedorId} não encontrado em AppConfig.producao.fornecedores.`)
    if (!forn.ativo) return erro(400, `Fornecedor ${fornecedorId} está inativo.`)
    if (cfg.movimentos.some(m => m.pedidoKey === key && m.etapa === etapa && !m.recebidoEm)) return erro(409, `Já existe movimento aberto da etapa ${etapa} neste pedido. Nada foi gravado.`)
    const cadastral = b.prazoPrevisto === undefined
    const prazoPrevisto = cadastral ? (forn.prazoDias ? somarDiasUteis(enviadoEm, forn.prazoDias) : undefined) : b.prazoPrevisto as string
    const movimento: MovimentoFornecedor = {
      id: `porta-${key}-${etapa}-${enviadoEm}`, pedidoKey: key, pedidoLabel, fornecedorId, etapa, servicos: servicos as Servico[], enviadoEm,
      ...(prazoPrevisto ? { prazoPrevisto } : {}),
    }
    if (cfg.movimentos.some(m => m.id === movimento.id)) movimento.id += `-${cfg.movimentos.length + 1}`
    const aviso = !prazoPrevisto ? "Sem prazoPrevisto (o fornecedor não tem prazoDias cadastrado)." : cadastral ? `prazoPrevisto ${prazoPrevisto} é previsão cadastral (${forn.prazoDias} dias úteis do cadastro do fornecedor), não data combinada.` : `prazoPrevisto ${prazoPrevisto} é previsão informada, não confirmada pelo fornecedor.`
    return { ok: true, resultado: `Movimento ${movimento.id} aberto: enviado em ${enviadoEm}. ${aviso}`, movimento, novos: [...cfg.movimentos, movimento] }
  })
}

type Decisao = { ok: true; resultado: string; movimento: MovimentoFornecedor; novos: MovimentoFornecedor[] | null } | ResultadoMovimento

async function gravar(diretor: string, operacao: "enviar" | "receber", decidir: (c: ConfigProducao) => Decisao): Promise<ResultadoMovimento> {
  const agora = new Date()
  let decisao: Decisao = erro(404, "Movimento não encontrado.")
  await mudarConfig<{ producao?: Partial<ConfigProducao>; movimentosPorta?: RegistroMovimento[] }>(cfg => {
    decisao = decidir(normalizarProducao(cfg.producao))
    if (!decisao.ok || !("novos" in decisao) || !decisao.novos) return null
    const m = decisao.movimento
    const registro: RegistroMovimento = { autor: diretor, em: brasilia(agora), emIso: agora.toISOString(), operacao, payload: { id: m.id, pedidoKey: m.pedidoKey, etapa: m.etapa, enviadoEm: m.enviadoEm, recebidoEm: m.recebidoEm ?? null, prazoPrevisto: m.prazoPrevisto ?? null, operacao } }
    return { producao: { ...(cfg.producao ?? {}), movimentos: decisao.novos }, movimentosPorta: [...(cfg.movimentosPorta ?? []), registro] }
  })
  const d = decisao
  if (!d.ok) return d
  // Repetição idempotente: devolve o registro original da auditoria, sem gravar outro
  const { movimentosPorta } = await lerCampos<{ movimentosPorta?: RegistroMovimento[] }>(["movimentosPorta"])
  const original = [...(movimentosPorta ?? [])].reverse().find(r => r.payload.id === d.movimento.id && r.operacao === operacao)
  const registro = original ?? { autor: diretor, em: brasilia(agora), emIso: agora.toISOString(), operacao, payload: { id: d.movimento.id, operacao } }
  return { ok: true, resultado: d.resultado, movimento: d.movimento, registro }
}
