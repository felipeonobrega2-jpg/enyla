import { describe, it, expect } from "vitest"
import { categoriaPerda, textoMotivo, origemDoCliente } from "@/app/lib/coleta"

const perdido = (motivoPerdido?: string) => ({ coluna: 10, motivoPerdido })

describe("motivo de perda", () => {
  it("lê a lista nova, com ou sem detalhe", () => {
    expect(categoriaPerda(perdido("Preço"))).toBe("preco")
    expect(categoriaPerda(perdido(textoMotivo("concorrente", "gráfica do bairro")))).toBe("concorrente")
  })
  it("lê os motivos antigos escritos à mão", () => {
    expect(categoriaPerda(perdido("Fora da realidade do cliente no momento."))).toBe("preco")
    expect(categoriaPerda(perdido("Cliente sumiu e não respondeu mais contato."))).toBe("sumiu")
    expect(categoriaPerda(perdido("Cliente queria menor quantidade. Não era ICP."))).toBe("perfil")
    expect(categoriaPerda(perdido("Fechou Pedido Menor"))).toBe("outraOpcao")
    expect(categoriaPerda(perdido("Ao fazer o PIX pra mim, deu suspeita de golpe. Cliente desistiu após isso e fechou em outro lugar."))).toBe("erro")
  })
  it("venceu sem resposta é separado; fora de Perdido não tem motivo", () => {
    expect(categoriaPerda(perdido("Orçamento sem conclusão"))).toBe("expirado")
    expect(categoriaPerda(perdido())).toBe("expirado")
    expect(categoriaPerda({ coluna: 0, motivoPerdido: "Preço" })).toBeNull()
  })
})

describe("origem do cliente", () => {
  const clientes = [{ nome: "Ana Cosméticos", origemCampanhaNome: "Campanha Natal" }, { nome: "Bruno" }]
  it("informada vence a campanha; sem nada, pergunta", () => {
    expect(origemDoCliente("ana cosmeticos", undefined, clientes)).toEqual({ canal: "anuncio", detalhe: "Campanha Natal", deduzida: true })
    expect(origemDoCliente("Ana Cosméticos", { "ana cosmeticos": { canal: "indicacao", detalhe: "Bruno" } }, clientes)?.canal).toBe("indicacao")
    expect(origemDoCliente("Bruno", undefined, clientes)).toBeNull()
  })
})
