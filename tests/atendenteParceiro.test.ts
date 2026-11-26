// Atendente no modo "prospecto parceiro": IA, Supabase e Evolution simulados. Só fixtures fictícias.
import { describe, it, expect, vi, beforeEach } from "vitest"

type Linha = Record<string, unknown>
const mundo = vi.hoisted(() => ({
  prospectos: [] as Linha[], mensagens: [] as Linha[],
  cfg: {} as Record<string, unknown>,
  ia: vi.fn(async (..._a: unknown[]) => ({ texto: "", enviar_link: false, perguntas_sem_resposta: [] as string[] })),
}))

vi.mock("@/app/lib/claude", () => ({
  MODELO: "m",
  clienteClaude: () => ({ beta: { messages: { create: async (a: unknown) => ({ content: [{ type: "text", text: JSON.stringify(await mundo.ia(a)) }] }) } } }),
}))
vi.mock("@/app/lib/configAtomica", () => ({ lerCampos: vi.fn(async () => mundo.cfg), mudarConfig: vi.fn() }))
vi.mock("@/app/lib/supabase", () => ({
  supabase: {
    from: (tabela: string) => {
      const fonte = tabela === "prospectos_parceiros" ? mundo.prospectos : mundo.mensagens
      const filtros: ((r: Linha) => boolean)[] = []
      let patch: Linha | null = null
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.eq = (c: string, v: unknown) => { filtros.push(r => r[c] === v); return q }
      let desc = false
      q.order = (_c: string, o?: { ascending?: boolean }) => { desc = o?.ascending === false; return q }
      q.limit = () => q
      q.update = (p: Linha) => { patch = p; return q }
      const achar = () => { const l = fonte.filter(r => filtros.every(f => f(r))); return desc ? [...l].sort((a, b) => String(b.ts).localeCompare(String(a.ts))) : l }
      q.maybeSingle = async () => ({ data: structuredClone(achar()[0] ?? null), error: null })
      q.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => {
        const rs = achar()
        if (patch) rs.forEach(r => Object.assign(r, patch))
        return Promise.resolve({ data: structuredClone(rs), error: null }).then(ok, ko)
      }
      return q
    },
  },
}))

import { responderParceiro, dizSemPrecoFixo, pediuParaNaoReceber, perguntasSemResposta, ajustarLink, LINK_PARCEIROS, TEXTO_OPT_OUT } from "@/app/lib/atendenteParceiro"
import type { ProspectoDoJid } from "@/app/lib/prospectorTrava"

const JID = "5511987654321@s.whatsapp.net"
const QUARTA_12H = new Date("2026-11-25T15:00:00Z")
const DOMINGO = new Date("2026-11-29T15:00:00Z")
const dela = (corpo: string, ts = "2026-11-25T14:59:00Z") => ({ jid: JID, from_me: false, corpo, ts })
const nossa = (corpo: string, ts = "2026-11-25T14:00:00Z") => ({ jid: JID, from_me: true, corpo, ts })

let enviar: ReturnType<typeof vi.fn>, avisar: ReturnType<typeof vi.fn>
const prosp = () => mundo.prospectos[0] as unknown as ProspectoDoJid
const deps = (agora = QUARTA_12H) => ({ enviar, avisar, agora })
const hist = () => (mundo.prospectos[0].historico_etapas as Linha[])

beforeEach(() => {
  mundo.prospectos = [{ id: 1, razao_social: "Gráfica Teste", nome_fantasia: "Teste", telefone: "(11) 98765-4321", etapa: "abordado", opt_out: false, historico_etapas: [], atualizado_em: "2026-11-25T10:00:00Z" }]
  mundo.mensagens = [nossa("Oi! Somos a ENYLA, queremos você como parceira."), dela("Como funciona?")]
  mundo.cfg = { apiKey: "k", conhecimentoAgente: [{ id: "felipe-1", tema: "processo", texto: "Cadastro de parceiro leva uns 5 minutos e o Felipe chama no WhatsApp.", em: "x" }], cadastrosParceiros: [] }
  mundo.ia.mockReset()
  mundo.ia.mockResolvedValue({ texto: "O cadastro leva uns 5 minutos. Depois o Felipe analisa e chama você aqui.", enviar_link: true, perguntas_sem_resposta: [] })
  enviar = vi.fn(async () => ({ ids: ["W1"] })); avisar = vi.fn(async () => undefined)
})

