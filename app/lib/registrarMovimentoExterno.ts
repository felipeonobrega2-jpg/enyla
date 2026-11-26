// Porta externa, ação registrar_movimento (só as chaves do CTO e do COO): abre (enviar) ou fecha (receber) um movimento
// de fornecedor em AppConfig.producao.movimentos, os mesmos campos que a tela grava (enviadoEm, recebidoEm, prazoPrevisto).
// Só grava ali: não mexe em KanbanCard.coluna nem no Tracking, não manda WhatsApp, e-mail nem aviso a cliente ou fornecedor.
// enviadoEm/recebidoEm são datas reais; prazoPrevisto é sempre previsão (nunca confirmação do fornecedor).
// Auditoria: AppConfig.registrosMovimentoExterno (chave JSON nova, aditiva) com quem, quando (Brasília) e o payload.
import { mudarConfig } from "./configAtomica"
import { somarDiasUteis } from "./diasUteis"
import { brasilia } from "./lancarDespesaExterno"
import { PRODUCAO_PADRAO, SERVICOS, type ConfigProducao, type EtapaPedido, type MovimentoFornecedor, type Servico } from "./producao"

export type RegistroMovimento = {
  autor: string; em: string; emIso: string
  operacao: "enviar" | "receber"; movimentoId: string; pedidoKey: string; loteNumero?: string; etapa: EtapaPedido
  enviadoEm?: string; recebidoEm?: string; prazoPrevisto?: string
}
export type ResultadoMovimento =
  | { ok: true; resultado: string; movimento: MovimentoFornecedor; registro: RegistroMovimento; prazoPrevistoCadastral?: boolean }
  | { ok: false; status: 400 | 404 | 409; erro: string }

export const podeRegistrarMovimento = (diretor: string) => diretor === "cto" || diretor === "coo"

const ETAPAS: EtapaPedido[] = ["arte", "impressao", "acabamento", "corteVinco", "colagem", "outro"]
const texto = (v: unknown) => typeof v === "string" ? v.trim() : ""
const dataValida = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T12:00:00")) && new Date(s + "T12:00:00").toISOString().slice(0, 10) === s
const hojeBr = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })

// Chave do pedido: o que a tela grava em pedidoKey ("lote-<id>" ou "card-<id>"). loteNumero casa com o rótulo do movimento.
function doPedido(m: MovimentoFornecedor, pedidoKey: string, lote: string) {
  if (pedidoKey) return m.pedidoKey === pedidoKey
  return !!lote && (m.pedidoKey === lote || m.pedidoKey === `lote-${lote}` || m.pedidoLabel.split(/\s+/).includes(lote) || m.pedidoLabel.startsWith(`${lote} `) || m.pedidoLabel === lote)
}

