// Cartuxo · cadastro de facas (lógica pura, usada na tela e nos testes).
// A planificação é a mesma regra do site (caixaria/lib/preco.ts): se mudar lá, mudar aqui.

export type TipoFaca = "simples" | "fundo-automatico" | "tampa-aviao"

export const TIPOS_FACA: Record<TipoFaca, string> = {
  simples: "Cartucho com abas",
  "fundo-automatico": "Fundo automático",
  "tampa-aviao": "Tampa avião",
}

export type Faca = {
  id: string
  codigo: string
  nome: string
  tipo: TipoFaca
  frente_mm: number
  lateral_mm: number
  altura_mm: number
  lugares: number | null
  planificacao: string | null
  produto_slug: string | null
  tem_faca: boolean
  no_site: boolean
  obs: string
  atualizada_em: string
}

// Caixa do site (caixaria.com/api/catalogo), com as medidas de partida
export type ProdutoSite = {
  slug: string; codigo: string; nome: string; categoria: string; uso: string
  tipo: TipoFaca; frente_mm: number; lateral_mm: number; altura_mm: number; foto: string
}

export const CHAPA = { largura: 660, altura: 480 }   // mm, chapa 66×48 da produção
const ABA_COLAGEM = 15

export function planificacao(tipo: TipoFaca, f: number, l: number, h: number) {
  let sup: number, inf: number
  if (tipo === "tampa-aviao") { sup = Math.round(l * 1.1) + 8; inf = Math.round(l * 0.55) + 3 }
  else if (tipo === "fundo-automatico") { sup = Math.round(l * 0.9) + 3; inf = Math.round(l * 1.2) + 5 }
  else { sup = Math.round(l * 0.9) + 3; inf = Math.round(l * 0.6) + 3 }
  return { largura: 2 * f + 2 * l + ABA_COLAGEM, altura: h + sup + inf + 5 }
}

// Quantas planificações cabem na chapa (com e sem girar)
export function cabemNaChapa(largura: number, altura: number) {
  if (!(largura > 0 && altura > 0)) return 0
  const normal = Math.floor(CHAPA.largura / largura) * Math.floor(CHAPA.altura / altura)
  const girada = Math.floor(CHAPA.largura / altura) * Math.floor(CHAPA.altura / largura)
  return Math.max(normal, girada)
}

export const lugaresCalculados = (tipo: TipoFaca, f: number, l: number, h: number) => {
  const p = planificacao(tipo, f, l, h)
  return cabemNaChapa(p.largura, p.altura)
}

export type Situacao = "confirmada" | "a-confirmar" | "fora"

export const SITUACAO: Record<Situacao, { texto: string; tom: "sucesso" | "alerta" | "neutro" }> = {
  confirmada: { texto: "Faca confirmada", tom: "sucesso" },
  "a-confirmar": { texto: "A confirmar", tom: "alerta" },
  fora: { texto: "Fora do site", tom: "neutro" },
}

// Mesma regra do site (montarCatalogo): sem cadastro, a caixa segue à venda com as medidas de partida
export function situacao(f: Faca | undefined): Situacao {
  if (!f) return "a-confirmar"
  return f.tem_faca && f.no_site ? "confirmada" : "fora"
}

export const mm = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })
export const medidas = (f: { frente_mm: number; lateral_mm: number; altura_mm: number }) =>
  `${mm(f.frente_mm)} × ${mm(f.lateral_mm)} × ${mm(f.altura_mm)} mm`

// O que vai para o banco (validado no servidor)
export type DadosFaca = Omit<Faca, "id" | "atualizada_em"> & { id?: string }

export function erroFaca(d: Partial<DadosFaca>): string | null {
  if (!d.codigo?.trim()) return "Informe o código da faca"
  if (!d.nome?.trim()) return "Informe o nome"
  if (!d.tipo || !(d.tipo in TIPOS_FACA)) return "Tipo inválido"
  for (const k of ["frente_mm", "lateral_mm", "altura_mm"] as const) {
    const v = Number(d[k])
    if (!(v > 0 && v < 2000)) return "Medidas em mm, maiores que zero"
  }
  if (d.lugares != null && !(Number.isInteger(d.lugares) && d.lugares > 0 && d.lugares <= 60)) return "Lugares por chapa: número inteiro de 1 a 60"
  return null
}
