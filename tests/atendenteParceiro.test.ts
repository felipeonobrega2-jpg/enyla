// Atendente no modo "prospecto parceiro" (lib/atendenteParceiro): classificação, link oficial, opt-out, pergunta sem resposta
// e registro no funil. Supabase, IA e envio são simulados; fixtures fictícias.
import { describe, it, expect, vi, beforeEach } from "vitest"

type Linha = Record<string, unknown>
const mundo = vi.hoisted(() => ({ linhas: [] as Linha[] }))
vi.mock("@/app/lib/evolution", () => ({ evo: vi.fn() }))
vi.mock("@/app/lib/email", () => ({ enviarEmail: vi.fn() }))
vi.mock("@/app/lib/configAtomica", () => ({ lerCampos: vi.fn(async () => ({})), mudarConfig: vi.fn() }))
vi.mock("@/app/lib/supabase", () => ({
  supabase: {
    from: () => {
      const filtros: ((r: Linha) => boolean)[] = []
      let mudanca: Linha | null = null
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.update = (c: Linha) => { mudanca = c; return q }
      q.eq = (c: string, v: unknown) => { filtros.push(r => r[c] === v); return q }
      q.maybeSingle = async () => ({ data: structuredClone(mundo.linhas.find(r => filtros.every(f => f(r))) ?? null), error: null })
      q.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => {
        const achadas = mundo.linhas.filter(r => filtros.every(f => f(r)))
        if (mudanca) for (const r of achadas) Object.assign(r, mudanca)
        return Promise.resolve({ data: structuredClone(achadas), error: null }).then(ok, ko)
      }
      return q
    },
  },
}))

import { classificarMensagem, responderProspectoParceiro, promptParceria, TEXTO_OPT_OUT, type Deps } from "@/app/lib/atendenteParceiro"
import { travasDoProspecto } from "@/app/lib/ordemProspecto"
import type { ProspectoDoJid } from "@/app/lib/prospectorTrava"

const LINK = "https://app.enyla.com.br/parceiros"
const util = new Date("2026-11-26T15:00:00Z")   // quinta, 12h em São Paulo
const JID = "5511900000001@s.whatsapp.net"

const nova = (extra: Linha = {}): Linha => ({ id: 1, razao_social: "Gráfica Alfa", nome_fantasia: null, telefone: "11900000001", etapa: "abordado", opt_out: false, historico_etapas: [], atualizado_em: "2026-11-26T10:00:00Z", ...extra })
const atual = () => mundo.linhas[0] as unknown as ProspectoDoJid
const hist = () => atual().historico_etapas as Record<string, unknown>[]

const fazerDeps = (extra: Partial<Deps> = {}) => {
  const enviados: string[] = []
  const logs: Record<string, unknown>[] = []
  const avisos: string[] = []
  const deps: Deps = {
    agora: () => util,
    mensagens: async () => [{ from_me: true, corpo: "Oi! Somos a ENYLA." }, { from_me: false, corpo: "oi" }],
    conhecimento: async () => [{ id: "k1", tema: "processo", texto: "O cadastro de parceiros é gratuito, sem exclusividade e sem volume prometido.", em: "2026-11-26T10:31:00Z" }],
    ia: vi.fn(async () => ({ texto: "Fazemos sim. O cadastro é gratuito.", enviar_link: true, pergunta_pendente: null })),
    reservar: async () => true,
    enviar: async t => { enviados.push(t); return { ids: ["W1"] } },
    registrarLog: async r => { logs.push(r) },
    avisar: async m => { avisos.push(m) },
    ...extra,
  }
  return { deps, enviados, logs, avisos }
}
const responder = (texto: string, d: Deps) => responderProspectoParceiro(JID, atual(), texto, d)

beforeEach(() => { mundo.linhas = [nova()] })

