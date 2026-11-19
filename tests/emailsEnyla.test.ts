import { describe, it, expect } from "vitest"
import { emailCadastroRecebido, emailParceiroAprovado, emailNovoPedido } from "@/app/lib/emailsEnyla"
import { enviarEmail } from "@/app/lib/email"

describe("e-mails ENYLA", () => {
  it("cadastro recebido: assunto, nome e serviços; texto puro junto", () => {
    const e = emailCadastroRecebido({ primeiroNome: "Marcos", empresa: "Gráfica <Teste>", servicos: ["Colagem"], whatsappGerente: "5511900000000" })
    expect(e.assunto).toContain("Marcos")
    expect(e.html).toContain("Gráfica &lt;Teste&gt;")            // escapa o que o parceiro digitou
    expect(e.html).toContain("light only")                          // sempre claro
    expect(e.texto).toContain("Colagem")
  })
  it("novo pedido: dados, arquivos por tipo e prazo no assunto", () => {
    const e = emailNovoPedido({ primeiroNome: null, empresa: "Corte Bom", whatsappGerente: null, pedido: { numero: "ORC-1", servicos: ["Corte e vinco"], quantidade: 5000, medida: "5×19×5 cm", material: "Cartão 300g", prazo: "2026-11-25", enviadoEm: "2026-11-18", arquivos: [{ nome: "Faca · faca.pdf", url: "https://x/f.pdf" }] } })
    expect(e.assunto).toBe("Novo pedido ORC-1 · Corte e vinco · entrega 25/11/2026")
    expect(e.html).toContain("5.000 unidades")
    expect(e.html).toContain(">Faca<")
    expect(e.html).toContain("faca.pdf")
  })
  it("aprovado", () => {
    expect(emailParceiroAprovado({ primeiroNome: "Ana", empresa: "X", whatsappGerente: null }).assunto).toContain("Bem-vindo")
  })
  it("sem a chave da Resend não envia (e diz por quê)", async () => {
    const antes = process.env.RESEND_API_KEY; delete process.env.RESEND_API_KEY
    const r = await enviarEmail("a@b.com", emailParceiroAprovado({ primeiroNome: "Ana", empresa: "X", whatsappGerente: null }))
    expect(r.ok).toBe(false)
    if (antes) process.env.RESEND_API_KEY = antes
  })
})
