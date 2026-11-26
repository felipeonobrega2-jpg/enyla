// Biblioteca de textos do Prospector (teste A/B): sorteio, fallback, nome só de gente, versão gravada no envio e contagem por versão.
// Supabase, Evolution e Resend são simulados: nada é enviado de verdade.
import { describe, it, expect, vi, beforeEach } from "vitest"
import { ativosDaEtapa, classificarResposta, contarPorVersao, escolherTexto, montarTexto, novaVersao, sortearTexto, textoPrimeiroContato, TEXTOS_PADRAO, type TextoProspector } from "@/app/lib/prospectorTextos"

type Linha = Record<string, unknown>
const mundo = vi.hoisted(() => ({ cfg: {} as Record<string, unknown>, prospectos: [] as Record<string, unknown>[], textos: [] as Record<string, unknown>[] }))
const envios = vi.hoisted(() => ({
  evo: vi.fn(async (..._a: unknown[]) => ({ ok: true, status: 200, corpo: { key: { id: "ABC" } } })),
  email: vi.fn(async (..._a: unknown[]) => ({ ok: true as const, id: "e1" })),
}))
vi.mock("@/app/lib/configAtomica", () => ({
  lerCampos: vi.fn(async (campos: string[]) => Object.fromEntries(campos.filter(c => c in mundo.cfg).map(c => [c, mundo.cfg[c]]))),
}))
vi.mock("@/app/lib/evolution", () => ({ evo: envios.evo }))
vi.mock("@/app/lib/email", () => ({ enviarEmail: envios.email }))
vi.mock("@/app/lib/supabase", () => ({
  supabase: {
    from: (tabela: string) => {
      const fonte = tabela === "prospectos_parceiros" ? mundo.prospectos : tabela === "dados_sistema" ? mundo.textos : []
      const filtros: ((r: Linha) => boolean)[] = []
      let patch: Linha | null = null
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.update = (p: Linha) => { patch = p; return q }
      q.eq = (c: string, v: unknown) => { filtros.push(r => r[c] === v); return q }
      q.in = (c: string, vs: unknown[]) => { filtros.push(r => vs.includes(r[c])); return q }
      q.gte = (c: string, v: number | string) => { filtros.push(r => r[c] != null && (r[c] as number | string) >= v); return q }
      q.or = () => q
      q.contains = () => q
      q.order = () => q
      q.limit = () => q
      q.range = () => q
      const rodar = () => {
        const rs = fonte.filter(r => filtros.every(f => f(r)))
        if (patch) { for (const r of rs) Object.assign(r, structuredClone(patch)); return { data: rs.map(r => ({ id: r.id })), error: null } }
        return { data: structuredClone(rs), error: null }
      }
      q.maybeSingle = async () => { const r = rodar(); return { data: (r.data as Linha[])[0] ?? null, error: null } }
      q.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(rodar()).then(ok, ko)
      return q
    },
  },
}))

import { executarEnvio } from "@/app/lib/prospectorEnvioServidor"

const SEG_10H = new Date("2026-11-23T13:00:00Z")
const t = (id: string, etapa: TextoProspector["etapa"], rotulo: string, ativo: boolean, criadoEm = "2026-11-20T10:00:00Z", corpo = `corpo ${rotulo}`): TextoProspector => ({ id, etapa, rotulo, corpo, ativo, criadoEm })

