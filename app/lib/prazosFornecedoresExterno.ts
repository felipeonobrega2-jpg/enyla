// Leitura ?o=prazos_fornecedores na porta externa (só as chaves do COO e do CTO). SÓ LÊ: não grava, não envia, não apaga.
// Mostra o prazo CADASTRAL dos fornecedores de AppConfig.producao (prazoDias e, se existir, prazosPorEtapa), os padrões por
// etapa e o prazo de entrega padrão. Não é data confirmada pelo fornecedor. Sem e-mail, telefone, endereço, contato nem preço.
import { lerCampos } from "./configAtomica"
import { normalizarProducao, prazoCadastral, normalizarEstadoPrazo, type ConfigProducao } from "./producao"

export const PODEM_LER_PRAZOS = ["coo", "cto"]

export const AJUDA_PRAZOS_FORNECEDORES = "SÓ AS CHAVES DO COO E DO CTO (as outras recebem 403): prazos CADASTRAIS dos fornecedores de produção (Fornecedores → Cadastro e preços), em dias úteis. { aviso, fornecedores: [{ id, nome, ativo, prazoDias, confirmado, origem, rotulo, servicos, prazosPorEtapa?, estadoPorEtapa? }], padroes (id do fornecedor padrão por etapa), porEtapa: [{ etapa, fornecedorId, fornecedor, prazoCadastralDias, deOnde: 'etapa'|'fornecedor', confirmado, origem, rotulo }], prazoEntregaPadraoDias }. Cada prazo traz confirmado (true/false) e origem ('medido'|'confirmado_fornecedor'|'sem_dado'); os prazoDias antigos foram preenchidos sem critério e valem como confirmado=false, origem='sem_dado' (rótulo 'não confirmado'). Não é data confirmada pelo fornecedor (essa é do lote). Só leitura; sem e-mail, telefone, endereço nem preço"

const ETAPAS = ["arte", "acabamento", "hotStamping", "corteVinco", "colagem"] as const

const rotuloDe = (confirmado: boolean) => confirmado ? "confirmado" : "não confirmado"

export function montarPrazosFornecedores(producao: ConfigProducao) {
  const fornecedores = producao.fornecedores.map(f => {
    const g = prazoCadastral(f)
    const pe = f.prazosPorEtapa
    return {
      id: f.id, nome: f.nome, ativo: f.ativo, prazoDias: f.prazoDias, confirmado: g.estado.confirmado, origem: g.estado.origem, rotulo: rotuloDe(g.estado.confirmado),
      servicos: Object.keys(f.servicos ?? {}),
      ...(pe ? {
        prazosPorEtapa: pe,
        estadoPorEtapa: Object.fromEntries(Object.keys(pe).map(et => { const e = normalizarEstadoPrazo(f.prazosPorEtapaEstado?.[et]); return [et, { ...e, rotulo: rotuloDe(e.confirmado) }] })),
      } : {}),
    }
  })
  const padroes = producao.padroes as Record<string, string | undefined>
  const porEtapa = ETAPAS.flatMap(etapa => {
    const id = padroes[etapa]
    const f = id ? producao.fornecedores.find(x => x.id === id) : undefined
    if (!id || !f) return []
    const c = prazoCadastral(f, etapa)
    return [{ etapa, fornecedorId: f.id, fornecedor: f.nome, prazoCadastralDias: c.dias, deOnde: c.deEtapa ? "etapa" as const : "fornecedor" as const, confirmado: c.estado.confirmado, origem: c.estado.origem, rotulo: rotuloDe(c.estado.confirmado) }]
  })
  return {
    aviso: "Prazo cadastral em dias úteis, não data confirmada pelo fornecedor. A data confirmada é do lote. Prazo com confirmado=false (rótulo 'não confirmado') ainda não foi combinado nem medido: os prazoDias antigos foram preenchidos sem critério.",
    fornecedores, padroes: producao.padroes, porEtapa, prazoEntregaPadraoDias: producao.prazoEntregaPadraoDias,
  }
}

export async function lerPrazosFornecedores(diretor: string): Promise<{ status: number; corpo: Record<string, unknown> }> {
  if (!PODEM_LER_PRAZOS.includes(diretor)) return { status: 403, corpo: { erro: "?o=prazos_fornecedores é só para as chaves do COO e do CTO." } }
  const { producao } = await lerCampos<{ producao?: Partial<ConfigProducao> }>(["producao"])
  return { status: 200, corpo: montarPrazosFornecedores(normalizarProducao(producao)) }
}
