// O motor explica a conta em português de gráfica: folha comprada → corte → pedaço que entra na máquina → caixas por
// pedaço → folhas (+ perda) → papel. E desenha o que roda de verdade (o pedaço, a faixa da pinça e as caixas), com a
// mesma geometria do cálculo (cavidadesFolha / encaixar). Puro.
import type { Rota, Maquina } from "./producao"

const cm = (mm: number) => (Math.round(mm) / 10).toLocaleString("pt-BR", { maximumFractionDigits: 1 })
const n = (v: number) => Math.round(v).toLocaleString("pt-BR")
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })

// Em quantas colunas × linhas a folha é cortada (a mesma conta das divisões: largura ÷ 2, altura ÷ N)
export function gradeDoCorte(d: number): { cols: number; rows: number } {
  return d === 1 ? { cols: 1, rows: 1 } : d === 2 ? { cols: 1, rows: 2 } : { cols: 2, rows: d / 2 }
}
const NOME_CORTE: Record<number, string> = { 1: "inteira", 2: "em 2 (meia folha)", 4: "em 4", 6: "em 6", 8: "em 8" }

export type Explicacao = { passos: string[]; porque: string | null }

export function explicarRota(r: Rota, opts: { perdaPct: number; alternativas?: Rota[]; manual?: boolean; precoPor100?: number }): Explicacao {
  const passos: string[] = []
  passos.push(`Folha ${r.formatoNome} cortada ${NOME_CORTE[r.divisao] ?? `em ${r.divisao}`}`)
  const pedacos = r.passadas.map(p => `${cm(p.largura)}×${cm(p.altura)} cm com ${p.cavidades} ${p.cavidades === 1 ? "caixa" : "caixas"}${p.porPeca > 1 ? ` (${p.porPeca} pedaços assim)` : ""}`)
  passos.push(`cada pedaço entra na ${r.impressorNome} como ${pedacos.join(" + ")}`)
  passos.push(`${r.pecasPorFolhaPapel} ${r.pecasPorFolhaPapel === 1 ? "caixa" : "caixas"} por folha`)
  const liquidas = Math.ceil(r.quantidade / r.pecasPorFolhaPapel)
  const comPerda = Math.ceil(liquidas * (1 + opts.perdaPct / 100) - 1e-9)
  const pacotes = r.folhasPapel % 100 === 0 ? ` (${n(r.folhasPapel / 100)} pacotes)` : ""
  passos.push(`${n(r.quantidade)} ÷ ${r.pecasPorFolhaPapel} = ${n(liquidas)} folhas + ${opts.perdaPct}% = ${n(comPerda)}${r.folhasPapel !== comPerda ? ` → ${n(r.folhasPapel)}${pacotes}` : ""}`)
  const papel = r.itens.filter(i => i.etapa === "papel").reduce((s, i) => s + i.valor, 0)
  if (papel > 0) passos.push(`papel ${brl(papel)}${opts.precoPor100 ? ` (${brl(opts.precoPor100)} por 100 folhas)` : ""}`)

  // Por que esta: a melhor alternativa com outro corte ou outro impressor
  let porque: string | null = null
  if (!opts.manual && opts.alternativas?.length) {
    const outra = opts.alternativas
      .filter(a => a.id !== r.id && (a.divisao !== r.divisao || a.impressorId !== r.impressorId || a.formatoId !== r.formatoId))
      .sort((a, b) => a.custoTotal - b.custoTotal)[0]
    if (outra && outra.custoTotal > r.custoTotal + 1) {
      const como = outra.impressorId !== r.impressorId ? `na ${outra.impressorNome}` : outra.formatoId !== r.formatoId ? `na folha ${outra.formatoNome}` : `cortando ${NOME_CORTE[outra.divisao] ?? outra.divisao}`
      porque = `Escolhi assim porque fica ${brl(outra.custoTotal - r.custoTotal)} mais barato que ${como} (${outra.pecasPorFolhaPapel} por folha).`
    }
  }
  return { passos, porque }
}

// ── Desenho do pedaço que entra na máquina ───────────────────────────────────
export type Retangulo = { x: number; y: number; w: number; h: number }
export type DesenhoPassada = { w: number; h: number; pinca: Retangulo | null; caixas: Retangulo[]; encaixadasAMais: number }

const cabe = (L: number, x: number, esp: number) => (L >= x ? Math.floor((L + esp) / (x + esp)) : 0)

