// Leitura ?o=prazos_fornecedores na porta externa (só as chaves do COO e do CTO). SÓ LÊ: não grava, não envia, não apaga.
// Mostra o prazo CADASTRAL dos fornecedores de AppConfig.producao (prazoDias e, se existir, prazosPorEtapa), os padrões por
// etapa e o prazo de entrega padrão. Não é data confirmada pelo fornecedor. Sem e-mail, telefone, endereço, contato nem preço.
import { lerCampos } from "./configAtomica"
import { normalizarProducao, diasNoFornecedor, type ConfigProducao, type FornecedorProducao, type MovimentoFornecedor } from "./producao"

export const PODEM_LER_PRAZOS = ["coo", "cto"]

export const AJUDA_PRAZOS_FORNECEDORES = "SÓ AS CHAVES DO COO E DO CTO (as outras recebem 403): prazos CADASTRAIS dos fornecedores de produção (Fornecedores → Cadastro e preços), em dias úteis. { aviso, fornecedores: [{ id, nome, ativo, prazoDias, servicos, prazosPorEtapa? }], padroes (id do fornecedor padrão por etapa), porEtapa: [{ etapa, fornecedorId, fornecedor, prazoDias, prazoCadastralDias, origem: 'medido'|'cadastral'|'combinado', n?, aConfirmar }], previsaoTotal: { medidoDias, aConfirmarDias, totalDias }, prazoEntregaPadraoDias }. 'medido' = mediana de 3+ retornos registrados; o resto vem do cadastro e fica a confirmar. Prazo único de serviço combinado: prazosPorEtapa['corteVinco+colagem']. Não é data confirmada pelo fornecedor (essa é do lote). Só leitura; sem e-mail, telefone, endereço nem preço"

const ETAPAS = ["arte", "acabamento", "hotStamping", "corteVinco", "colagem"] as const

const MIN_MEDIDOS = 3

type PorEtapa = Partial<Record<string, number>>
type FornecedorComPrazos = FornecedorProducao & { prazosPorEtapa?: PorEtapa }
const prazosDaEtapa = (f: FornecedorProducao): PorEtapa | undefined => (f as FornecedorComPrazos).prazosPorEtapa

export type PrazoEtapa =
  | { dias: number; origem: "medido"; n: number; aConfirmar: false }
  | { dias: number; origem: "cadastral"; fonte: "etapa" | "fornecedor"; aConfirmar: true }

const mediana = (v: number[]) => {
  const o = [...v].sort((a, b) => a - b), m = Math.floor(o.length / 2)
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2
}

// Pura. Com 3 ou mais movimentos COM RETORNO daquela etapa e daquele fornecedor (mesmos dados da tela Fornecedores,
// diasNoFornecedor) usa a mediana medida. Senão usa o cadastro (prazosPorEtapa, depois prazoDias), marcado a confirmar.
export function prazoDaEtapa(etapa: string, fornecedor: FornecedorProducao, movimentos: MovimentoFornecedor[] = []): PrazoEtapa {
  const dias = movimentos.filter(m => m.fornecedorId === fornecedor.id && m.etapa === etapa && m.recebidoEm).map(m => diasNoFornecedor(m))
  if (dias.length >= MIN_MEDIDOS) return { dias: mediana(dias), origem: "medido", n: dias.length, aConfirmar: false }
  const da = prazosDaEtapa(fornecedor)?.[etapa]
  return da != null
    ? { dias: da, origem: "cadastral", fonte: "etapa", aConfirmar: true }
    : { dias: fornecedor.prazoDias, origem: "cadastral", fonte: "fornecedor", aConfirmar: true }
}

// Chave do prazo único de serviço combinado no cadastro: etapas seguidas na ordem da produção, ligadas por "+"
// (ex.: prazosPorEtapa["corteVinco+colagem"] = 5). Nada é gravado aqui; o cadastro é ajustado em outro PR.
export const chaveCombinada = (etapas: string[]) => etapas.join("+")

export type LinhaPorEtapa = {
  etapa: string; fornecedorId: string; fornecedor: string
  prazoDias: number; prazoCadastralDias: number
  origem: "medido" | "cadastral" | "combinado"; n?: number; aConfirmar: boolean
  fonteCadastral?: "etapa" | "fornecedor" | "combinado"
  combinadaCom?: string[]   // etapas cobertas pelo mesmo prazo único (só na primeira; as demais entram com 0 dia)
}

