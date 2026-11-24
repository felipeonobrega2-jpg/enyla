// Cenários-exemplo por serviço do cadastro de parceiros: um enunciado fixo (quantidade, formato, material e
// acabamento) para o parceiro informar o preço daquele exemplo. A ENYLA compara, só por dentro, com o preço dos
// fornecedores atuais. Puro: tipos, padrão, mesclagem, comparação e a parte pública.
// REGRA: preço e nome dos nossos fornecedores nunca saem daqui para o parceiro. Tudo que vai ao público passa
// por `cenariosPublicos` (só serviço, enunciado e versão).
import { CENARIOS_IDS, type IdServicoParceiro, type CadastroParceiro } from "./parceiros"

export type ReferenciaCenario = {
  preco: number | null              // R$ do exemplo; opcional
  fornecedorId?: string             // só interno
  fornecedorNome?: string           // só interno
}
export type CenarioParceiro = {
  id: string                        // um por enunciado (um serviço pode ter mais de um): ver CENARIOS_IDS
  servicoId: IdServicoParceiro
  enunciado: string                 // visível ao parceiro
  versao: number                    // sobe a cada mudança do enunciado
  unidade?: string                  // só interno: "3.000 folhas 48×44 cm"
  referencias: ReferenciaCenario[]  // só interno
}
export type CenarioPublico = Pick<CenarioParceiro, "id" | "servicoId" | "enunciado" | "versao">

const c = (id: string, servicoId: IdServicoParceiro, enunciado: string, unidade?: string, referencias: ReferenciaCenario[] = []): CenarioParceiro =>
  ({ id, servicoId, enunciado, versao: 1, unidade, referencias })

const FOLHAS = "3.000 folhas de 48 × 44 cm, cartão 300 g"
const UN_FOLHAS = "3.000 folhas 48×44 cm"
const UN_LAM = "3.000 folhas 48×44 cm (633,6 m²)"

// Valor inicial; o que estiver salvo na config (AppConfig.cenariosParceiros) sobrescreve.
// Impressão (offset e digital) não tem cenário: cobra acerto + milheiro.
export const CENARIOS_PADRAO: CenarioParceiro[] = [
  c("laminacao-fosca", "laminacao", `${FOLHAS}, laminação fosca só na frente (um lado).`, UN_LAM, [{ preco: 765.28, fornecedorNome: "Ronaldo Osasco" }]), // regra do Ronaldo: R$ 100 + R$ 1,05 × 633,6 m²
  c("laminacao-brilho", "laminacao", `${FOLHAS}, laminação brilho só na frente (um lado).`, UN_LAM),
  c("laminacao-soft", "laminacao", `${FOLHAS}, laminação soft touch só na frente (um lado).`, UN_LAM),
  c("laminacao-dois-lados", "laminacao", `${FOLHAS}, laminação nos dois lados.`, UN_LAM),
  c("verniz", "verniz", `${FOLHAS}, verniz UV total só na frente.`, UN_FOLHAS, [{ preco: 450, fornecedorNome: "Ronaldo Osasco" }]),
  c("hotStamping", "hotStamping", `${FOLHAS}, hot stamping dourado, uma área de gravação, clichê fornecido pela ENYLA (informe só o preço da estampagem).`, UN_FOLHAS, [{ preco: 1387.5, fornecedorNome: "Guilherme" }]),
  c("relevo", "relevo", `${FOLHAS}, relevo seco, uma área, clichê fornecido pela ENYLA.`, UN_FOLHAS),
  c("corteVinco", "corteVinco", `${FOLHAS}, corte e vinco, faca fornecida pela ENYLA, com destaque (tirar o refile), uma batida por folha.`, `${UN_FOLHAS}, 1 batida/folha`, [
    { preco: 200, fornecedorNome: "Rodrigo" }, { preco: 280, fornecedorNome: "Fabiano" }, { preco: 280, fornecedorNome: "Jacuna" },
  ]),
  c("colagem", "colagem", "3.000 cartuchos já cortados e vincados, cola lateral, cartão 300 g.", "3.000 cartuchos", [{ preco: 280, fornecedorNome: "Fabiano" }]),
  c("faca", "faca", "1 faca plana, montada com borracha, pronta para máquina, para cartucho em cartão 300 g, arquivo em DXF, 1 modelo.", "1 faca"),
  c("papel", "papel", "3.000 folhas de cartão 300 g no formato 66 × 96 cm, com entrega no endereço da ENYLA em Barueri.", "3.000 folhas 66×96 cm", [{ preco: 4500 }]),
  // Arte: preço por arte e preço do pacote de 3 (dois campos; juntos formam o enunciado combinado)
  c("arte-unitaria", "arte", "Preço de 1 arte de cartucho (com planificação/dieline, pronta para impressão).", "1 arte", [
    { preco: 70, fornecedorNome: "Ludmila" }, { preco: 350, fornecedorNome: "Daniel" },
  ]),
  c("arte-pacote3", "arte", "Preço de um pacote de 3 artes.", "pacote de 3 artes", [{ preco: 210, fornecedorNome: "Ludmila" }]), // o pacote do Daniel o Felipe negocia: sem número
  c("fechamento", "fechamento", "fechamento de 1 arquivo de cartucho (1 modelo, 4 cores), com imposição e chapa (CTP) para o formato 66 × 96 cm.", "1 arquivo"),
  c("transporte", "transporte", "1 viagem de ida e volta, Barueri (base da ENYLA) ↔ Osasco, carga de 50 kg, utilitário / Fiorino ou equivalente.", "1 viagem, 50 kg"),
]