describe("sorteio com peso igual", () => {
  const lib = [t("a", "primeira", "A", true, "2026-11-20T10:00:00Z"), t("b", "primeira", "B", true, "2026-11-21T10:00:00Z"), t("c", "primeira", "C", false), t("s", "resposta_sim", "A", true)]
  it("só entra versão ativa da mesma etapa", () => {
    expect(ativosDaEtapa(lib, "primeira").map(x => x.id)).toEqual(["a", "b"])
  })
  it("divide o intervalo [0,1) igualmente entre as ativas", () => {
    expect(sortearTexto(lib, "primeira", () => 0)?.id).toBe("a")
    expect(sortearTexto(lib, "primeira", () => 0.49)?.id).toBe("a")
    expect(sortearTexto(lib, "primeira", () => 0.5)?.id).toBe("b")
    expect(sortearTexto(lib, "primeira", () => 0.999)?.id).toBe("b")
  })
  it("distribuição parelha com o sorteador real", () => {
    const tres = [t("a", "primeira", "A", true), t("b", "primeira", "B", true), t("c", "primeira", "C", true)]
    const cont: Record<string, number> = { a: 0, b: 0, c: 0 }
    for (let i = 0; i < 3000; i++) cont[sortearTexto(tres, "primeira", () => (i + 0.5) / 3000)!.id]++
    expect(cont).toEqual({ a: 1000, b: 1000, c: 1000 })
  })
  it("uma só ativa: sempre ela", () => {
    expect(sortearTexto(lib, "resposta_sim", () => 0.9)?.id).toBe("s")
  })
  it("mesmo contato mantém a versão que já recebeu", () => {
    expect(escolherTexto(lib, "primeira", () => 0, "b").textoId).toBe("b")
  })
})

describe("fallback: nada mudou quando não há versão ativa", () => {
  it("sem versão ativa na etapa usa o texto do código, sem id", () => {
    expect(escolherTexto([], "primeira")).toEqual({ corpo: TEXTOS_PADRAO.primeira })
    expect(escolherTexto([t("c", "primeira", "C", false)], "primeira")).toEqual({ corpo: TEXTOS_PADRAO.primeira })
    expect(escolherTexto([t("s", "resposta_sim", "A", true)], "primeira")).toEqual({ corpo: TEXTOS_PADRAO.primeira })
  })
  it("os três textos padrão", () => {
    expect(montarTexto(TEXTOS_PADRAO.primeira, { nome: "Ana" })).toBe("Oi, Ana, tudo bem? Aqui é o Felipe, da ENYLA. Vocês pegam serviço terceirizado de outra gráfica?")
    expect(montarTexto(TEXTOS_PADRAO.resposta_sim, {})).toBe("Ótimo! A ENYLA vende impressão pro Brasil todo. Quando entra pedido do que vocês fazem, a gente passa pra uma gráfica parceira. Pra entrar nessa lista, é só se cadastrar aqui: https://app.enyla.com.br/parceiros. Qualquer dúvida, me chama.")
    expect(montarTexto(TEXTOS_PADRAO.resposta_nao, {})).toBe("Sem problema, obrigado pelo retorno! Bom trabalho aí.")
  })
  it("a primeira não leva link e nenhum texto fala de caixinha, papel cartão ou perfumaria", () => {
    expect(TEXTOS_PADRAO.primeira).not.toMatch(/\{link\}|https?:/)
    for (const x of Object.values(TEXTOS_PADRAO)) expect(x).not.toMatch(/caixinha|papel cart|perfumaria/i)
  })
  it("{remetente} vem da config e o padrão é Felipe", () => {
    expect(textoPrimeiroContato("", "Luiz")).toBe("Oi, tudo bem? Aqui é o Luiz, da ENYLA. Vocês pegam serviço terceirizado de outra gráfica?")
    expect(montarTexto("Aqui é o {remetente}", { remetente: "  " })).toBe("Aqui é o Felipe")
  })
})

describe("{nome} só quando é nome de gente", () => {
  it("com nome de pessoa: 'Oi, Ana, tudo bem?'", () => {
    expect(textoPrimeiroContato("Ana")).toMatch(/^Oi, Ana, tudo bem\? Aqui é o Felipe/)
  })
  it("sem nome: tira ', {nome}' e fica 'Oi, tudo bem?', sem vírgula sobrando", () => {
    const x = textoPrimeiroContato("")
    expect(x).toMatch(/^Oi, tudo bem\? Aqui é o Felipe/)
    expect(x).not.toMatch(/\{nome\}|,\s*,|Oi,\s*,|\s,/)
  })
  it("nome no começo da frase também não deixa vírgula", () => {
    expect(montarTexto("{nome}, tudo bem?", {})).toBe("tudo bem?")
    expect(montarTexto("{nome}, tudo bem?", { nome: "Ana" })).toBe("Ana, tudo bem?")
  })
})