export async function registrarMovimentoExterno(diretor: string, b: Record<string, unknown>): Promise<ResultadoMovimento> {
  const operacao = b.operacao
  if (operacao !== "receber" && operacao !== "enviar") return { ok: false, status: 400, erro: "operacao: 'receber' ou 'enviar'." }
  const id = texto(b.id), pedidoKey = texto(b.pedidoKey), lote = texto(b.loteNumero)
  const etapa = texto(b.etapa) as EtapaPedido
  if (etapa && !ETAPAS.includes(etapa)) return { ok: false, status: 400, erro: `etapa: ${ETAPAS.join(", ")}.` }

  if (operacao === "receber") {
    const recebidoEm = texto(b.recebidoEm)
    if (!dataValida(recebidoEm)) return { ok: false, status: 400, erro: "recebidoEm: data real AAAA-MM-DD obrigatória." }
    if (recebidoEm > hojeBr()) return { ok: false, status: 400, erro: "recebidoEm: não pode ser data futura (é a data real do recebimento)." }
    if (!id && !((pedidoKey || lote) && etapa)) return { ok: false, status: 400, erro: "id do movimento, ou loteNumero/pedidoKey + etapa." }
    let erro: ResultadoMovimento | null = null
    let achado: MovimentoFornecedor | null = null
    let registro: RegistroMovimento | null = null
    let igual = false
    const agora = new Date()
    await mudarConfig<{ producao?: ConfigProducao; registrosMovimentoExterno?: RegistroMovimento[] }>(cfg => {
      erro = null; achado = null; registro = null; igual = false
      const movs = cfg.producao?.movimentos ?? []
      const cand = id ? movs.filter(m => m.id === id) : movs.filter(m => doPedido(m, pedidoKey, lote) && m.etapa === etapa)
      if (!cand.length) { erro = { ok: false, status: 404, erro: id ? `Movimento ${id} não encontrado.` : "Movimento não encontrado para esse pedido e etapa." }; return null }
      const abertos = cand.filter(m => !m.recebidoEm)
      const m = abertos[0] ?? cand.filter(x => x.recebidoEm === recebidoEm)[0] ?? cand[cand.length - 1]
      if (!id && abertos.length > 1) { erro = { ok: false, status: 409, erro: "Mais de um movimento aberto nessa etapa: informe o id." }; return null }
      if (m.recebidoEm) {
        if (m.recebidoEm === recebidoEm) { achado = m; igual = true; return null }   // idempotente
        erro = { ok: false, status: 409, erro: `Movimento ${m.id} já foi recebido em ${m.recebidoEm}; nada foi alterado.` }; return null
      }
      if (recebidoEm < m.enviadoEm) { erro = { ok: false, status: 400, erro: `recebidoEm (${recebidoEm}) é anterior ao envio (${m.enviadoEm}).` }; return null }
      achado = { ...m, recebidoEm }
      registro = { autor: diretor, em: brasilia(agora), emIso: agora.toISOString(), operacao: "receber", movimentoId: m.id, pedidoKey: m.pedidoKey, ...(lote ? { loteNumero: lote } : {}), etapa: m.etapa, enviadoEm: m.enviadoEm, recebidoEm }
      return { producao: { ...cfg.producao, movimentos: movs.map(x => x.id === m.id ? achado! : x) }, registrosMovimentoExterno: [...(cfg.registrosMovimentoExterno ?? []), registro] }
    })
    if (erro) return erro
    const mov = achado as MovimentoFornecedor | null
    if (!mov) return { ok: false, status: 404, erro: "Movimento não encontrado." }
    const reg = (registro as RegistroMovimento | null) ?? { autor: diretor, em: brasilia(agora), emIso: agora.toISOString(), operacao: "receber" as const, movimentoId: mov.id, pedidoKey: mov.pedidoKey, etapa: mov.etapa, enviadoEm: mov.enviadoEm, recebidoEm }
    return { ok: true, resultado: igual ? `Movimento ${mov.id} já estava recebido em ${recebidoEm} (nada mudou).` : `Movimento ${mov.id} (${mov.pedidoLabel}, ${mov.etapa}) recebido em ${recebidoEm}.`, movimento: mov, registro: reg }
  }

  // enviar
  const fornecedorId = texto(b.fornecedorId)
  const enviadoEm = texto(b.enviadoEm)
  if (!pedidoKey && !lote) return { ok: false, status: 400, erro: "loteNumero ou pedidoKey: obrigatório." }
  if (!fornecedorId) return { ok: false, status: 400, erro: "fornecedorId: obrigatório." }
  if (!etapa) return { ok: false, status: 400, erro: `etapa: ${ETAPAS.join(", ")}.` }
  if (!dataValida(enviadoEm)) return { ok: false, status: 400, erro: "enviadoEm: data real AAAA-MM-DD obrigatória." }
  if (enviadoEm > hojeBr()) return { ok: false, status: 400, erro: "enviadoEm: não pode ser data futura (é a data real do envio)." }
  const ids = SERVICOS.map(s => s.id)
  const servicos = Array.isArray(b.servicos) ? b.servicos as unknown[] : []
  if (!servicos.length || servicos.some(s => typeof s !== "string" || !ids.includes(s as Servico))) return { ok: false, status: 400, erro: `servicos: lista com ${ids.join(", ")}.` }
  const prazoInformado = texto(b.prazoPrevisto)
  if (prazoInformado && !dataValida(prazoInformado)) return { ok: false, status: 400, erro: "prazoPrevisto: data prevista AAAA-MM-DD (opcional)." }
  if (prazoInformado && prazoInformado < enviadoEm) return { ok: false, status: 400, erro: "prazoPrevisto: anterior ao envio." }

  let erro: ResultadoMovimento | null = null
  let criado: MovimentoFornecedor | null = null
  let registro: RegistroMovimento | null = null
  let cadastral = false
  const agora = new Date()
  await mudarConfig<{ producao?: ConfigProducao; registrosMovimentoExterno?: RegistroMovimento[] }>(cfg => {
    erro = null; criado = null; registro = null; cadastral = false
    const prod = cfg.producao
    const forn = (prod?.fornecedores ?? PRODUCAO_PADRAO.fornecedores).find(f => f.id === fornecedorId && f.ativo)
    if (!forn) { erro = { ok: false, status: 404, erro: `Fornecedor ${fornecedorId} não encontrado ou inativo em AppConfig.producao.fornecedores.` }; return null }
    const movs = prod?.movimentos ?? []
    const chave = pedidoKey || (lote.startsWith("lote-") ? lote : `lote-${lote}`)
    const aberto = movs.find(m => !m.recebidoEm && m.etapa === etapa && (m.pedidoKey === chave || doPedido(m, pedidoKey, lote)))
    if (aberto) { erro = { ok: false, status: 409, erro: `Já existe movimento aberto da etapa ${etapa} nesse pedido (${aberto.id}); nada foi gravado.` }; return null }
    const prazoPrevisto = prazoInformado || (forn.prazoDias ? somarDiasUteis(enviadoEm, forn.prazoDias) : undefined)
    cadastral = !prazoInformado && !!prazoPrevisto
    const idNovo = `ext-${chave}-${etapa}-${enviadoEm}`
    const rotulo = texto(b.pedidoLabel) || (lote ? `Lote ${lote}` : chave)
    criado = { id: idNovo, pedidoKey: chave, pedidoLabel: rotulo.slice(0, 120), fornecedorId, etapa, servicos: servicos as Servico[], enviadoEm, ...(prazoPrevisto ? { prazoPrevisto } : {}) }
    registro = { autor: diretor, em: brasilia(agora), emIso: agora.toISOString(), operacao: "enviar", movimentoId: idNovo, pedidoKey: chave, ...(lote ? { loteNumero: lote } : {}), etapa, enviadoEm, ...(prazoPrevisto ? { prazoPrevisto } : {}) }
    return { producao: { ...prod, movimentos: [...movs, criado] }, registrosMovimentoExterno: [...(cfg.registrosMovimentoExterno ?? []), registro] }
  })
  if (erro) return erro
  const mov = criado as MovimentoFornecedor | null, reg = registro as RegistroMovimento | null
  if (!mov || !reg) return { ok: false, status: 409, erro: "Não foi possível gravar o movimento." }
  const aviso = cadastral ? ` prazoPrevisto ${mov.prazoPrevisto} é PREVISÃO cadastral do fornecedor (prazoDias), não data combinada nem confirmada por ele.` : mov.prazoPrevisto ? ` prazoPrevisto ${mov.prazoPrevisto} é previsão informada, não confirmada pelo fornecedor.` : ""
  return { ok: true, resultado: `Movimento ${mov.id} aberto: enviado em ${enviadoEm}.${aviso}`, movimento: mov, registro: reg, ...(cadastral ? { prazoPrevistoCadastral: true } : {}) }
}
