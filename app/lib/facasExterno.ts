// Leitura das facas salvas na porta externa (?o=facas). SÓ LÊ: não grava, não apaga, não envia nada.
// Para cada faca física: o desenho da biblioteca (nome, modelo, medidas da caixa e da peça) e quantos modelos cabem na
// chapa. O número é o das cavidades cadastradas na faca (origem 'salva'); sem cavidades, é a estimativa pela montagem
// na máquina do impressor principal, a Jerograf (origem 'estimada'); sem máquina ou sem medida, null ('desconhecida').
// Fora da resposta, de propósito: DXF, URL assinada, cliente, fornecedor e custo da faca.
import { lerCampos } from "./configAtomica"
import { lerIndice } from "./bibliotecaServidor"
import { nomeDoDesenho, type Desenho } from "./biblioteca"
import { normalizarProducao, passadasDaPeca, type ConfigProducao, type Ferramental, type Maquina } from "./producao"

export const AJUDA_FACAS = "Leitura das facas salvas (só leitura; qualquer chave da diretoria). Cada faca: id, nome (o apelido do desenho na biblioteca), modelo, medidas (caixa montada em mm, ou null se não lida), blankMm (a peça aberta, em mm), modelosPorChapa e origem: 'salva' (cavidades cadastradas na faca), 'estimada' (calculada pela montagem na máquina da Jerograf) ou 'desconhecida' (null). maquina: a máquina usada na estimativa (nome, larguraMm, alturaMm; pinça e margem entram na conta). Regra do Felipe (25/11): 1.000 unidades no total da tiragem, artes divididas pelos modelos que cabem na chapa. Sem DXF, arquivo, cliente, fornecedor nem custo"

export type FacaExterna = {
  id: string
  nome: string | null
  modelo: string | null
  medidas: { unidade: "mm"; caixa: { largura: number; altura: number; profundidade: number } | null }
  blankMm: { largura: number; altura: number }
  modelosPorChapa: number | null
  origem: "salva" | "estimada" | "desconhecida"
}

// A máquina do impressor principal: o impressor ativo que se chama Jerograf (cadastro de produção)
export function maquinaDaJerograf(p: ConfigProducao): Maquina | null {
  const f = p.fornecedores.find(x => x.ativo && x.maquina && x.servicos.impressao && /jerograf/i.test(x.nome))
  return f?.maquina ?? null
}

const positivo = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0

export function modelosNaMaquina(blank: { largura: number; altura: number }, m: Maquina | null, esp: number): number | null {
  if (!m || !positivo(blank.largura) || !positivo(blank.altura)) return null
  const ps = passadasDaPeca(m.largura, m.altura, blank, m, esp)
  const n = ps.reduce((s, x) => s + x.cavidades * x.porPeca, 0)
  return n > 0 ? n : null
}

export function montarFacas(a: { ferramentais: Ferramental[]; desenhos: Desenho[]; maquina: Maquina | null; espacoMm: number }) {
  const facas: FacaExterna[] = a.ferramentais.filter(f => f.tipo === "faca").map(f => {
    const d = f.desenhoId ? a.desenhos.find(x => x.id === f.desenhoId) : undefined
    const blank = { largura: f.blankLargura, altura: f.blankAltura }
    const salva = positivo(f.cavidades) ? Math.floor(f.cavidades) : null
    const est = salva == null ? modelosNaMaquina(blank, a.maquina, a.espacoMm) : null
    return {
      id: f.id,
      nome: d ? nomeDoDesenho(d) : null,
      modelo: d?.modelo ?? null,
      medidas: { unidade: "mm", caixa: d?.caixa ?? null },
      blankMm: blank,
      modelosPorChapa: salva ?? est,
      origem: salva != null ? "salva" : est != null ? "estimada" : "desconhecida",
    }
  })
  return { facas, maquina: a.maquina ? { nome: a.maquina.nome, larguraMm: a.maquina.largura, alturaMm: a.maquina.altura } : null }
}

export async function lerFacasExterno(): Promise<{ status: number; corpo: Record<string, unknown> }> {
  const { producao } = await lerCampos<{ producao?: Partial<ConfigProducao> }>(["producao"])
  const p = normalizarProducao(producao)
  const desenhos = await lerIndice().catch(() => [] as Desenho[])
  return { status: 200, corpo: montarFacas({ ferramentais: p.ferramentais, desenhos, maquina: maquinaDaJerograf(p), espacoMm: p.espacoEntrePecas }) }
}
