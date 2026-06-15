export type Custos = {
  impressaoPorChapa: number
  corteAcerto: number
  corteMilheiro: number
  vernizPor2000: number
  colagemMilheiro: number
  arte: number
}

export type Multiplicadores = {
  semFaca: number
  comFaca: number
  parcelamento12x: number
}

export type Material = {
  id: string
  nome: string
  precos: { [formatoId: string]: number } // R$ por 100 folhas
}

export type Configuracoes = {
  custos: Custos
  multiplicadores: Multiplicadores
  materiais: Material[]
  apiKey: string
  metaMensal: number
  baselineFaturamento: number
}

export const CONFIG_PADRAO: Configuracoes = {
  custos: {
    impressaoPorChapa: 350,
    corteAcerto: 50,
    corteMilheiro: 50,
    vernizPor2000: 55,
    colagemMilheiro: 39,
    arte: 200,
  },
  multiplicadores: {
    semFaca: 2.0,
    comFaca: 1.8,
    parcelamento12x: 1.2,
  },
  materiais: [
    { id: "couche115", nome: "Couchê 115g",  precos: { "66x96": 85,  "77x113": 120 } },
    { id: "couche250", nome: "Couchê 250g",  precos: { "66x96": 160, "77x113": 220 } },
    { id: "cartao300", nome: "Cartão 300g",  precos: { "66x96": 195, "77x113": 270 } },
    { id: "cartao350", nome: "Cartão 350g",  precos: { "66x96": 225, "77x113": 310 } },
  ],
  apiKey: "",
  metaMensal: 10000,
  baselineFaturamento: 0,
}

export const defaultConfig = CONFIG_PADRAO

export function carregarConfig(): Configuracoes {
  try {
    const raw = localStorage.getItem("enyla-config")
    if (!raw) return CONFIG_PADRAO
    const saved = JSON.parse(raw) as Partial<Configuracoes>
    return {
      custos: { ...CONFIG_PADRAO.custos, ...saved.custos },
      multiplicadores: { ...CONFIG_PADRAO.multiplicadores, ...saved.multiplicadores },
      materiais: saved.materiais?.length ? saved.materiais : CONFIG_PADRAO.materiais,
      apiKey: saved.apiKey ?? "",
      metaMensal: saved.metaMensal ?? CONFIG_PADRAO.metaMensal,
      baselineFaturamento: saved.baselineFaturamento ?? 0,
    }
  } catch {
    return CONFIG_PADRAO
  }
}

export function salvarConfig(config: Configuracoes): void {
  try { localStorage.setItem("enyla-config", JSON.stringify(config)) } catch {}
}
