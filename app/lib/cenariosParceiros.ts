// Cenário-exemplo por serviço do cadastro de parceiros: um enunciado fixo (quantidade, formato, material e
// acabamento) para o parceiro informar o preço daquele exemplo. A ENYLA compara, só por dentro, com o preço dos
// fornecedores atuais. Puro: tipos, padrão, mesclagem, comparação e a parte pública.
// REGRA: preço e nome dos nossos fornecedores nunca saem daqui para o parceiro. Tudo que vai ao público passa
// por `cenariosPublicos` (só serviço, enunciado e versão).
import type { IdServicoParceiro } from "./parceiros"

export type ReferenciaCenario = {
  preco: number | null              // R$ do exemplo; opcional
  fornecedorId?: string             // só interno
  fornecedorNome?: string           // só interno
}
export type CenarioParceiro = {
  servicoId: IdServicoParceiro
  enunciado: string                 // visível ao parceiro
  versao: number                    // sobe a cada mudança do enunciado
  unidade?: string                  // só interno: "3.000 folhas 66×96 cm"
  referencias: ReferenciaCenario[]  // só interno
}
export type CenarioPublico = Pick<CenarioParceiro, "servicoId" | "enunciado" | "versao">

const c = (servicoId: IdServicoParceiro, enunciado: string, unidade?: string, referencias: ReferenciaCenario[] = []): CenarioParceiro =>
  ({ servicoId, enunciado, versao: 1, unidade, referencias })

// Valor inicial; o que estiver salvo na config (AppConfig.cenariosParceiros) sobrescreve.
// Enunciados de impressaoOffset, relevo, faca, arte, fechamento e transporte são provisórios: sem referência interna.
export const CENARIOS_PADRAO: CenarioParceiro[] = [
  c("impressaoOffset", "3.000 folhas de cartão 300 g, formato 66 × 96 cm, impressão em 4 cores na frente.", "3.000 folhas 66×96 cm"),
  c("impressaoDigital", "100 caixas em formato A4, em triplex 300 g, com laminação fosca e arte inclusa.", "100 caixas A4", [{ preco: 350, fornecedorNome: "Villa" }]),
  c("laminacao", "3.000 folhas 66 × 96 cm, laminação fosca só na frente.", "3.000 folhas 66×96 cm (1.900,8 m²)", [{ preco: 2095.84, fornecedorNome: "Ronaldo Osasco" }]),
  c("verniz", "3.000 folhas 66 × 96 cm, verniz UV total na frente.", "3.000 folhas 66×96 cm (1.900,8 m²)", [{ preco: 1145.44, fornecedorNome: "Ronaldo Osasco" }]),
  c("hotStamping", "3.000 folhas, hot stamping sem clichê (a ENYLA já entrega o clichê pronto ou não precisa dele).", "3.000 folhas", [{ preco: 1387.5, fornecedorNome: "Guilherme" }]),
  c("relevo", "3.000 folhas, relevo seco em uma área da frente.", "3.000 folhas"),
  c("corteVinco", "3.000 folhas, com a faca fornecida pela ENYLA, uma batida por folha.", "3.000 folhas, 1 batida/folha", [
    { preco: 200, fornecedorNome: "Rodrigo" }, { preco: 280, fornecedorNome: "Fabiano" }, { preco: 280, fornecedorNome: "Jacuna" },
  ]),
  c("colagem", "3.000 cartuchos com cola lateral.", "3.000 cartuchos", [{ preco: 280, fornecedorNome: "Fabiano" }]),
  c("faca", "1 faca de corte e vinco para uma caixa cartucho de tamanho médio.", "1 faca"),
  c("papel", "3.000 folhas de cartão 300 g, formato 66 × 96 cm.", "3.000 folhas 66×96 cm", [{ preco: 4500 }]),
  c("arte", "Arte de 1 caixa cartucho, com a planificação (faca) montada.", "1 arte"),
  c("fechamento", "Fechamento de arquivo de 1 caixa cartucho, pronto para a gráfica.", "1 arquivo"),
  c("transporte", "1 entrega de 100 kg dentro da região metropolitana de São Paulo.", "1 entrega, 100 kg"),
]

export const temCenario = (id: IdServicoParceiro) => id !== "outro"

const numero = (v: unknown, max = 10_000_000) => { const n = Number(v); return Number.isFinite(n) && n > 0 && n <= max ? Math.round(n * 100) / 100 : null }

// Config salva por cima do padrão, por serviço
export function mesclarCenarios(salvo: unknown): CenarioParceiro[] {
  const lista = Array.isArray(salvo) ? salvo as Partial<CenarioParceiro>[] : []
  return CENARIOS_PADRAO.map(p => {
    const s = lista.find(x => x?.servicoId === p.servicoId)
    if (!s || typeof s.enunciado !== "string" || !s.enunciado.trim()) return p
    return limparCenario({ ...p, ...s, servicoId: p.servicoId })
  })
}

// Entrada da equipe (ou da config): texto aparado, preço positivo ou nulo, no máximo 10 referências
export function limparCenario(x: Partial<CenarioParceiro> & { servicoId: IdServicoParceiro }): CenarioParceiro {
  const t = (s: unknown, max: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max)
  const versao = Number(x.versao)
  return {
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
  cenarios.map(({ servicoId, enunciado, versao }) => ({ servicoId, enunciado, versao }))

export type Comparacao = { referencia: number; fornecedorNome?: string; diferenca: number; percentual: number }
// Preço do parceiro contra cada referência que tem preço. Vazio = "sem referência".
export function compararExemplo(precoParceiro: number | null | undefined, referencias: ReferenciaCenario[] | undefined): Comparacao[] {
  if (!precoParceiro || precoParceiro <= 0) return []
  return (referencias ?? []).filter(r => r.preco != null && r.preco > 0).map(r => {
    const ref = r.preco as number, diferenca = Math.round((precoParceiro - ref) * 100) / 100
    return { referencia: ref, fornecedorNome: r.fornecedorNome, diferenca, percentual: Math.round((diferenca / ref) * 1000) / 10 }
  })
}