describe("nome no envio: nomeDePessoa decide", () => {
  let seq = 0
  const novo = (p: Linha) => {
    seq++
    const l: Linha = { id: seq, cnpj: String(10000000000000 + seq), razao_social: "Gráfica Alfa", nome_fantasia: null, telefone: `1198${String(1000000 + seq).slice(-7)}`, email: null, nota: 50, etapa: "qualificado", opt_out: false, historico_etapas: [], atualizado_em: "2026-11-20T00:00:00.000Z", ...p }
    mundo.prospectos.push(l)
    return l
  }
  const saidas = () => envios.evo.mock.calls.map(c => (JSON.parse((c[1] as { body: string }).body) as { text: string }).text)
  beforeEach(() => { seq = 0; mundo.cfg = { prospector_envio_ativo: true }; mundo.prospectos = []; mundo.textos = []; envios.evo.mockClear(); envios.email.mockClear() })
  const rodar = () => executarEnvio({ agora: () => SEG_10H, primeiroContatoPausado: false, limitePrimeirosPorDia: 0 })

  it("nome de gente entra; nome de empresa sai junto com a vírgula", async () => {
    novo({ nome_fantasia: "Ana Souza" })      // primeiro nome reconhecido
    novo({ nome_fantasia: "Patoxx" })           // não é nome de gente
    await rodar()
    const textos = saidas()
    expect(textos).toContain("Oi, Ana, tudo bem? Aqui é o Felipe, da ENYLA. Vocês pegam serviço terceirizado de outra gráfica?")
    expect(textos).toContain("Oi, tudo bem? Aqui é o Felipe, da ENYLA. Vocês pegam serviço terceirizado de outra gráfica?")
  })
  it("remetente vem de prospector_remetente", async () => {
    mundo.cfg = { prospector_envio_ativo: true, prospector_remetente: "Luiz" }
    novo({})
    await rodar()
    expect(saidas()[0]).toBe("Oi, tudo bem? Aqui é o Luiz, da ENYLA. Vocês pegam serviço terceirizado de outra gráfica?")
  })
  it("sem versão ativa: o envio grava sem textoId; com versão ativa grava o id e usa o corpo dela", async () => {
    const a = novo({})
    await rodar()
    const h0 = (mundo.prospectos.find(x => x.id === a.id)!.historico_etapas as { envio?: { textoId?: string } }[]).filter(x => x.envio)
    expect(h0.length).toBeGreaterThan(0)
    expect(h0.every(x => !("textoId" in (x.envio ?? {})))).toBe(true)

    mundo.prospectos = []; envios.evo.mockClear(); seq = 0
    mundo.textos = [{ colecao: "prospectorTextos", id: "txt_b", v: 1, dados: t("txt_b", "primeira", "B", true, "2026-11-21T10:00:00Z", "Fala, {nome}! {remetente} da ENYLA aqui.") }]
    const b = novo({ nome_fantasia: "Ana Souza" })
    await rodar()
    expect(saidas()).toEqual(["Fala, Ana! Felipe da ENYLA aqui."])
    const h1 = (mundo.prospectos.find(x => x.id === b.id)!.historico_etapas as { envio?: { textoId?: string; texto?: string; status: string } }[]).filter(x => x.envio)
    expect(h1.every(x => x.envio!.textoId === "txt_b")).toBe(true)
    expect(h1.some(x => x.envio!.status === "enviado")).toBe(true)
  })
  it("duas versões ativas: o sorteador decide e cada contato guarda a sua", async () => {
    mundo.textos = [
      { colecao: "prospectorTextos", id: "txt_a", v: 1, dados: t("txt_a", "primeira", "A", true, "2026-11-20T10:00:00Z", "Versão A") },
      { colecao: "prospectorTextos", id: "txt_b", v: 1, dados: t("txt_b", "primeira", "B", true, "2026-11-21T10:00:00Z", "Versão B") },
    ]
    const x = novo({}), y = novo({})
    const seq2 = [0.1, 0.9]
    await executarEnvio({ agora: () => SEG_10H, primeiroContatoPausado: false, limitePrimeirosPorDia: 0, aleatorio: () => seq2.shift() ?? 0 })
    const idDe = (l: Linha) => (mundo.prospectos.find(p => p.id === l.id)!.historico_etapas as { envio?: { textoId?: string } }[]).find(h => h.envio)!.envio!.textoId
    expect([idDe(x), idDe(y)].sort()).toEqual(["txt_a", "txt_b"])
    expect(saidas().sort()).toEqual(["Versão A", "Versão B"])
  })
})