describe("classificarMensagem", () => {
  it.each(["sim", "Sim, tenho interesse", "pode mandar", "quero", "manda o link", "Tenho sim"])("%s = sim", t => expect(classificarMensagem(t)).toBe("sim"))
  it.each(["não tenho interesse", "pare", "Remover", "sair", "não quero receber mais", "Sem interesse", "não", "stop"])("%s = não", t => expect(classificarMensagem(t)).toBe("nao"))
  it.each(["quanto custa para entrar?", "vocês pagam como?", "Já fui cadastrada em outro lugar, como funciona o prazo de vocês para pagar os serviços que a gente faz?", "", "bom dia"])("%s = dúvida", t => expect(classificarMensagem(t)).toBe("duvida"))
  it("palavra de parada dentro de frase longa não é opt-out", () => expect(classificarMensagem("Vou sair da gráfica às 17h, pode me ligar amanhã para explicar o programa de vocês?")).toBe("duvida"))
})

describe("responderProspectoParceiro", () => {
  it("sim: manda o link oficial uma vez, sem chamar a IA, e registra link_enviado", async () => {
    const { deps, enviados } = fazerDeps()
    const r = await responder("sim, quero", deps)
    expect(r).toMatchObject({ ok: true, classe: "sim", link: true })
    expect(deps.ia).not.toHaveBeenCalled()
    expect(enviados[0]).toContain(LINK)
    expect(hist().some(h => h.link_enviado === true && (h.mensagem as { por: string }).por === "atendente_auto")).toBe(true)
    // segunda vez: não repete o link
    const d2 = fazerDeps()
    await responder("sim", d2.deps)
    expect(d2.enviados[0]).not.toContain("https://")
  })
  it("dúvida: responde pelo conhecimento, conduz ao link (uma vez) e o link é sempre o oficial, nunca o www", async () => {
    const { deps, enviados } = fazerDeps({ ia: vi.fn(async () => ({ texto: "Cadastro gratuito! Acesse https://www.app.enyla.com.br/parceiros ou www.enyla.com.br/parceiros", enviar_link: true, pergunta_pendente: null })) })
    const r = await responder("tem custo para entrar?", deps)
    expect(r.ok).toBe(true)
    expect(enviados[0]).toContain(LINK)
    expect(enviados[0]).not.toMatch(/www\./)
    expect(enviados[0].match(/enyla\.com\.br/g)).toHaveLength(1)
    const sistema = vi.mocked(deps.ia).mock.calls[0][0]
    expect(sistema).toContain("gratuito, sem exclusividade e sem volume prometido")
    expect(sistema).toContain("50% antes do serviço e 50% na retirada, por PIX")
    expect(sistema).toContain("não orça")
  })
  it("pergunta coberta pelo conhecimento: nada vai ao Felipe", async () => {
    const { deps, avisos } = fazerDeps()
    await responder("é exclusivo? tem volume mínimo?", deps)
    expect(avisos).toHaveLength(0)
    expect(hist().some(h => "pergunta_pendente" in h)).toBe(false)
  })
  it("pergunta fora do conhecimento: responde o resto, registra pergunta_pendente e avisa o Felipe, sem texto inventado", async () => {
    const { deps, enviados, avisos } = fazerDeps({ ia: vi.fn(async () => ({ texto: "O cadastro é gratuito. Sobre o prazo de pagamento da nota fiscal, o Felipe confirma com você.", enviar_link: false, pergunta_pendente: "prazo para emitir nota fiscal" })) })
    const r = await responder("é gratuito? e em quantos dias vocês pagam a nota fiscal?", deps)
    expect(r).toMatchObject({ ok: true, perguntaPendente: "prazo para emitir nota fiscal" })
    expect(enviados[0]).toContain("o Felipe confirma")
    expect(hist().some(h => h.pergunta_pendente === "prazo para emitir nota fiscal")).toBe(true)
    expect(avisos[0]).toContain("prazo para emitir nota fiscal")
  })
  it("resposta da IA com valor em reais fica segurada", async () => {
    const { deps, enviados } = fazerDeps({ ia: vi.fn(async () => ({ texto: "Pagamos R$ 500 por serviço.", enviar_link: false, pergunta_pendente: null })) })
    expect(await responder("quanto pagam?", deps)).toMatchObject({ ok: false, motivo: "com_valor" })
    expect(enviados).toHaveLength(0)
  })
  it("não / pedido de parar: confirma uma vez, marca opt_out e nada mais sai (nem Prospector, nem ordem de diretor)", async () => {
    const { deps, enviados } = fazerDeps()
    const r = await responder("não tenho interesse, pare de mandar mensagem", deps)
    expect(r).toMatchObject({ ok: true, classe: "nao", optOut: true })
    expect(enviados).toEqual([TEXTO_OPT_OUT])
    expect(deps.ia).not.toHaveBeenCalled()
    expect(atual()).toMatchObject({ opt_out: true, etapa: "descartado" })
    expect(typeof (mundo.linhas[0] as { opt_out_em?: string }).opt_out_em).toBe("string")
    expect(hist().some(h => String(h.motivo).includes("pediu para não receber mais"))).toBe(true)
    expect(hist().some(h => (h.mensagem as { por?: string } | undefined)?.por === "atendente_auto")).toBe(true)
    // mensagem seguinte: nada sai
    const d2 = fazerDeps()
    expect(await responder("ok", d2.deps)).toMatchObject({ ok: false, motivo: "excluido" })
    expect(d2.enviados).toHaveLength(0)
    // ordem de diretor e cadência: travas do Prospector recusam
    expect(travasDoProspecto(atual(), util)).toMatchObject({ status: 409 })
  })
  it("prospecto excluído (opt-out ou descartado) não recebe resposta", async () => {
    for (const extra of [{ opt_out: true, etapa: "descartado" }, { etapa: "descartado" }]) {
      mundo.linhas = [nova(extra)]
      const { deps, enviados } = fazerDeps()
      expect(await responder("sim", deps)).toMatchObject({ ok: false, motivo: "excluido" })
      expect(enviados).toHaveLength(0)
    }
  })
  it("fora da janela das 8h às 20h (e fim de semana): nada sai e nada é reservado", async () => {
    const reservar = vi.fn(async () => true)
    for (const agora of [new Date("2026-11-26T23:30:00Z"), new Date("2026-11-28T15:00:00Z")]) {
      const { deps, enviados } = fazerDeps({ agora: () => agora, reservar })
      expect(await responder("sim", deps)).toMatchObject({ ok: false, motivo: "fora_da_janela" })
      expect(enviados).toHaveLength(0)
    }
    expect(reservar).not.toHaveBeenCalled()
  })
  it("uma resposta por mensagem: reserva já tomada = não envia", async () => {
    const { deps, enviados } = fazerDeps({ reservar: async () => false })
    expect(await responder("sim", deps)).toMatchObject({ ok: false, motivo: "ja_tratada" })
    expect(enviados).toHaveLength(0)
  })
  it("IA falhou: nada é enviado e o motivo fica no registro", async () => {
    const { deps, enviados, logs } = fazerDeps({ ia: vi.fn(async () => { throw new Error("sem crédito") }) })
    expect(await responder("como funciona?", deps)).toMatchObject({ ok: false, motivo: "ia_falhou" })
    expect(enviados).toHaveLength(0)
    expect(String(logs[0].motivo)).toContain("IA falhou")
  })
  it("toda resposta da gráfica leva a etapa para respondeu e registra a mensagem recebida; cada resposta da IA vai ao histórico e ao registro", async () => {
    const { deps, logs } = fazerDeps()
    await responder("como funciona?", deps)
    expect(atual().etapa).toBe("respondeu")
    expect(hist()[0]).toMatchObject({ etapa: "respondeu", mensagem: { direcao: "recebida" } })
    expect(hist().some(h => (h.mensagem as { direcao: string } | undefined)?.direcao === "enviada")).toBe(true)
    expect(logs.some(l => l.enviou === true)).toBe(true)
  })
  it("não recua etapa: quem já cadastrou continua cadastrou", async () => {
    mundo.linhas = [nova({ etapa: "cadastrou" })]
    await responder("obrigado", fazerDeps().deps)
    expect(atual().etapa).toBe("cadastrou")
  })
})

describe("promptParceria", () => {
  it("não é de venda e não orça; com o link já enviado, manda não repetir", () => {
    const p = promptParceria([], "", true)
    expect(p).toContain("NÃO é de venda")
    expect(p).toContain("não orça")
    expect(p).toContain("JÁ foi enviado")
    expect(promptParceria([], "", false)).toContain(LINK)
  })
})
