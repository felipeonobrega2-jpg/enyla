// Termos de Parceria: caixa obrigatória no /parceiros, aceite gravado (versão, data, IP, user-agent), texto vindo da mesma
// lista de serviços do formulário, aceite por token e a trava de distribuição (só quem veio de /parceiros e não aceitou).
import { describe, it, expect, vi, beforeEach } from "vitest"

const estado = vi.hoisted(() => ({ cfg: {} as Record<string, unknown>, linhas: [] as Record<string, unknown>[] }))
vi.mock("@/app/lib/configAtomica", () => ({
  lerConfigLinha: vi.fn(async () => ({ data: { data: estado.cfg }, error: null })),
  mudarConfig: vi.fn(async (mudar: (d: Record<string, unknown>) => Record<string, unknown> | null) => { estado.cfg = { ...estado.cfg, ...(mudar(estado.cfg) ?? {}) }; return estado.cfg }),
}))
vi.mock("@/app/lib/supabase", () => {
  const q = { select: () => q, lte: () => q, order: () => q, limit: async () => ({ data: estado.linhas, error: null }) }
  return { supabase: { from: vi.fn(() => q), storage: { from: vi.fn() } } }
})
vi.mock("@/app/lib/notificar", () => ({ notificar: vi.fn(async () => null), LINK_SISTEMA: "https://exemplo.test" }))
vi.mock("@/app/lib/geocodificar", () => ({ enderecoPeloCep: vi.fn(async () => ({ erro: "teste" })) }))
vi.mock("@/app/lib/emailsServidor", () => ({ emailDoCadastro: vi.fn(async () => ({ tipo: "teste", ok: false })) }))
vi.mock("@/app/lib/evolution", () => ({ evo: vi.fn(async () => null) }))
vi.mock("@/app/lib/agenteAuto", () => ({ seuNumero: vi.fn(async () => "") }))
vi.mock("@/app/lib/prospectorServidor", () => ({ registrarCadastroRecebido: vi.fn(async () => null) }))

import { receberCadastro } from "@/app/lib/parceirosServidor"
import { aceitarPorToken, garantirTokenTermos, lerTermosVigentes } from "@/app/lib/termosParceriaServidor"
import { TERMOS_INICIAIS, renderTermos, statusTermos, podeReceberPedido, TEXTO_CAIXA_ACEITE } from "@/app/lib/termosParceria"
import { SERVICOS_PARCEIRO, errosDaEtapa, ERRO_ACEITE_TERMOS, type CadastroParceiro } from "@/app/lib/parceiros"

const dados = { nomeFantasia: "Gráfica Exemplo", tipoDocumento: "cnpj", documento: "11222333000181", cep: "01310100", rua: "Rua Exemplo", numero: "10", bairro: "Centro", cidade: "São Paulo", uf: "SP", responsavel: "Fulano", whatsapp: "11988887777", email: "a@b.com.br", aceite: true,
  servicos: [{ id: "corteVinco", cobranca: "milheiro", valor: 38, prazoDias: 3, prazoVaria: false, precosExemplo: { corteVinco: 250 } }] }
const form = (extra: Record<string, unknown> = {}) => { const f = new FormData(); f.set("dados", JSON.stringify({ ...dados, ...extra })); return f }
const cadastros = () => (estado.cfg.cadastrosParceiros ?? []) as CadastroParceiro[]

beforeEach(() => { estado.cfg = {}; estado.linhas = [] })

describe("envio do cadastro", () => {
  it("sem o aceite dos termos o envio falha, com mensagem no campo, e nada é gravado", async () => {
    const r = await receberCadastro(form({ aceiteTermos: false }))
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.campos?.aceiteTermos).toBe(ERRO_ACEITE_TERMOS)
    expect(cadastros()).toHaveLength(0)
    expect(errosDaEtapa({ aceite: true }, "final").aceiteTermos).toBe(ERRO_ACEITE_TERMOS)
  })
  it("com aceite grava versão, data, IP e user-agent (do servidor, não do navegador)", async () => {
    const r = await receberCadastro(form({ aceiteTermos: true, termosVersao: "falsa", termosAceitosEm: "2000-01-01" }), { ip: "203.0.113.9", userAgent: "UA-teste" })
    expect(r.ok).toBe(true)
    const c = cadastros()[0]
    expect(c.termosVersao).toBe(TERMOS_INICIAIS.versao)
    expect(Date.now() - new Date(c.termosAceitosEm!).getTime()).toBeLessThan(60_000)
    expect(c.termosIp).toBe("203.0.113.9"); expect(c.termosUserAgent).toBe("UA-teste")
    expect(statusTermos(c)).toBe("aceito")
  })
  it("o texto ao lado da caixa é o combinado com o Felipe", () => {
    expect(TEXTO_CAIXA_ACEITE).toBe("Li e aceito os termos. Não vou contatar nem atender diretamente, por 24 meses após o último serviço, clientes que a ENYLA me encaminhar.")
  })
})