describe("nova versão (editar não sobrescreve)", () => {
  const agora = new Date("2026-11-26T12:00:00Z")
  it("cria versão nova, desligada, com o id recebido", () => {
    const r = novaVersao({ etapa: "primeira", rotulo: " B ", corpo: " Oi {nome} " }, "txt_1", agora)
    expect(r).toEqual({ ok: true, texto: { id: "txt_1", etapa: "primeira", rotulo: "B", corpo: "Oi {nome}", ativo: false, criadoEm: agora.toISOString() } })
  })
  it.each([
    [{ etapa: "outra", rotulo: "A", corpo: "x" }],
    [{ etapa: "primeira", rotulo: "", corpo: "x" }],
    [{ etapa: "primeira", rotulo: "A", corpo: "  " }],
    [{ etapa: "resposta_sim", rotulo: "A", corpo: "x".repeat(1001) }],
  ])("recusa pedido inválido %#", p => { expect(novaVersao(p, "id", agora).ok).toBe(false) })
})

describe("contagem por versão", () => {
  const lib = [t("a", "primeira", "A", true), t("b", "primeira", "B", true), t("z", "primeira", "Z", false)]
  const envio = (textoId: string | undefined, status = "enviado", canal = "whatsapp") => ({ etapa: "abordado", em: "x", envio: { passo: "primeiro_contato", canal, status, ...(textoId ? { textoId } : {}) } })
  const prospectos = [
    { historico_etapas: [envio("a"), { etapa: "respondeu", em: "x", resposta: "sim" }, { etapa: "abordado", em: "x", motivo: "cadastro recebido", cadastroId: "c1" }] },   // A: respondeu sim + cadastro
    { historico_etapas: [envio("a"), { etapa: "respondeu", em: "x", resposta: "outra" }] },                                                                                  // A: respondeu
    { historico_etapas: [envio("a")] },                                                                                                                                      // A: só enviado
    { historico_etapas: [envio("b"), { etapa: "respondeu", em: "x", resposta: "nao" }] },                                                                                    // B: respondeu não
    { historico_etapas: [envio("b", "enviado", "email"), envio("b", "enviado", "whatsapp"), { etapa: "cadastrou", em: "x" }] },                                               // B: dois canais contam 1; cadastrou
    { historico_etapas: [envio("b", "falhou")] },                                                                                                                            // não saiu: não conta
    { historico_etapas: [envio(undefined)] },                                                                                                                                // texto do código: sem versão
    { historico_etapas: [{ etapa: "qualificado", em: "x" }] },
  ]
  it("enviados, responderam, responderam sim e cadastros por versão; versão sem envio aparece com zeros", () => {
    const r = contarPorVersao(lib, prospectos)
    const por = Object.fromEntries(r.map(x => [x.id, [x.enviados, x.responderam, x.responderamSim, x.cadastros]]))
    expect(por).toEqual({ a: [3, 2, 1, 1], b: [2, 1, 0, 1], z: [0, 0, 0, 0] })
  })
  it("não vaza dado de contato", () => {
    expect(JSON.stringify(contarPorVersao(lib, prospectos))).not.toMatch(/telefone|email|cnpj/i)
  })
})

describe("resposta sim ou não", () => {
  it.each([["Sim", "sim"], ["Pegamos sim!", "sim"], ["fazemos", "sim"], ["Não", "nao"], ["não obrigado", "nao"], ["Quanto pagam?", "outra"], ["", "outra"]])("%s → %s", (txt, esperado) => {
    expect(classificarResposta(txt)).toBe(esperado)
  })
})
