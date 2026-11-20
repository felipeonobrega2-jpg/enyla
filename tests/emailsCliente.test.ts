import { describe, it, expect } from "vitest"
import { emailPedidoAprovado, emailSinalRecebido, emailArteParaAprovar, emailArteAprovada, emailPedidoEnviado } from "@/app/lib/emailsCliente"
import { paraIso } from "@/app/lib/emailsClienteServidor"
const h = (x: { html: string }) => x.html.replace(/\u00a0/g, " ")

describe("e-mails para o cliente", () => {
  it("pedido aprovado vira comprovante com valores, sinal e links", () => {
    const e = emailPedidoAprovado({ nome: "Ana Souza", numero: "ORC-2026-300", quantidade: 5000, preco: 9540, sinal: 4770, aprovadoPor: "Ana Souza", em: "2026-11-20T15:00:00Z",
      descricao: "6×12×3 cm · Triplex", prazo: null, linkPix: "https://app.enyla.com.br/pix/ORC-2026-300?v=4770.00", linkRastreio: "https://app.enyla.com.br/track/ORC-2026-300" })
    expect(e.assunto).toContain("ORC-2026-300")
    expect(e.html).toContain("Oi, Ana!")
    expect(e.html).toContain("5.000 un")
    expect(h(e)).toContain("R$ 4.770,00")
    expect(e.html).toContain("Luiz Felipe")
    expect(e.html).not.toContain("Gerente de contas dos parceiros")
    expect(e.texto).toContain("/pix/ORC-2026-300")
  })
  it("digital: sinal, arte para aprovar (versão), arte aprovada e enviado", () => {
    expect(h(emailSinalRecebido({ nome: null, id: "DIG-120", quantidade: 200, total: 900, sinal: 450, em: "2026-11-20T15:00:00Z", link: "L" }))).toContain("R$ 450,00")
    expect(emailArteParaAprovar({ nome: "João", id: "DIG-120", versao: 2, link: "L" }).html).toContain("versão 2")
    expect(h(emailArteAprovada({ nome: "João", id: "DIG-120", em: "2026-11-20T15:00:00Z", versao: 1, link: "L", restante: 450 }))).toContain("R$ 450,00")
    expect(emailPedidoEnviado({ nome: "João", numero: "DIG-120", quantidade: 200, link: "L" }).assunto).toContain("saiu para entrega")
  })
  it("data do rastreio (horário de Brasília) vira ISO", () => {
    expect(paraIso("20/11/2026, 14:05:33")).toBe("2026-11-20T17:05:33.000Z")
    expect(paraIso("lixo")).toBeNull()
  })
})

describe("relatório semanal", () => {
  it("semana passada é de segunda a domingo (horário de Brasília)", async () => {
    const { semanaPassada } = await import("@/app/lib/relatorioSemanal")
    const s = semanaPassada(new Date("2026-11-23T11:00:00Z"))   // segunda, 8h em Brasília
    expect(s.de.toISOString().slice(0, 10)).toBe("2026-11-16")
    expect(s.ate.toISOString().slice(0, 10)).toBe("2026-11-22")
    expect(s.nome).toBe("Semana de 16/11 a 22/11")
  })
})