export const temCenario = (id: IdServicoParceiro) => CENARIOS_IDS[id].length > 0

const numero = (v: unknown, max = 10_000_000) => { const n = Number(v); return Number.isFinite(n) && n > 0 && n <= max ? Math.round(n * 100) / 100 : null }

// Config salva por cima do padrão, por serviço
export function mesclarCenarios(salvo: unknown): CenarioParceiro[] {
  const lista = Array.isArray(salvo) ? salvo as Partial<CenarioParceiro>[] : []
  return CENARIOS_PADRAO.map(p => {
    const s = lista.find(x => x?.id === p.id)
    if (!s || typeof s.enunciado !== "string" || !s.enunciado.trim()) return p
    return limparCenario({ ...p, ...s, id: p.id, servicoId: p.servicoId })
  })
}

// Entrada da equipe (ou da config): texto aparado, preço positivo ou nulo, no máximo 10 referências
export function limparCenario(x: Partial<CenarioParceiro> & { id: string; servicoId: IdServicoParceiro }): CenarioParceiro {
  const t = (s: unknown, max: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max)
  const versao = Number(x.versao)
  return {
    id: x.id,
    servicoId: x.servicoId,
    enunciado: t(x.enunciado, 400),
    versao: Number.isInteger(versao) && versao > 0 ? versao : 1,
    unidade: t(x.unidade, 120) || undefined,
    referencias: (Array.isArray(x.referencias) ? x.referencias : []).slice(0, 10).map(r => ({
      preco: numero(r?.preco),
      fornecedorId: t(r?.fornecedorId, 60) || undefined,
      fornecedorNome: t(r?.fornecedorNome, 80) || undefined,
    })).filter(r => r.preco != null || r.fornecedorNome || r.fornecedorId),
  }
}

// O que o parceiro pode ver
export const cenariosPublicos = (cenarios: CenarioParceiro[]): CenarioPublico[] =>
  cenarios.map(({ id, servicoId, enunciado, versao }) => ({ id, servicoId, enunciado, versao }))

export type Comparacao = { referencia: number; fornecedorNome?: string; diferenca: number; percentual: number }
// Preço do parceiro contra cada referência que tem preço. Vazio = "sem referência".
export function compararExemplo(precoParceiro: number | null | undefined, referencias: ReferenciaCenario[] | undefined): Comparacao[] {
  if (!precoParceiro || precoParceiro <= 0) return []
  return (referencias ?? []).filter(r => r.preco != null && r.preco > 0).map(r => {
    const ref = r.preco as number, diferenca = Math.round((precoParceiro - ref) * 100) / 100
    return { referencia: ref, fornecedorNome: r.fornecedorNome, diferenca, percentual: Math.round((diferenca / ref) * 1000) / 10 }
  })
}

export type Estatistica = { n: number; media: number; min: number; max: number }
// Só da equipe: média, mínimo e máximo dos preços que os parceiros já informaram no cenário (ignora vazio e não positivo)
export function estatisticaCenario(cadastros: Pick<CadastroParceiro, "servicos">[], cenarioId: string): Estatistica | null {
  const v: number[] = []
  for (const c of cadastros) for (const s of c.servicos ?? []) { const p = Number(s.precosExemplo?.[cenarioId]); if (Number.isFinite(p) && p > 0) v.push(p) }
  if (!v.length) return null
  return { n: v.length, media: Math.round(v.reduce((t, x) => t + x, 0) / v.length * 100) / 100, min: Math.min(...v), max: Math.max(...v) }
}