describe("resposta da IA à gráfica do Prospector", () => {
  it("responde em vez de ficar calado, com o link oficial, move para respondeu e registra por atendente_auto", async () => {
    const r = await responderParceiro(prosp(), JID, deps())
    expect(r.enviou).toBe(true)
    expect(enviar).toHaveBeenCalledTimes(1)
    const texto = enviar.mock.calls[0][0] as string
    expect(texto).toContain(LINK_PARCEIROS)
    expect(texto).not.toMatch(/www\./)
    expect(mundo.prospectos[0].etapa).toBe("respondeu")
    const msg = hist().find(h => h.mensagem)?.mensagem as Linha
    expect(msg).toMatchObject({ direcao: "enviada", por: "atendente_auto", texto })
  })
  it("o prompt é de parceria: sem orçamento, com o pagamento oficial e o link certo", async () => {
    await responderParceiro(prosp(), JID, deps())
    const sistema = String((mundo.ia.mock.calls[0][0] as { system: string }).system)
    expect(sistema).toContain("pagamos 50% antes do serviço e 50% na retirada, por PIX")
    expect(sistema).toContain("https://app.enyla.com.br/parceiros")
    expect(sistema).toMatch(/NÃO orça/)
    expect(sistema).toContain("uns 5 minutos")   // conhecimentoAgente
  })
  it("link: o www vira o oficial e não repete quando já foi enviado", async () => {
    mundo.ia.mockResolvedValue({ texto: "Cadastre em https://www.enyla.com.br/parceiros ok", enviar_link: true, perguntas_sem_resposta: [] })
    await responderParceiro(prosp(), JID, deps())
    expect(enviar.mock.calls[0][0]).toBe(`Cadastre em ${LINK_PARCEIROS} ok`)
    mundo.mensagens = [nossa(`Cadastre em ${LINK_PARCEIROS}`), dela("E o pagamento?", "2026-11-25T14:59:30Z")]
    mundo.ia.mockResolvedValue({ texto: `Pagamos 50% antes e 50% na retirada. ${LINK_PARCEIROS}`, enviar_link: true, perguntas_sem_resposta: [] })
    enviar.mockClear()
    await responderParceiro(prosp(), JID, deps())
    expect(enviar.mock.calls[0][0]).not.toContain("enyla.com.br")
  })
  it("cadastro já feito com o mesmo telefone: não manda o link e marca cadastrou", async () => {
    mundo.cfg.cadastrosParceiros = [{ id: "c1", status: "novo", whatsapp: "11987654321", documento: "" }]
    await responderParceiro(prosp(), JID, deps())
    expect(enviar.mock.calls[0][0]).not.toContain("enyla.com.br")
    expect(mundo.prospectos[0].etapa).toBe("cadastrou")
  })
  it("valor em reais: nada sai e o Felipe é avisado", async () => {
    mundo.ia.mockResolvedValue({ texto: "A caixa sai por R$ 2,50.", enviar_link: false, perguntas_sem_resposta: [] })
    const r = await responderParceiro(prosp(), JID, deps())
    expect(r.enviou).toBe(false)
    expect(enviar).not.toHaveBeenCalled()
    expect(avisar).toHaveBeenCalledTimes(1)
  })
  it("fora da janela das 8h às 20h (ou fim de semana): nada sai, nem IA", async () => {
    const r = await responderParceiro(prosp(), JID, deps(DOMINGO))
    expect(r.enviou).toBe(false)
    expect(enviar).not.toHaveBeenCalled()
    expect(mundo.ia).not.toHaveBeenCalled()
  })
  it.each([{ opt_out: true, etapa: "descartado" }, { opt_out: false, etapa: "descartado" }])("lista de exclusão %o: nada sai", async ex => {
    Object.assign(mundo.prospectos[0], ex)
    expect((await responderParceiro(prosp(), JID, deps())).enviou).toBe(false)
    expect(enviar).not.toHaveBeenCalled(); expect(mundo.ia).not.toHaveBeenCalled()
  })
})

describe("parceira sem preço fixo (orcamento_por_pedido)", () => {
  it.each(["Nosso preço varia de pedido para pedido", "Depende do pedido", "Não temos tabela de preço", "Cada serviço tem um valor"])("reconhece %s", t => expect(dizSemPrecoFixo([t])).toBe(true))
  it.each(["Como funciona?", "Qual o prazo de pagamento?"])("não confunde %s", t => expect(dizSemPrecoFixo([t])).toBe(false))
  it("explica as duas regras no prompt, registra o modo e não cita valor da ENYLA", async () => {
    mundo.mensagens = [nossa("Oi!"), dela("Nosso preço varia de pedido para pedido")]
    mundo.ia.mockResolvedValue({ texto: "Entendi! Quem cadastra preço e prazo médio recebe prioridade; sem isso, avisamos a cada pedido para você orçar. Prefere passar um preço de referência e o prazo médio?", enviar_link: false, perguntas_sem_resposta: [] })
    const r = await responderParceiro(prosp(), JID, deps())
    expect(r.enviou).toBe(true)
    const sistema = String((mundo.ia.mock.calls[0][0] as { system: string }).system)
    expect(sistema).toContain("recebe prioridade"); expect(sistema).toContain("preço de referência e o prazo médio"); expect(sistema).toMatch(/sem citar valor da ENYLA nem prometer volume/)
    expect(hist().some(h => h.modo_parceira === "orcamento_por_pedido")).toBe(true)
  })
  it("sem a frase, o prompt não traz a regra e nada é registrado", async () => {
    await responderParceiro(prosp(), JID, deps())
    expect(String((mundo.ia.mock.calls[0][0] as { system: string }).system)).not.toContain("recebe prioridade")
    expect(hist().some(h => h.modo_parceira)).toBe(false)
  })
  it("opt-out continua valendo", async () => {
    mundo.mensagens = [nossa("Oi!"), dela("Varia de pedido para pedido, mas não tenho interesse")]
    await responderParceiro(prosp(), JID, deps())
    expect(enviar).toHaveBeenCalledWith(TEXTO_OPT_OUT); expect(mundo.ia).not.toHaveBeenCalled()
  })
})

