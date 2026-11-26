// Leitura ?o=prazos_fornecedores na porta externa (só as chaves do COO e do CTO). SÓ LÊ: não grava, não envia, não apaga.
// Mostra o prazo CADASTRAL dos fornecedores de AppConfig.producao (prazoDias e, se existir, prazosPorEtapa), os padrões por
// etapa e o prazo de entrega padrão. Não é data confirmada pelo fornecedor. Sem e-mail, telefone, endereço, contato nem preço.
import { lerCampos } from "./configAtomica"
import { normalizarProducao, diasNoFornecedor, type ConfigProducao, type FornecedorProducao, type MovimentoFornecedor, type Servico } from "./producao"
import { estatistica } from "./prazoProducao"

export const PODEM_LER_PRAZOS = ["coo", "cto"]

export const AJUDA_PRAZOS_FORNECEDORES = "SÓ AS CHAVES DO COO E DO CTO (as outras recebem 403): prazos CADASTRAIS dos fornecedores de produção (Fornecedores → Cadastro e preços), em dias úteis. { aviso, fornecedores: [{ id, nome, ativo, prazoDias, servicos, prazosPorEtapa? }], padroes (id do fornecedor padrão por etapa), porEtapa: [{ etapas, fornecedorId, fornecedor, origem: 'medido'|'aprendendo', n, minimoParaMedir, prazoMedianoDias|null, minDias|null, maxDias|null }], previsaoLote: { medido: { medianaDias, minDias, maxDias, etapas }, faltamMedir: [etapas] }, prazoEntregaPadraoDias }. O prazo de cada etapa vem SÓ do registro de recebi e enviei (mediana, a partir de MINIMO_LOTES_MEDIDOS lotes); o número do cadastro não entra na previsão. Não é data confirmada pelo fornecedor (essa é do lote). Só leitura; sem e-mail, telefone, endereço nem preço"

const ETAPAS = ["arte", "acabamento", "hotStamping", "corteVinco", "colagem"] as const
export type EtapaPrazo = typeof ETAPAS[number]

/** Mínimo de lotes medidos (envio com retorno) para a etapa deixar de ser "aprendendo". O COO pode mudar este número. */
export const MINIMO_LOTES_MEDIDOS = 3

type PorEtapa = Partial<Record<string, number>>
const prazosDaEtapa = (f: FornecedorProducao): PorEtapa | undefined => (f as FornecedorProducao & { prazosPorEtapa?: PorEtapa }).prazosPorEtapa

const ETAPA_DO_SERVICO: Partial<Record<Servico, EtapaPrazo>> = { arte: "arte", fechamento: "arte", laminacao: "acabamento", verniz: "acabamento", hotStamping: "hotStamping", corteVinco: "corteVinco", colagem: "colagem" }

// Etapas (da previsão) que um envio cobriu. Envio antigo, sem serviços, usa a etapa do movimento.
function etapasDoMovimento(m: MovimentoFornecedor): EtapaPrazo[] {
  const es = m.servicos?.length
    ? m.servicos.map(s => ETAPA_DO_SERVICO[s]).filter((e): e is EtapaPrazo => !!e)
    : (ETAPAS as readonly string[]).includes(m.etapa) ? [m.etapa as EtapaPrazo] : []
  return ETAPAS.filter(e => es.includes(e))
}

export type PrazoEtapa = {
  etapas: EtapaPrazo[]; fornecedorId: string; fornecedor: string
  origem: "medido" | "aprendendo"; n: number; minimoParaMedir: number
  prazoMedianoDias: number | null; minDias: number | null; maxDias: number | null
}

/**
 * Prazo de uma etapa (ou de etapas seguidas no mesmo fornecedor) só pelo registro de recebi e enviei:
 * movimentos desse fornecedor, com retorno, cujo envio cobriu exatamente essas etapas. Com menos de
 * MINIMO_LOTES_MEDIDOS fica "aprendendo" e mostra quantos lotes já foram medidos. Nunca usa o cadastro.
 */
