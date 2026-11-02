import { describe, it, expect } from "vitest"
import { telefoneE164, lancamentosDoFrete, textoEndereco, statusFinal } from "@/app/lib/frete"
import { assinar } from "@/app/lib/lalamove"
import { createHmac } from "crypto"

describe("frete Lalamove", () => {
  it("telefone vira E.164", () => {
    expect(telefoneE164("(11) 97805-3355")).toBe("+5511978053355")
    expect(telefoneE164("5511978053355")).toBe("+5511978053355")
    expect(telefoneE164("1133334444")).toBe("+551133334444")
    expect(telefoneE164("123")).toBeNull()
    expect(telefoneE164(undefined)).toBeNull()
  })
  it("assinatura no formato da Lalamove", () => {
    const esperado = createHmac("sha256", "seg").update('1700000000000\r\nPOST\r\n/v3/quotations\r\n\r\n{"data":{}}').digest("hex")
    expect(assinar("seg", "1700000000000", "POST", "/v3/quotations", '{"data":{}}')).toBe(esperado)
  })
  it("por nossa conta: só o custo; cobrado à parte: custo + receita a receber", () => {
    let n = 0
    const base = { orderId: "123", valor: 48.9, cliente: "Ana", numero: "ORC-1", cardId: "c1", hoje: "2026-11-02", criadoEm: "x", novoId: () => `id${++n}` }
    const so = lancamentosDoFrete({ ...base, cobrarCliente: false })
    expect(so).toHaveLength(1)
    expect(so[0]).toMatchObject({ tipo: "despesa", status: "pago", valor: 48.9, categoria: "frete", cardId: "c1", cardNumero: "ORC-1" })
    const dois = lancamentosDoFrete({ ...base, cobrarCliente: true })
    expect(dois.map(l => `${l.tipo}:${l.status}`)).toEqual(["despesa:pago", "receita:pendente"])
  })
  it("lote tem prioridade sobre o card", () => {
    const [l] = lancamentosDoFrete({ orderId: "1", valor: 10, cliente: "A", numero: "LT-1", cardId: "c", loteId: "l", cobrarCliente: false, hoje: "2026-11-02", criadoEm: "x", novoId: () => "i" })
    expect(l).toMatchObject({ loteId: "l", loteNumero: "LT-1" })
    expect(l.cardId).toBeUndefined()
  })
  it("endereço e status", () => {
    expect(textoEndereco({ rua: "Rua A", numero: "10", bairro: "Brás", cidade: "São Paulo", uf: "SP", cep: "03000-000" })).toBe("Rua A, 10 · Brás · São Paulo - SP · 03000-000")
    expect(statusFinal("COMPLETED")).toBe(true)
    expect(statusFinal("ON_GOING")).toBe(false)
  })
})

describe("veículos e adicionais em português", async () => {
  const { infoVeiculo, nomeAdicional, estimarChegada } = await import("@/app/lib/frete")
  it("veículos e períodos", () => {
    expect(infoVeiculo("LALAGO", "")).toMatchObject({ nome: "Moto", periodo: null })
    expect(infoVeiculo("MOTORCYCLE", 'Bikes with trunk. Additional space compared to the "Lalago"').nome).toBe("Moto com baú")
    expect(infoVeiculo("CAR", "").nome).toBe("Carro")
    expect(infoVeiculo("TRUCK330", "").nome).toBe("Caminhão 3,3 t")
    expect(infoVeiculo("UV_FIORINO_4H", "Unlimited UV deliveries within 4h period")).toMatchObject({ nome: "Utilitário por 4h", periodo: 4 })
    expect(infoVeiculo("TRUCK330_6H", "Unlimited truck deliveries within 6 hours")).toMatchObject({ periodo: 6 })
    expect(infoVeiculo("X", "Perfect for market purchases and medium packages.").nome).toBe("Carro compacto")
    expect(infoVeiculo("CAR", "").ordem).toBeLessThan(infoVeiculo("CAR_4H", "Unlimited deliveries within 4h period").ordem)
  })
  it("adicionais", () => {
    expect(nomeAdicional("DOOR_TO_DOOR_1DRIVER_1HELPER")).toBe("Motorista + ajudante (carga e descarga)")
    expect(nomeAdicional("DOOR_TO_DOOR_DRIVER")).toBe("Motorista ajuda na carga e descarga")
    expect(nomeAdicional("ROUND_TRIP")).toBe("Ida e volta")
  })
  it("chegada estimada soma as etapas; prioridade encurta a espera", () => {
    const n = estimarChegada({ minutosPercurso: 25, paradas: 2, veiculo: "LALAGO" })
    expect(n.total).toBe(n.aceitar + n.buscar + n.carregar + 25)
    expect(estimarChegada({ minutosPercurso: 25, paradas: 2, veiculo: "LALAGO", prioridade: true }).aceitar).toBeLessThan(n.aceitar)
    expect(estimarChegada({ minutosPercurso: 25, paradas: 2, media: { aceitar: 3, buscar: 9 } })).toMatchObject({ aceitar: 3, buscar: 9 })
  })
})