describe("perguntas sem resposta oficial", () => {
  it.each([["Tem algum custo para entrar?", "custo"], ["Vocês pedem exclusividade?", "exclusividade"], ["Qual o volume de serviço por mês?", "volume"]])("%s", async (pergunta, tema) => {
    mundo.mensagens = [nossa("Oi!"), dela(pergunta)]
    mundo.ia.mockResolvedValue({ texto: "O cadastro leva uns 5 minutos. Esse ponto o Felipe confirma com você.", enviar_link: false, perguntas_sem_resposta: [] })
    const r = await responderParceiro(prosp(), JID, deps())
    expect(r.enviou).toBe(true)   // a conversa não trava
    expect(enviar.mock.calls[0][0]).toBe("O cadastro leva uns 5 minutos. Esse ponto o Felipe confirma com você.")   // texto da IA, sem acréscimo inventado
    const p = hist().find(h => h.pergunta_pendente)?.pergunta_pendente as Linha
    expect(p).toMatchObject({ tema, texto: pergunta })
    expect(avisar).toHaveBeenCalledTimes(1)
    expect(String(avisar.mock.calls[0][0])).toContain(pergunta)
  })
  it("a IA também pode apontar o tema", async () => {
    mundo.ia.mockResolvedValue({ texto: "O Felipe confirma.", enviar_link: false, perguntas_sem_resposta: ["exclusividade"] })
    await responderParceiro(prosp(), JID, deps())
    expect(hist().some(h => (h.pergunta_pendente as Linha | undefined)?.tema === "exclusividade")).toBe(true)
  })
  it("pergunta com resposta oficial não gera pendência", async () => {
    mundo.mensagens = [nossa("Oi!"), dela("Como vocês pagam?")]
    await responderParceiro(prosp(), JID, deps())
    expect(hist().some(h => h.pergunta_pendente)).toBe(false)
    expect(avisar).not.toHaveBeenCalled()
  })
  it("detecção", () => {
    expect(perguntasSemResposta(["Oi, qual o custo?", "é exclusivo?"])).toEqual(["custo", "exclusividade"])
    expect(perguntasSemResposta(["Quando começa?"])).toEqual([])
  })
})

describe("opt-out", () => {
  it.each(["Não tenho interesse", "pare", "Sair", "remover", "Não quero mais receber mensagens"])("%s", async texto => {
    expect(pediuParaNaoReceber(texto)).toBe(true)
  })
  it.each(["Quando vai sair o pagamento?", "Pode parar na minha loja?", "Tenho interesse"])("não é opt-out: %s", async texto => {
    expect(pediuParaNaoReceber(texto)).toBe(false)
  })
  it("confirma uma vez, marca opt_out e registra; depois nada mais sai", async () => {
    mundo.mensagens = [nossa("Oi!"), dela("Não tenho interesse, pare de mandar")]
    const r = await responderParceiro(prosp(), JID, deps())
    expect(r.enviou).toBe(true)
    expect(enviar).toHaveBeenCalledTimes(1)
    expect(enviar).toHaveBeenCalledWith(TEXTO_OPT_OUT)
    expect(mundo.ia).not.toHaveBeenCalled()
    expect(mundo.prospectos[0]).toMatchObject({ opt_out: true, etapa: "descartado" })
    expect(mundo.prospectos[0].opt_out_em).toBeTruthy()
    expect(hist().some(h => /não receber/.test(String(h.motivo)))).toBe(true)
    // a gráfica escreve de novo: a lista de exclusão barra
    mundo.mensagens.push(dela("ok", "2026-11-25T15:30:00Z"))
    enviar.mockClear()
    expect((await responderParceiro(prosp(), JID, deps())).enviou).toBe(false)
    expect(enviar).not.toHaveBeenCalled()
  })
  it("ordem de diretor ou Prospector depois do opt-out: travasDoProspecto barra", async () => {
    const { travasDoProspecto } = await import("@/app/lib/ordemProspecto")
    mundo.mensagens = [nossa("Oi!"), dela("pare")]
    await responderParceiro(prosp(), JID, deps())
    expect(travasDoProspecto(prosp(), QUARTA_12H)?.status).toBe(409)
  })
})

describe("ajustarLink", () => {
  it("sem permissão: troca por referência ao link anterior", () => {
    expect(ajustarLink("Veja https://app.enyla.com.br/parceiros", { pode: false, quer: true })).toBe("Veja o link que já te enviei")
  })
  it("com permissão e sem link no texto: acrescenta o oficial", () => {
    expect(ajustarLink("Faça o cadastro.", { pode: true, quer: true })).toBe(`Faça o cadastro.\n\n${LINK_PARCEIROS}`)
  })
})