export function montarPorEtapa(producao: ConfigProducao): LinhaPorEtapa[] {
  const padroes = producao.padroes as Record<string, string | undefined>
  const base = ETAPAS.flatMap(etapa => {
    const id = padroes[etapa]
    const f = id ? producao.fornecedores.find(x => x.id === id) : undefined
    return f ? [{ etapa: etapa as string, f, p: prazoDaEtapa(etapa, f, producao.movimentos) }] : []
  })
  const linhas: LinhaPorEtapa[] = []
  for (let i = 0; i < base.length;) {
    let j = i + 1
    while (j < base.length && base[j].f.id === base[i].f.id) j++
    const grupo = base.slice(i, j)
    // Serviço combinado só vale quando as etapas seguidas no mesmo fornecedor são todas cadastrais (sem medida própria).
    const cadastrais = grupo.every(g => g.p.origem === "cadastral")
    const unico = cadastrais && grupo.length > 1 ? prazosDaEtapa(grupo[0].f)?.[chaveCombinada(grupo.map(g => g.etapa))] : undefined
    grupo.forEach((g, k) => {
      const comum = { etapa: g.etapa, fornecedorId: g.f.id, fornecedor: g.f.nome }
      if (unico != null) {
        const dias = k === 0 ? unico : 0
        linhas.push({ ...comum, prazoDias: dias, prazoCadastralDias: dias, origem: "combinado", aConfirmar: true, fonteCadastral: "combinado", combinadaCom: grupo.map(x => x.etapa) })
      } else if (g.p.origem === "medido") {
        linhas.push({ ...comum, prazoDias: g.p.dias, prazoCadastralDias: g.p.dias, origem: "medido", n: g.p.n, aConfirmar: false })
      } else {
        linhas.push({ ...comum, prazoDias: g.p.dias, prazoCadastralDias: g.p.dias, origem: "cadastral", aConfirmar: true, fonteCadastral: g.p.fonte })
      }
    })
    i = j
  }
  return linhas
}

export function totalPrevisto(linhas: LinhaPorEtapa[]) {
  const medidoDias = linhas.filter(l => !l.aConfirmar).reduce((s, l) => s + l.prazoDias, 0)
  const aConfirmarDias = linhas.filter(l => l.aConfirmar).reduce((s, l) => s + l.prazoDias, 0)
  const duplas = linhas.some(l => l.aConfirmar && l.origem === "cadastral" && linhas.some(o => o !== l && o.aConfirmar && o.origem === "cadastral" && o.fornecedorId === l.fornecedorId))
  return {
    medidoDias, aConfirmarDias, totalDias: medidoDias + aConfirmarDias,
    ...(duplas ? { avisoMesmoFornecedor: "Há etapas seguidas no mesmo fornecedor sem prazo único cadastrado; a parte a confirmar soma os prazos cheios de cada uma e pode estar acima do real." } : {}),
  }
}

export function montarPrazosFornecedores(producao: ConfigProducao) {
  const fornecedores = producao.fornecedores.map(f => {
    const pe = prazosDaEtapa(f)
    return { id: f.id, nome: f.nome, ativo: f.ativo, prazoDias: f.prazoDias, servicos: Object.keys(f.servicos ?? {}), ...(pe ? { prazosPorEtapa: pe } : {}) }
  })
  const porEtapa = montarPorEtapa(producao)
  return {
    aviso: "Prazo em dias úteis, não data confirmada pelo fornecedor (essa é do lote). 'medido' = mediana de 3 ou mais retornos registrados; 'cadastral' e 'combinado' = do cadastro, a confirmar.",
    fornecedores, padroes: producao.padroes, porEtapa, previsaoTotal: totalPrevisto(porEtapa), prazoEntregaPadraoDias: producao.prazoEntregaPadraoDias,
  }
}

export async function lerPrazosFornecedores(diretor: string): Promise<{ status: number; corpo: Record<string, unknown> }> {
  if (!PODEM_LER_PRAZOS.includes(diretor)) return { status: 403, corpo: { erro: "?o=prazos_fornecedores é só para as chaves do COO e do CTO." } }
  const { producao } = await lerCampos<{ producao?: Partial<ConfigProducao> }>(["producao"])
  return { status: 200, corpo: montarPrazosFornecedores(normalizarProducao(producao)) }
}
