// Rascunho de cadastro de parceiro pela conversa do WhatsApp (issue #252): IA, Supabase e config simulados. Só fixtures fictícias.
import { describe, it, expect, vi, beforeEach } from "vitest"

type Linha = Record<string, unknown>
const mundo = vi.hoisted(() => ({
  prospectos: [] as Linha[], mensagens: [] as Linha[],
  cfg: {} as Record<string, unknown>,
  ia: vi.fn(async (..._a: unknown[]) => ({ texto: "", enviar_link: false, perguntas_sem_resposta: [] as string[] })),
  extrai: vi.fn(async (..._a: unknown[]) => ({}) as Record<string, unknown>),
}))

vi.mock("@/app/lib/claude", () => ({
  MODELO: "m",
  clienteClaude: () => ({ beta: { messages: { create: async (a: { system: string }) => ({ content: [{ type: "text", text: JSON.stringify(a.system.includes("extrai os dados") ? await mundo.extrai(a) : await mundo.ia(a)) }] }) } } }),
}))
vi.mock("@/app/lib/configAtomica", () => ({ lerCampos: vi.fn(async () => mundo.cfg), mudarConfig: vi.fn(async (f: (d: Record<string, unknown>) => Record<string, unknown>) => { Object.assign(mundo.cfg, f(mundo.cfg)) }) }))
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

import { responderParceiro } from "@/app/lib/atendenteParceiro"
import type { ProspectoDoJid } from "@/app/lib/prospectorTrava"
import type { CadastroParceiro } from "@/app/lib/parceiros"

const JID = "5511987654321@s.whatsapp.net"
const QUARTA_12H = new Date("2026-11-25T15:00:00Z")
const dela = (corpo: string, ts: string) => ({ jid: JID, from_me: false, corpo, ts })
const nossa = (corpo: string, ts: string) => ({ jid: JID, from_me: true, corpo, ts })

let enviar: ReturnType<typeof vi.fn>, avisar: ReturnType<typeof vi.fn>
const prosp = () => mundo.prospectos[0] as unknown as ProspectoDoJid
const rodar = () => responderParceiro(prosp(), JID, { enviar, avisar, agora: QUARTA_12H })
const lista = () => (mundo.cfg.cadastrosParceiros ?? []) as CadastroParceiro[]
const servico = (o: Record<string, unknown> = {}) => ({ id: "colagem", qual: null, cobranca: null, valor: null, acerto: null, prazoDias: null, prazoVaria: null, formatoL: null, formatoA: null, obs: null, ...o })
const vazio = { responsavel: null, email: null, documento: null, cep: null, rua: null, numero: null, bairro: null, cidade: null, uf: null }
const sistemaDaResposta = () => String((mundo.ia.mock.calls.at(-1)![0] as { system: string }).system)

beforeEach(() => {
  mundo.prospectos = [{ id: 3384, razao_social: "Gráfica Teste Ltda", nome_fantasia: "Teste", telefone: "(11) 98765-4321", etapa: "abordado", opt_out: false, historico_etapas: [], atualizado_em: "2026-11-25T10:00:00Z" }]
  mundo.mensagens = [nossa("Oi! Cadastro: https://app.enyla.com.br/parceiros", "2026-11-25T14:00:00Z"), dela("Fazemos acabamento e manuseio manual, segue o folheto", "2026-11-25T14:59:00Z")]
  mundo.cfg = { apiKey: "k", conhecimentoAgente: [], cadastrosParceiros: [] }
  mundo.ia.mockReset(); mundo.extrai.mockReset()
  mundo.ia.mockResolvedValue({ texto: "Obrigado! Anotei os serviços. Qual o prazo médio?", enviar_link: false, perguntas_sem_resposta: [] })
  mundo.extrai.mockResolvedValue({ ...vazio, servicos: [servico()] })
  enviar = vi.fn(async () => ({ ids: ["W1"] })); avisar = vi.fn(async () => undefined)
})

