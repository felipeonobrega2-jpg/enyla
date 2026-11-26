// Cadastro por tipo de serviço: a primeira pergunta é "o que vocês fazem?" (impressão, acabamento, manuseio, montagem).
// Formato, acerto e milheiro só para impressão; acabamento, manuseio e montagem pedem valor por unidade ou por hora,
// prazo médio e se buscam e entregam. Espaço do exemplo de cadastro bem preenchido ao lado dos campos.
import { describe, it, expect } from "vitest"
import {
  ETAPAS_IDS, GRUPOS_PARCEIRO, GRUPO_DO_SERVICO, SERVICOS_PARCEIRO, PERGUNTAS, errosDaEtapa, errosDoCadastro, limparCadastro,
  gruposDosServicos, servicosDosGrupos, cobraPorUnidadeOuHora, type IdServicoParceiro,
} from "@/app/lib/parceiros"
import { exemploDaEtapa, EXEMPLOS_CADASTRO } from "@/app/lib/exemploCadastro"

const base = { nomeFantasia: "Gráfica Exemplo", tipoDocumento: "cnpj" as const, documento: "11222333000181", cep: "01310100", rua: "Avenida Paulista", numero: "1000", bairro: "Bela Vista", cidade: "São Paulo", uf: "SP", responsavel: "Marcos", whatsapp: "11988887777", email: "a@b.com.br", aceite: true }
const manu = (extra = {}) => ({ id: "manuseio" as const, cobranca: "unidade" as const, valor: 0.4, prazoDias: 2, prazoVaria: false, tecnico: { buscaEntrega: true }, ...extra })
const imp = (extra = {}) => ({ id: "impressaoOffset" as const, cobranca: null, prazoDias: 3, prazoVaria: false, tecnico: { formatoMax: { l: 66, a: 96 } }, acerto: 300, valor: 120, ...extra })

describe("o que vocês fazem?", () => {
  it("é a primeira etapa e cada serviço pertence a um tipo", () => {
    expect(ETAPAS_IDS[0]).toBe("atuacao")
    expect(GRUPOS_PARCEIRO.map(g => g.id)).toEqual(["impressao", "acabamento", "manuseio", "montagem", "outros"])
    for (const s of SERVICOS_PARCEIRO) expect(GRUPO_DO_SERVICO[s.id]).toBeTruthy()
    expect(GRUPO_DO_SERVICO.impressaoOffset).toBe("impressao"); expect(GRUPO_DO_SERVICO.laminacao).toBe("acabamento")
    expect(GRUPO_DO_SERVICO.manuseio).toBe("manuseio"); expect(GRUPO_DO_SERVICO.colagem).toBe("montagem")
  })
  it("pode marcar mais de um; os serviços listados são só dos tipos marcados", () => {
    expect(servicosDosGrupos(["manuseio", "montagem"]).map(s => s.id)).toEqual(["colagem", "manuseio", "montagem"])
    expect(servicosDosGrupos(["impressao"]).map(s => s.id)).toEqual(["impressaoOffset", "impressaoDigital"])
    expect(gruposDosServicos([{ id: "colagem" }, { id: "impressaoDigital" }])).toEqual(["impressao", "montagem"])
  })
  it("sem marcar nada (e sem serviço) não passa; marcado, passa", () => {
    expect(errosDaEtapa({}, "atuacao").atuacao).toBeTruthy()
    expect(errosDaEtapa({ atuacao: ["manuseio"] }, "atuacao")).toEqual({})
    expect(errosDaEtapa({ servicos: [manu()] }, "atuacao")).toEqual({})
  })
  it("o servidor guarda os tipos: o que foi marcado mais os dos serviços, sem tipo inventado", () => {
    const l = limparCadastro({ ...base, atuacao: ["acabamento", "hacker" as never], servicos: [manu(), imp()] })
    expect(l.atuacao).toEqual(["impressao", "manuseio", "acabamento"])
  })
})

