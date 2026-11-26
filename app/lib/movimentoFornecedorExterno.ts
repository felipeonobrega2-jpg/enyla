// Porta externa, ação registrar_movimento_fornecedor (só COO e CTO): grava em AppConfig.producao.movimentos o mesmo registro
// da ferramenta "recebi e enviei materiais" da tela Fornecedores, para os prazos medidos passarem a contar.
// `enviado` abre um movimento (enviadoEm); `recebido` fecha o envio aberto do mesmo lote+fornecedor+etapa (recebidoEm).
// Não manda nada a cliente nem a fornecedor, não mexe em custo, cobrança ou pagamento e não apaga nada.
import { supabase } from "./supabase"
import { DIRETORES } from "./diretoria"
import { lerCampos, mudarConfig } from "./configAtomica"
import { normalizarProducao, type ConfigProducao, type EtapaPedido, type MovimentoFornecedor } from "./producao"
import { somarDias } from "./marketing"

export const PODEM_REGISTRAR_MOVIMENTO = ["coo", "cto"]
export const ETAPAS_MOVIMENTO: EtapaPedido[] = ["arte", "impressao", "acabamento", "corteVinco", "colagem", "outro"]

export const AJUDA_MOVIMENTO_FORNECEDOR = "SÓ AS CHAVES DO COO E DO CTO (as outras recebem 403). Registra que um material foi ENVIADO a um fornecedor ou RECEBIDO dele (o mesmo registro de 'recebi e enviei materiais' da tela Fornecedores), para os prazos medidos contarem. Campos: numero (ORC-...) ou loteNumero; fornecedorId (id em ?o=prazos_fornecedores); etapa arte|impressao|acabamento|corteVinco|colagem|outro; tipo 'enviado'|'recebido'; data AAAA-MM-DD (pode ser no passado, nunca no futuro; Brasília); obs opcional (até 300 caracteres). 'enviado' abre o registro; 'recebido' fecha o envio aberto do mesmo lote+fornecedor+etapa (sem envio aberto: 409; data anterior ao envio: 400). Duplicata do mesmo lote+fornecedor+etapa+tipo+data: 409 e nada é gravado. Registra no Tracking quem gravou. Não manda nada a cliente nem a fornecedor, não mexe em custo, cobrança ou pagamento e não apaga nada. 404 se o pedido ou o fornecedor não existe. Resposta: { ok, resultado, movimento }"

export type ResultadoMovimento = { ok: true; resultado: string; movimento: MovimentoFornecedor } | { ok: false; status: 400 | 404 | 409 | 500; erro: string }

const hojeBrasilia = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "")

export function dataValida(d: string, hoje = hojeBrasilia()): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(d)) || new Date(d + "T00:00:00Z").toISOString().slice(0, 10) !== d) return "data: AAAA-MM-DD válida."
  if (d > hoje) return "data: não pode ser no futuro."
  return null
}