describe("rascunho de cadastro pela conversa", () => {
  it("mensagem com serviços gera rascunho do prospecto e a resposta pede só o que falta", async () => {
    const r = await rodar()
    expect(r.enviou).toBe(true)
    expect(lista()).toHaveLength(1)
    const c = lista()[0]
    expect(c).toMatchObject({ origem: "prospector", prospectoId: 3384, status: "novo", nomeFantasia: "Teste" })
    expect(c.servicos.map(s => s.id)).toEqual(["colagem"])
    expect(c.faltando?.length).toBeGreaterThan(0)
    const sistema = sistemaDaResposta()
    expect(sistema).toContain("pergunte SÓ o que falta")
    expect(sistema).toContain("Ainda falta:")
    expect(sistema).toContain("prazo médio")
    expect(sistema).toMatch(/não repita o link/i)
    expect(sistema).toContain("nunca aprova")
    expect(enviar.mock.calls[0][0]).not.toContain("enyla.com.br")   // o link já foi
    expect(mundo.prospectos[0].etapa).toBe("respondeu")
    expect(avisar).not.toHaveBeenCalled()
  })
  it("segunda mensagem com preço atualiza o mesmo rascunho, sem duplicar", async () => {
    await rodar()
    const id = lista()[0].id
    mundo.mensagens.push(nossa("Obrigado! Qual o prazo?", "2026-11-25T15:10:00Z"), dela("Prazo de 3 dias, 120 o milheiro", "2026-11-25T15:20:00Z"))
    mundo.extrai.mockResolvedValue({ ...vazio, servicos: [servico({ cobranca: "milheiro", valor: 120, prazoDias: 3 })] })
    await responderParceiro(prosp(), JID, { enviar, avisar, agora: new Date("2026-11-25T15:30:00Z") })
    expect(lista()).toHaveLength(1)
    expect(lista()[0].id).toBe(id)
    expect(lista()[0].servicos[0]).toMatchObject({ id: "colagem", valor: 120, prazoDias: 3, cobranca: "milheiro" })
    expect(lista()[0].faltando).not.toContain("prazo médio em dias úteis (Colagem)")
  })
  it("rascunho completo fica pendente de análise (nunca aprovado), avisa o Felipe uma vez e vai para cadastrou", async () => {
    mundo.extrai.mockResolvedValue({ responsavel: "Maria Teste", email: "contato@exemplo.test", documento: "11222333000181", cep: "01001000", rua: "Rua Teste", numero: "10", bairro: "Centro", cidade: "São Paulo", uf: "SP",
      servicos: [servico({ cobranca: "milheiro", valor: 120, prazoDias: 3 })] })
    mundo.ia.mockResolvedValue({ texto: "Recebemos tudo! O Felipe analisa e chama você aqui.", enviar_link: false, perguntas_sem_resposta: [] })
    await rodar()
    const c = lista()[0]
    expect(c.faltando).toEqual([])
    expect(c.status).toBe("novo")
    expect(c.status).not.toBe("aprovado")
    expect(c.origem).toBe("prospector")
    expect(avisar).toHaveBeenCalledTimes(1)
    expect(String(avisar.mock.calls[0][0])).toContain("Pendente da sua análise")
    expect(mundo.prospectos[0].etapa).toBe("cadastrou")
    const hist = mundo.prospectos[0].historico_etapas as { motivo?: string; etapa: string }[]
    expect(hist.some(h => /rascunho de cadastro .* completo/.test(String(h.motivo)))).toBe(true)
    expect(sistemaDaResposta()).toContain("COMPLETO")
  })
  it("rascunho já aprovado pelo Felipe não é mexido", async () => {
    mundo.cfg.cadastrosParceiros = [{ id: "PAR-X", status: "aprovado", origem: "prospector", prospectoId: 3384, whatsapp: "11987654321", servicos: [], arquivos: [] }]
    await rodar()
    expect(lista()).toHaveLength(1)
    expect(lista()[0].status).toBe("aprovado")
    expect(mundo.extrai).not.toHaveBeenCalled()
  })
  it("mensagem sem dado (dúvida) não chama a extração nem cria rascunho", async () => {
    mundo.mensagens = [nossa("Oi!", "2026-11-25T14:00:00Z"), dela("Como funciona?", "2026-11-25T14:59:00Z")]
    await rodar()
    expect(mundo.extrai).not.toHaveBeenCalled()
    expect(lista()).toHaveLength(0)
  })
  it("extração vazia não cria rascunho, mas a resposta sai", async () => {
    mundo.extrai.mockResolvedValue({ ...vazio, servicos: [] })
    expect((await rodar()).enviou).toBe(true)
    expect(lista()).toHaveLength(0)
  })
  it("prospecto em opt-out ou descartado não gera nada", async () => {
    for (const ex of [{ opt_out: true, etapa: "descartado" }, { opt_out: false, etapa: "descartado" }]) {
      Object.assign(mundo.prospectos[0], ex)
      expect((await rodar()).enviou).toBe(false)
    }
    expect(lista()).toHaveLength(0); expect(mundo.extrai).not.toHaveBeenCalled(); expect(enviar).not.toHaveBeenCalled()
  })
  it("pedido de opt-out na mesma mensagem dos dados: confirma e não grava rascunho", async () => {
    mundo.mensagens.push(dela("Não tenho interesse, pare de mandar", "2026-11-25T14:59:30Z"))
    await rodar()
    expect(lista()).toHaveLength(0)
    expect(mundo.prospectos[0]).toMatchObject({ opt_out: true, etapa: "descartado" })
  })
  it("rascunho incompleto não conta como cadastro feito (o link ainda pode ir)", async () => {
    mundo.mensagens = [nossa("Oi!", "2026-11-25T14:00:00Z"), dela("Fazemos colagem manual", "2026-11-25T14:59:00Z")]
    await rodar()
    expect(sistemaDaResposta()).not.toContain("JÁ fez o cadastro")
    expect(sistemaDaResposta()).toContain("Mande o link")
  })
  it("a IA citar valor em reais continua segurando a resposta, mas o rascunho fica guardado", async () => {
    mundo.ia.mockResolvedValue({ texto: "Anotei R$ 120 o milheiro.", enviar_link: false, perguntas_sem_resposta: [] })
    expect((await rodar()).enviou).toBe(false)
    expect(lista()).toHaveLength(1)
  })
})