export function prazoDaEtapa(etapas: EtapaPrazo | EtapaPrazo[], fornecedor: Pick<FornecedorProducao, "id" | "nome">, movimentos: MovimentoFornecedor[], minimo = MINIMO_LOTES_MEDIDOS): PrazoEtapa {
  const alvo = ETAPAS.filter(e => (Array.isArray(etapas) ? etapas : [etapas]).includes(e))
  const dias = movimentos
    .filter(m => m.fornecedorId === fornecedor.id && m.recebidoEm)
    .filter(m => { const es = etapasDoMovimento(m); return es.length === alvo.length && es.every((e, i) => e === alvo[i]) })
    .map(m => diasNoFornecedor(m))
  const est = estatistica(dias)
  const medido = dias.length >= minimo && est
  return {
    etapas: alvo, fornecedorId: fornecedor.id, fornecedor: fornecedor.nome,
    origem: medido ? "medido" : "aprendendo", n: dias.length, minimoParaMedir: minimo,
    prazoMedianoDias: medido && est ? est.mediana : null, minDias: medido && est ? est.min : null, maxDias: medido && est ? est.max : null,
  }
}

/** Etapas seguidas no mesmo fornecedor: usa o prazo medido do serviço combinado; sem ele, mostra cada etapa. */
export function previsaoDoLote(producao: ConfigProducao, minimo = MINIMO_LOTES_MEDIDOS) {
  const padroes = producao.padroes as Record<string, string | undefined>
  const itens = ETAPAS.flatMap(etapa => {
    const f = padroes[etapa] ? producao.fornecedores.find(x => x.id === padroes[etapa]) : undefined
    return f ? [{ etapa, f }] : []
  })
  const grupos: { etapas: EtapaPrazo[]; f: FornecedorProducao }[] = []
  for (const it of itens) {
    const ult = grupos[grupos.length - 1]
    if (ult && ult.f.id === it.f.id) ult.etapas.push(it.etapa); else grupos.push({ etapas: [it.etapa], f: it.f })
  }
  // Dentro do grupo, pega o trecho seguido mais longo que já tem prazo medido do serviço combinado; senão, a etapa sozinha.
  const porEtapa = grupos.flatMap(g => {
    const out: PrazoEtapa[] = []
    for (let i = 0; i < g.etapas.length;) {
      let achou: PrazoEtapa | null = null
      for (let len = g.etapas.length - i; len >= 2 && !achou; len--) {
        const c = prazoDaEtapa(g.etapas.slice(i, i + len), g.f, producao.movimentos, minimo)
        if (c.origem === "medido") achou = c
      }
      const p = achou ?? prazoDaEtapa(g.etapas[i], g.f, producao.movimentos, minimo)
      out.push(p); i += p.etapas.length
    }
    return out
  })
  const medidas = porEtapa.filter(p => p.origem === "medido")
  const soma = (k: "prazoMedianoDias" | "minDias" | "maxDias") => medidas.reduce((s, p) => s + (p[k] ?? 0), 0)
  return {
    porEtapa,
    previsaoLote: {
      medido: { medianaDias: soma("prazoMedianoDias"), minDias: soma("minDias"), maxDias: soma("maxDias"), etapas: medidas.flatMap(p => p.etapas) },
      faltamMedir: porEtapa.filter(p => p.origem !== "medido").flatMap(p => p.etapas),
    },
  }
}

export function montarPrazosFornecedores(producao: ConfigProducao) {
  const fornecedores = producao.fornecedores.map(f => {
    const pe = prazosDaEtapa(f)
    return { id: f.id, nome: f.nome, ativo: f.ativo, prazoDias: f.prazoDias, servicos: Object.keys(f.servicos ?? {}), ...(pe ? { prazosPorEtapa: pe } : {}) }
  })
  const { porEtapa, previsaoLote } = previsaoDoLote(producao)
  return {
    aviso: "Prazo de cada etapa só do registro de recebi e enviei (mediana, dias úteis). Etapa com poucos lotes fica 'aprendendo' e não entra no total; o prazo do cadastro não é usado. Não é data confirmada pelo fornecedor. A data confirmada é do lote.",
    fornecedores, padroes: producao.padroes, porEtapa, previsaoLote, prazoEntregaPadraoDias: producao.prazoEntregaPadraoDias,
  }
}

export async function lerPrazosFornecedores(diretor: string): Promise<{ status: number; corpo: Record<string, unknown> }> {
  if (!PODEM_LER_PRAZOS.includes(diretor)) return { status: 403, corpo: { erro: "?o=prazos_fornecedores é só para as chaves do COO e do CTO." } }
  const { producao } = await lerCampos<{ producao?: Partial<ConfigProducao> }>(["producao"])
  return { status: 200, corpo: montarPrazosFornecedores(normalizarProducao(producao)) }
}