// Mesmo encaixe do motor (grade principal + faixa que sobra girada), devolvendo onde cada caixa fica
function posicoes(W: number, H: number, a: number, b: number, esp: number): Retangulo[] {
  let melhor: Retangulo[] = []
  for (const [p, q] of [[a, b], [b, a]] as const) {
    const cols = cabe(W, p, esp), rows = cabe(H, q, esp)
    const base: Retangulo[] = []
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) base.push({ x: i * (p + esp), y: j * (q + esp), w: p, h: q })
    const restW = W - cols * (p + esp), restH = H - rows * (q + esp)
    const direita: Retangulo[] = [], baixo: Retangulo[] = []
    for (let i = 0; i < cabe(restW, q, esp); i++) for (let j = 0; j < cabe(H, p, esp); j++) direita.push({ x: cols * (p + esp) + i * (q + esp), y: j * (p + esp), w: q, h: p })
    for (let i = 0; i < cabe(W, q, esp); i++) for (let j = 0; j < cabe(restH, p, esp); j++) baixo.push({ x: i * (q + esp), y: rows * (q + esp) + j * (p + esp), w: q, h: p })
    const lista = [...base, ...(direita.length >= baixo.length ? direita : baixo)]
    if (lista.length > melhor.length) melhor = lista
  }
  return melhor
}

export function desenharPassada(w: number, h: number, cavidades: number, blank: { largura: number; altura: number }, m: Pick<Maquina, "pinca" | "margem">, esp: number): DesenhoPassada {
  // Pinça num lado (o de cima ou o da esquerda), margem nos outros três: fica a opção que mais encaixa
  const opcoes = [
    { uw: w - 2 * m.margem, uh: h - m.pinca - m.margem, ox: m.margem, oy: m.pinca, pinca: { x: 0, y: 0, w, h: m.pinca } },
    { uw: w - m.pinca - m.margem, uh: h - 2 * m.margem, ox: m.pinca, oy: m.margem, pinca: { x: 0, y: 0, w: m.pinca, h } },
  ]
  let melhor: DesenhoPassada = { w, h, pinca: null, caixas: [], encaixadasAMais: 0 }
  for (const o of opcoes) {
    if (o.uw <= 0 || o.uh <= 0) continue
    const ps = posicoes(o.uw, o.uh, blank.largura, blank.altura, esp).map(r => ({ ...r, x: r.x + o.ox, y: r.y + o.oy }))
    if (ps.length > melhor.caixas.length || !melhor.pinca) melhor = { w, h, pinca: m.pinca > 0 ? o.pinca : null, caixas: ps, encaixadasAMais: 0 }
  }
  // Cavidades digitadas: menos que o encaixe mostra só as usadas; mais (caixas encaixadas uma na outra) avisa quantas
  if (cavidades < melhor.caixas.length) melhor.caixas = melhor.caixas.slice(0, cavidades)
  else if (cavidades > melhor.caixas.length) melhor.encaixadasAMais = cavidades - melhor.caixas.length
  return melhor
}

// ── Avisos: o que é frágil ou é oportunidade nesta conta ─────────────────────
export function avisosDaRota(r: Rota, opts: { perdaPct: number; blank: { largura: number; altura: number }; maquina: Pick<Maquina, "pinca" | "margem"> | null; esp: number }): string[] {
  const out: string[] = []
  const p0 = r.passadas[0]
  if (p0 && opts.maquina) {
    const d = desenharPassada(p0.largura, p0.altura, p0.cavidades, opts.blank, opts.maquina, opts.esp)
    // Caixa encostando na borda não avisa: com só a pinça e o corte e vinco recortando por dentro, é o normal (21/11)
    if (d.encaixadasAMais > 0) out.push(`Você disse que cabem ${p0.cavidades} por pedaço; em retângulo o motor só vê ${p0.cavidades - d.encaixadasAMais}. Vale conferir o encaixe na faca.`)
  }
  // Pacote de papel: folhas que sobram no último pacote viram caixas a mais quase de graça (só impressão e acabamento)
  const necessarias = Math.ceil(Math.ceil(r.quantidade / r.pecasPorFolhaPapel) * (1 + opts.perdaPct / 100) - 1e-9)
  const sobra = r.folhasPapel - necessarias
  if (sobra >= 20 && r.pecasPorFolhaPapel > 0) {
    const extra = Math.floor(sobra / (1 + opts.perdaPct / 100)) * r.pecasPorFolhaPapel
    if (extra >= 100) out.push(`O último pacote sobra ${n(sobra)} folhas: dá para oferecer ~${n(Math.floor(extra / 100) * 100)} caixas a mais com o mesmo papel.`)
  }
  return out
}