describe("texto dos termos", () => {
  it("toda opção de serviço do formulário aparece no item 1, e o item termina como o Felipe pediu", () => {
    const t = renderTermos(TERMOS_INICIAIS.texto), item1 = t.split("\n")[0]
    for (const s of SERVICOS_PARCEIRO) expect(item1.toLowerCase()).toContain(s.nome.toLowerCase())
    expect(item1).toContain("e outros serviços informados no cadastro, como manuseio e montagem.")
    expect(t).not.toContain("{servicos}")
  })
  it("itens 5 e 6 com a redação final e título da versão 0.3", () => {
    expect(TERMOS_INICIAIS.texto).toContain("somente para chave na mesma titularidade do CNPJ ou CPF do cadastro.")
    expect(TERMOS_INICIAIS.texto).not.toContain("conferido o documento")
    expect(TERMOS_INICIAIS.texto).toContain("Quando a Parceira presta o próprio serviço de transporte, segue as instruções do pedido.")
    expect(TERMOS_INICIAIS.titulo).toBe("Termos de Parceria ENYLA, versão 0.3, aguardando revisão de advogado")
    expect(TERMOS_INICIAIS.rascunho).toBe(true)
  })
  it("lê da tabela quando há registro (trocar o registro dispensa deploy) e cai na 0.3 sem ele", async () => {
    expect((await lerTermosVigentes()).versao).toBe("0.3")
    estado.linhas = [{ versao: "1.0", titulo: "Final", texto: "x", rascunho: false, vigente_desde: "2026-12-01T00:00:00Z" }]
    const t = await lerTermosVigentes()
    expect(t.versao).toBe("1.0"); expect(t.rascunho).toBe(false)
  })
})

describe("quem já estava cadastrada", () => {
  it("fica pendente_termos e aceita pelo token do link, sem mensagem automática", async () => {
    estado.cfg = { cadastrosParceiros: [{ id: "PAR-1", nomeFantasia: "X" }] }
    expect(statusTermos(cadastros()[0])).toBe("pendente_termos")
    const token = await garantirTokenTermos("PAR-1")
    expect(token!.length).toBeGreaterThanOrEqual(16)
    expect(await garantirTokenTermos("PAR-1")).toBe(token)
    expect((await aceitarPorToken("token-errado-qualquer", {})).ok).toBe(false)
    expect(statusTermos(cadastros()[0])).toBe("pendente_termos")
    expect((await aceitarPorToken(token!, { ip: "1.1.1.1", userAgent: "UA" })).ok).toBe(true)
    expect(cadastros()[0].termosVersao).toBe("0.3"); expect(statusTermos(cadastros()[0])).toBe("aceito")
  })
})

describe("trava da distribuição", () => {
  const pend = { termosVersao: undefined, termosAceitosEm: undefined }
  it("parceira do /parceiros sem aceite não recebe pedido novo; com aceite recebe", () => {
    expect(podeReceberPedido({ ...pend, origem: "formulario" })).toBe(false)
    expect(podeReceberPedido({ termosVersao: "0.3", termosAceitosEm: "2026-11-26T00:00:00Z", origem: "formulario" })).toBe(true)
  })
  it("fornecedor em operação e pedido em produção nunca são bloqueados", () => {
    expect(podeReceberPedido({ ...pend, origem: "fornecedor_em_operacao" })).toBe(true)
    expect(podeReceberPedido({ ...pend, origem: "formulario" }, { emProducao: true })).toBe(true)
  })
})