describe("impressão: formato, acerto e milheiro", () => {
  it("continua pedindo os três e não pergunta se busca e entrega", () => {
    expect(errosDaEtapa({ ...base, servicos: [imp()] }, "detalhes")).toEqual({})
    expect(Object.keys(errosDaEtapa({ ...base, servicos: [imp({ tecnico: {}, acerto: null, valor: null })] }, "detalhes")).sort()).toEqual(["impressaoOffset.acerto", "impressaoOffset.formatoMax", "impressaoOffset.valor"])
    expect(PERGUNTAS.impressaoOffset.some(p => p.id === "buscaEntrega")).toBe(false)
  })
})

describe("manuseio, montagem e acabamento: unidade ou hora, prazo, busca e entrega", () => {
  const ids = ["manuseio", "montagem", "colagem", "laminacao", "corteVinco"] as IdServicoParceiro[]
  it("não pedem formato, acerto nem milheiro; perguntam se buscam e entregam", () => {
    for (const id of ids) { expect(cobraPorUnidadeOuHora(id)).toBe(true); expect(PERGUNTAS[id].at(-1)?.id).toBe("buscaEntrega") }
    const e = errosDaEtapa({ ...base, servicos: [manu()] }, "detalhes")
    expect(e).toEqual({})
    expect(Object.keys(errosDaEtapa({ ...base, servicos: [manu({ cobranca: null, valor: null, prazoDias: null, tecnico: {} })] }, "detalhes")).sort()).toEqual(["manuseio.buscaEntrega", "manuseio.cobranca", "manuseio.prazo", "manuseio.valor"])
  })
  it("a forma de cobrar é só por unidade ou por hora, com valor", () => {
    expect(errosDaEtapa({ ...base, servicos: [manu({ cobranca: "milheiro" })] }, "detalhes")["manuseio.cobranca"]).toBeTruthy()
    expect(errosDaEtapa({ ...base, servicos: [manu({ cobranca: "hora", valor: 45 })] }, "detalhes")).toEqual({})
    expect(errosDaEtapa({ ...base, servicos: [manu({ valor: 0 })] }, "detalhes")["manuseio.valor"]).toBeTruthy()
    expect(limparCadastro({ ...base, servicos: [manu({ cobranca: "milheiro" })] }).servicos[0].cobranca).toBeNull()
    expect(limparCadastro({ ...base, servicos: [manu({ cobranca: "hora" })] }).servicos[0].cobranca).toBe("hora")
  })
  it("prazo médio: informa ou marca que varia; 'não' em buscar e entregar também vale", () => {
    expect(errosDaEtapa({ ...base, servicos: [manu({ prazoDias: null })] }, "detalhes")["manuseio.prazo"]).toBeTruthy()
    expect(errosDaEtapa({ ...base, servicos: [manu({ prazoDias: null, prazoVaria: true })] }, "detalhes")).toEqual({})
    expect(errosDaEtapa({ ...base, servicos: [manu({ tecnico: { buscaEntrega: false } })] }, "detalhes")).toEqual({})
    expect(limparCadastro({ ...base, servicos: [manu({ tecnico: { buscaEntrega: false } })] }).servicos[0].tecnico).toEqual({ buscaEntrega: false })
  })
  it("o cadastro inteiro (tipos, serviços e preço) passa na validação do servidor", () => {
    expect(errosDoCadastro(limparCadastro({ ...base, atuacao: ["impressao", "manuseio"], servicos: [imp(), manu()] }))).toEqual({})
  })
})

describe("exemplo de cadastro bem preenchido ao lado dos campos", () => {
  it("o texto do marketing entra por etapa; sem texto, o espaço fica reservado", () => {
    expect(exemploDaEtapa("empresa")).toBeNull()
    EXEMPLOS_CADASTRO.empresa = "  Nome da empresa: como no cartão de visita.  "
    expect(exemploDaEtapa("empresa")).toBe("Nome da empresa: como no cartão de visita.")
    delete EXEMPLOS_CADASTRO.empresa
  })
})