export async function registrarMovimentoFornecedor(diretor: string, b: Record<string, unknown>): Promise<ResultadoMovimento> {
  if (!PODEM_REGISTRAR_MOVIMENTO.includes(diretor)) return { ok: false, status: 400, erro: "registrar_movimento_fornecedor é só para as chaves do COO e do CTO." }
  const numero = texto(b.numero), lote = texto(b.loteNumero)
  if (!numero && !lote) return { ok: false, status: 400, erro: "numero (ORC-...) ou loteNumero: obrigatório." }
  const fornecedorId = texto(b.fornecedorId)
  if (!fornecedorId) return { ok: false, status: 400, erro: "fornecedorId: obrigatório." }
  const etapa = b.etapa as EtapaPedido
  if (!ETAPAS_MOVIMENTO.includes(etapa)) return { ok: false, status: 400, erro: `etapa: ${ETAPAS_MOVIMENTO.join(" | ")}.` }
  const tipo = b.tipo
  if (tipo !== "enviado" && tipo !== "recebido") return { ok: false, status: 400, erro: "tipo: 'enviado' ou 'recebido'." }
  const data = texto(b.data)
  const erroData = dataValida(data)
  if (erroData) return { ok: false, status: 400, erro: erroData }
  const obs = texto(b.obs)
  if (obs.length > 300) return { ok: false, status: 400, erro: "obs: no máximo 300 caracteres." }

  const { data: achados } = await supabase.from("KanbanCard").select("id, numero, loteId, loteNumero, nomeCliente, coluna").eq(numero ? "numero" : "loteNumero", numero || lote)
  const cards = (achados ?? []) as { id: string; numero: string; loteId?: string | null; loteNumero?: string | null; nomeCliente?: string; coluna: number }[]
  const card = cards[0]
  if (!card) return { ok: false, status: 404, erro: `Pedido ${numero || lote} não encontrado.` }
  const pedidoKey = card.loteId ? `lote-${card.loteId}` : `card-${card.id}`
  const pedidoLabel = `${card.loteNumero ?? card.numero} · ${card.nomeCliente ?? ""}`.trim()

  const { producao: bruta } = await lerCampos<{ producao?: Partial<ConfigProducao> }>(["producao"])
  const forn = normalizarProducao(bruta).fornecedores.find(f => f.id === fornecedorId)
  if (!forn) return { ok: false, status: 404, erro: `Fornecedor ${fornecedorId} não encontrado.` }

  const por = DIRETORES.find(d => d.id === diretor)?.nome ?? diretor
  let resposta: ResultadoMovimento | null = null
  const agora = new Date().toISOString()
  await mudarConfig((d: { producao?: Partial<ConfigProducao> }) => {
    const prod = normalizarProducao(d.producao)
    const doPedido = prod.movimentos.filter(m => m.pedidoKey === pedidoKey && m.fornecedorId === fornecedorId && m.etapa === etapa)
    if (tipo === "enviado") {
      if (doPedido.some(m => m.enviadoEm === data)) { resposta = { ok: false, status: 409, erro: `Duplicata: já há envio de ${pedidoLabel} a ${forn.nome} (${etapa}) em ${data}.` }; return null }
      const mov: MovimentoFornecedor = {
        id: Math.random().toString(36).slice(2, 10) + Date.now().toString(36), pedidoKey, pedidoLabel, fornecedorId, etapa, enviadoEm: data,
        prazoPrevisto: forn.prazoDias ? somarDias(data, forn.prazoDias) : undefined,
        registradoPor: por, registradoEm: agora, ...(obs ? { obs } : {}),
      }
      resposta = { ok: true, resultado: "", movimento: mov }
      return { producao: { ...prod, movimentos: [...prod.movimentos, mov] } }
    }
    if (doPedido.some(m => m.recebidoEm === data)) { resposta = { ok: false, status: 409, erro: `Duplicata: o recebimento de ${pedidoLabel} de ${forn.nome} (${etapa}) em ${data} já está registrado.` }; return null }
    const aberto = doPedido.filter(m => !m.recebidoEm).sort((a, c) => a.enviadoEm.localeCompare(c.enviadoEm))[0]
    if (!aberto) { resposta = { ok: false, status: 409, erro: `Não há envio aberto de ${pedidoLabel} a ${forn.nome} (${etapa}). Registre o envio antes.` }; return null }
    if (data < aberto.enviadoEm) { resposta = { ok: false, status: 400, erro: `data: anterior ao envio (${aberto.enviadoEm}).` }; return null }
    const mov: MovimentoFornecedor = { ...aberto, recebidoEm: data, ...(obs ? { obs: [aberto.obs, obs].filter(Boolean).join(" | ") } : {}) }
    resposta = { ok: true, resultado: "", movimento: mov }
    return { producao: { ...prod, movimentos: prod.movimentos.map(m => (m.id === aberto.id ? mov : m)) } }
  })
  const r = resposta as ResultadoMovimento | null
  if (!r) return { ok: false, status: 500, erro: "Não foi possível gravar o movimento." }
  if (!r.ok) return r

  const verbo = tipo === "enviado" ? "enviado a" : "recebido de"
  const resultado = `${pedidoLabel}: material ${verbo} ${forn.nome} (${etapa}) em ${data}.`
  // Tracking: quem gravou (não mexe na coluna)
  const { data: tracking } = await supabase.from("Tracking").select("*").eq("numero", card.numero).maybeSingle()
  if (tracking) {
    const antigas = (tracking.etapas ?? []) as unknown[]
    await supabase.from("Tracking").update({
      etapas: [...antigas, { coluna: card.coluna, nome: "Fornecedor", tipo: "observacao", dataHora: new Date().toLocaleString("pt-BR"), por, detalhe: `${resultado} Registrado por ${por}.${obs ? ` ${obs}` : ""}` }],
    }).eq("numero", card.numero)
  }
  return { ok: true, resultado, movimento: r.movimento }
}
