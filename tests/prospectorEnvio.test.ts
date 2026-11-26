// Envio automático do Prospector: chave, horário, cota, cadência, resposta/opt-out e idempotência.
// Supabase, Evolution e Resend são simulados: nenhum teste envia nada de verdade.
import { describe, it, expect, vi, beforeEach } from "vitest"

type Linha = Record<string, unknown>
const mundo = vi.hoisted(() => ({ cfg: {} as Record<string, unknown>, prospectos: [] as Record<string, unknown>[], mensagens: [] as Record<string, unknown>[], consultas: 0 }))
const envios = vi.hoisted(() => ({
  evo: vi.fn(async (..._a: unknown[]) => ({ ok: true, status: 200, corpo: { key: { id: "ABC" } } })),
  email: vi.fn(async (..._a: unknown[]): Promise<{ ok: true; id: string } | { ok: false; erro: string; cota?: true }> => ({ ok: true, id: "e1" })),
}))

vi.mock("@/app/lib/configAtomica", () => ({
  lerCampos: vi.fn(async (campos: string[]) => Object.fromEntries(campos.filter(c => c in mundo.cfg).map(c => [c, mundo.cfg[c]]))),
}))
vi.mock("@/app/lib/evolution", () => ({ evo: envios.evo }))
vi.mock("@/app/lib/email", () => ({ enviarEmail: envios.email }))
vi.mock("@/app/lib/supabase", () => ({
  supabase: {
    from: (tabela: string) => {
      mundo.consultas++
      const fonte = tabela === "prospectos_parceiros" ? mundo.prospectos : mundo.mensagens
      const filtros: ((r: Linha) => boolean)[] = []
      let ordem: { col: string; asc: boolean } | null = null
      let limite = Infinity
      let patch: Linha | null = null
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.update = (p: Linha) => { patch = p; return q }
      q.eq = (c: string, v: unknown) => { filtros.push(r => r[c] === v); return q }
      q.in = (c: string, vs: unknown[]) => { filtros.push(r => vs.includes(r[c])); return q }
      q.gte = (c: string, v: number | string) => { filtros.push(r => r[c] != null && (r[c] as number | string) >= v); return q }
      q.or = () => q
      q.contains = (c: string, v: { envio: { canal: string } }[]) => { filtros.push(r => ((r[c] as { envio?: { canal?: string } }[]) ?? []).some(h => h?.envio?.canal === v[0].envio.canal)); return q }
      q.order = (col: string, o: { ascending?: boolean }) => { ordem = { col, asc: o?.ascending !== false }; return q }
      q.limit = (n: number) => { limite = n; return q }
      let faixa: [number, number] | null = null
      q.range = (de: number, ate: number) => { faixa = [de, ate]; return q }
      const achar = () => {
        let rs = fonte.filter(r => filtros.every(f => f(r)))
        if (ordem) { const { col, asc } = ordem; rs = [...rs].sort((a, b) => ((a[col] as number) - (b[col] as number)) * (asc ? 1 : -1)) }
        // Como o PostgREST: no máximo 1000 linhas por chamada (max-rows), com ou sem range/limit.
        if (faixa) rs = rs.slice(faixa[0], faixa[1] + 1)
        return rs.slice(0, Math.min(limite, 1000))
      }
      const rodar = () => {
        const rs = achar()
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
import { MAX_EMAILS_POR_EXECUCAO, MAX_FALHAS_POR_CANAL, ehErroDeCota, espacoWhatsappMs, ESPACO_WHATSAPP_MIN_MS, ESPACO_WHATSAPP_MAX_MS, celularWhatsapp, dentroDoHorario, ehRecusa, textoPrimeiroContato, TEXTO_LEMBRETE, PRIMEIRO_CONTATO_PAUSADO } from "@/app/lib/prospectorEnvio"

// 2026-11-23 é segunda. São Paulo é UTC-3. Os deslocamentos em dias caem em dia útil (o horário é checado de verdade).
const SEG_10H = new Date("2026-11-23T13:00:00Z")
const SEG_15H = new Date("2026-11-23T18:00:00Z")
const dias = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000)
const esperas: number[] = []
const rodar = (agora: Date) => executarEnvio({ agora: () => agora, primeiroContatoPausado: false, esperar: async ms => { esperas.push(ms) }, sorteio: () => 0.5 })
const rodarReal = (agora: Date) => executarEnvio({ agora: () => agora, esperar: async ms => { esperas.push(ms) } })

let seq = 0
function novo(p: Partial<Linha> = {}): Linha {
  seq++
  const l: Linha = {
    id: seq, cnpj: String(10000000000000 + seq), razao_social: `Gráfica ${seq}`, nome_fantasia: null,
    telefone: `1198${String(1000000 + seq).slice(-7)}`, email: null, nota: 50, etapa: "qualificado", opt_out: false,
    historico_etapas: [], atualizado_em: "2026-11-20T00:00:00.000Z", ...p,
  }
  mundo.prospectos.push(l)
  return l
}
const doBanco = (l: Linha) => mundo.prospectos.find(x => x.id === l.id)!
const hist = (l: Linha) => doBanco(l).historico_etapas as { etapa: string; envio?: { passo: string; canal: string; status: string; texto?: string } }[]
const saidasZap = () => envios.evo.mock.calls.map(c => JSON.parse((c[1] as { body: string }).body) as { number: string; text: string })

beforeEach(() => {
  seq = 0
  mundo.cfg = { prospector_envio_ativo: true }
  mundo.prospectos = []
  mundo.mensagens = []
  mundo.consultas = 0
  envios.evo.mockClear()
  envios.email.mockClear()
  envios.email.mockImplementation(async () => ({ ok: true as const, id: "e1" }))
  vi.unstubAllEnvs()
})

describe("chave liga/desliga", () => {
  it("padrão desligado: não lê o banco nem envia", async () => {
    mundo.cfg = {}
    novo()
    const r = await rodar(SEG_10H)
    expect(r.ativo).toBe(false)
    expect(r.enviado).toBe(false)
    expect(mundo.consultas).toBe(0)
    expect(envios.evo).not.toHaveBeenCalled()
    expect(envios.email).not.toHaveBeenCalled()
  })
  it("só o valor true liga (texto 'true' não liga)", async () => {
    mundo.cfg = { prospector_envio_ativo: "true" }
    novo()
    expect((await rodar(SEG_10H)).ativo).toBe(false)
    expect(envios.evo).not.toHaveBeenCalled()
  })
})

describe("horário e dia útil", () => {
  it.each([
    ["sábado 10h", "2026-11-28T13:00:00Z"],
    ["domingo 10h", "2026-11-29T13:00:00Z"],
    ["quarta 7h59", "2026-11-25T10:59:00Z"],
    ["quarta 20h", "2026-11-25T23:00:00Z"],
    ["quarta 22h", "2026-11-26T01:00:00Z"],
    ["quarta 20h30", "2026-11-25T23:30:00Z"],
  ])("recusa %s", async (_n, iso) => {
    novo()
    const r = await rodar(new Date(iso))
    expect(r.enviado).toBe(false)
    expect(r.motivo).toMatch(/fora do horário/)
    expect(envios.evo).not.toHaveBeenCalled()
    expect(doBanco(mundo.prospectos[0]).etapa).toBe("qualificado")
  })
  it("aceita 8h00 e 19h59 de segunda a sexta", () => {
    expect(dentroDoHorario(new Date("2026-11-23T11:00:00Z"))).toBe(true)
    expect(dentroDoHorario(new Date("2026-11-27T22:59:00Z"))).toBe(true)
  })
})

describe("primeiro contato", () => {
  it("texto exato, bom dia/boa tarde, sem link nem opt-out, e a etapa vai para abordado", async () => {
    const a = novo()
    await rodar(SEG_10H)
    expect(saidasZap()[0]).toEqual({ number: `55${a.telefone}`, text: "Bom dia, tudo bem? Aqui é da ENYLA, somos uma gráfica de Barueri que faz qualquer material gráfico. Vocês fazem serviços de terceirização para outras gráficas?" })
    expect(doBanco(a).etapa).toBe("abordado")
    expect(hist(a).some(h => h.envio?.status === "enviado" && h.envio.canal === "whatsapp" && h.envio.passo === "primeiro_contato" && h.envio.texto)).toBe(true)
    expect(textoPrimeiroContato(SEG_15H)).toBe("Boa tarde, tudo bem? Aqui é da ENYLA, somos uma gráfica de Barueri que faz qualquer material gráfico. Vocês fazem serviços de terceirização para outras gráficas?")
    expect(textoPrimeiroContato(SEG_10H)).not.toMatch(/https?:|www\.|\.com/)
  })
  it("usa os dois canais no mesmo dia, e-mail com assunto discreto, remetente e Reply-To do Prospector", async () => {
    novo({ email: "contato@grafica.com.br" })
    await rodar(SEG_15H)
    expect(envios.evo).toHaveBeenCalledTimes(1)
    expect(envios.email).toHaveBeenCalledTimes(1)
    const [para, msg, anexos, opcoes] = envios.email.mock.calls[0] as [string, { assunto: string; texto: string }, unknown[], { de: string; responderPara: string }]
    expect(para).toBe("contato@grafica.com.br")
    expect(msg.assunto).toBe("ENYLA, gráfica de Barueri que faz qualquer material gráfico")
    expect(msg.texto.startsWith("Boa tarde, tudo bem?")).toBe(true)
    expect(anexos).toEqual([])
    expect(opcoes).toEqual({ de: "ENYLA Embalagens <parceiros@enyla.com.br>", responderPara: "felipeonobrega2@gmail.com" })
  })
  it("WhatsApp só para celular brasileiro com 9 dígitos depois do DDD", async () => {
    expect(celularWhatsapp("11987654321")).toBe("5511987654321")
    expect(celularWhatsapp("5511987654321")).toBe("5511987654321")
    expect(celularWhatsapp("1134567890")).toBeNull()
    expect(celularWhatsapp("1187654321")).toBeNull()
    novo({ telefone: "1134567890" })   // fixo, sem e-mail: nem qualifica
    const r = await rodar(SEG_10H)
    expect(r.qualificados).toBe(0)
    expect(envios.evo).not.toHaveBeenCalled()
  })
  it("fixo com e-mail: sai só por e-mail", async () => {
    novo({ telefone: "1134567890", email: "x@y.com.br" })
    await rodar(SEG_10H)
    expect(envios.evo).not.toHaveBeenCalled()
    expect(envios.email).toHaveBeenCalledTimes(1)
  })
  it("ordem de nota decrescente", async () => {
    novo({ nota: 20 }); novo({ nota: 90 }); novo({ nota: 55 })
    await rodar(SEG_10H)
    const notas = saidasZap().map(s => mundo.prospectos.find(p => `55${p.telefone}` === s.number)!.nota)
    expect(notas).toEqual([90, 55, 20])
  })
})

describe("qualificação", () => {
  it("encontrado com nota >= mínimo e contato vira qualificado e é abordado; abaixo do mínimo ou sem contato, não", async () => {
    mundo.cfg = { prospector_envio_ativo: true, prospector_nota_minima: 40 }
    const ok = novo({ etapa: "encontrado", nota: 40 })
    const baixa = novo({ etapa: "encontrado", nota: 39 })
    const semContato = novo({ etapa: "encontrado", nota: 80, telefone: null, email: null })
    const r = await rodar(SEG_10H)
    expect(r.qualificados).toBe(1)
    expect(hist(ok).map(h => h.etapa)).toContain("qualificado")
    expect(doBanco(ok).etapa).toBe("abordado")
    expect(doBanco(baixa).etapa).toBe("encontrado")
    expect(doBanco(semContato).etapa).toBe("encontrado")
  })
  it("filtro de público: nome fora do ramo, só encadernação e CNAE só secundário não são abordados e ficam na base", async () => {
    mundo.cfg = { prospector_envio_ativo: true }
    const nome = novo({ etapa: "encontrado", nota: 90, razao_social: "Mundo dos Infláveis", cnae_principal: "1813001", cnaes_secundarios: [] })
    const encad = novo({ etapa: "encontrado", nota: 90, cnae_principal: "1822901", cnaes_secundarios: [] })
    const secBaixa = novo({ etapa: "encontrado", nota: 1, cnae_principal: "4711301", cnaes_secundarios: ["1813001"] })
    const secOk = novo({ etapa: "encontrado", nota: 2, cnae_principal: "4711301", cnaes_secundarios: ["1813001"] })
    const princ = novo({ etapa: "encontrado", nota: 1, cnae_principal: "1821100", cnaes_secundarios: [] })
    await rodar(SEG_10H)
    for (const l of [nome, encad, secBaixa]) expect(doBanco(l).etapa).toBe("encontrado")
    expect(doBanco(secOk).etapa).toBe("abordado")
    expect(doBanco(princ).etapa).toBe("abordado")
    expect(mundo.prospectos).toHaveLength(5)
  })
  it("padrão do mínimo é 1 e não reabre descartado nem opt-out", async () => {
    const zero = novo({ etapa: "encontrado", nota: 0 })
    const um = novo({ etapa: "encontrado", nota: 1 })
    const desc = novo({ etapa: "descartado", opt_out: true, opt_out_em: "2026-11-01T00:00:00Z" })
    await rodar(SEG_10H)
    expect(doBanco(zero).etapa).toBe("encontrado")
    expect(doBanco(um).etapa).toBe("abordado")
    expect(doBanco(desc).etapa).toBe("descartado")
    expect(envios.evo).toHaveBeenCalledTimes(1)
  })
})

describe("sem teto diário (decisão do Felipe, 26/11/2026)", () => {
  it("WhatsApp: 25 primeiros contatos saem no mesmo dia, espaçados de 20 a 60 s", async () => {
    esperas.length = 0
    for (let i = 0; i < 25; i++) novo({ nota: 100 - i })
    expect((await rodar(SEG_10H)).primeiros).toBe(25)
    expect(envios.evo).toHaveBeenCalledTimes(25)
    expect(esperas).toHaveLength(24)   // entre um e outro, nunca antes do primeiro
    expect(esperas.every(ms => ms >= 20_000 && ms <= 60_000)).toBe(true)
  })
  it("espaçamento: sorteio de 20 a 60 s", () => {
    expect(ESPACO_WHATSAPP_MIN_MS).toBe(20_000)
    expect(ESPACO_WHATSAPP_MAX_MS).toBe(60_000)
    expect(espacoWhatsappMs(0)).toBe(20_000)
    expect(espacoWhatsappMs(1)).toBe(60_000)
    expect(espacoWhatsappMs(0.5)).toBe(40_000)
    for (let i = 0; i < 200; i++) { const ms = espacoWhatsappMs(); expect(ms).toBeGreaterThanOrEqual(20_000); expect(ms).toBeLessThanOrEqual(60_000) }
  })
  it("espera que não cabe no tempo da execução: o resto fica para o próximo cron", async () => {
    esperas.length = 0
    for (let i = 0; i < 5; i++) novo({ nota: 100 - i })
    vi.useFakeTimers({ toFake: ["Date"] })   // a espera "gasta" tempo de verdade no relógio
    const r = await executarEnvio({ agora: () => SEG_10H, primeiroContatoPausado: false, esperar: async ms => { vi.setSystemTime(Date.now() + ms) }, sorteio: () => 1 }).finally(() => vi.useRealTimers())
    expect(r.primeiros).toBe(2)   // 60 s de espera cabe; a segunda (120 s) passa dos 90 s da execução
    expect(r.motivoParada).toBe("limite_execucao")
    expect(doBanco(mundo.prospectos[2]).etapa).toBe("qualificado")
  })
  it("e-mail não tem teto diário nem espera: 15 só com e-mail saem no mesmo dia", async () => {
    esperas.length = 0
    for (let i = 0; i < 15; i++) novo({ nota: 100 - i, telefone: null, email: `a${i}@gr.com.br` })
    expect((await rodar(SEG_10H)).primeiros).toBe(15)
    expect(envios.email).toHaveBeenCalledTimes(15)
    expect(envios.evo).not.toHaveBeenCalled()
    expect(esperas).toHaveLength(0)
  })
  it("sem teto, a janela das 8h às 20h continua valendo: 20h30 e domingo não enviam", async () => {
    for (let i = 0; i < 12; i++) novo({ nota: 100 - i })
    expect((await rodar(new Date("2026-11-25T23:30:00Z"))).enviado).toBe(false)
    expect((await rodar(new Date("2026-11-22T15:00:00Z"))).enviado).toBe(false)
    expect(envios.evo).not.toHaveBeenCalled()
  })
  it("sem teto, a lista de exclusão continua bloqueando (telefone e e-mail de quem pediu para sair)", async () => {
    novo({ telefone: "11988887777", email: "sai@gr.com.br", etapa: "descartado", opt_out: true, opt_out_em: "2026-11-01T00:00:00Z" })
    const mesmoTel = novo({ telefone: "11988887777", email: null })
    const mesmoEmail = novo({ telefone: null, email: "sai@gr.com.br" })
    const livre = novo({ telefone: "11977776666", email: null })
    await rodar(SEG_10H)
    expect(doBanco(mesmoTel).etapa).toBe("qualificado")
    expect(doBanco(mesmoEmail).etapa).toBe("qualificado")
    expect(doBanco(livre).etapa).toBe("abordado")
    expect(envios.evo).toHaveBeenCalledTimes(1)
    expect(envios.email).not.toHaveBeenCalled()
  })
  it("limite técnico por execução: o que passa de MAX_EMAILS_POR_EXECUCAO fica para o próximo cron", async () => {
    for (let i = 0; i < MAX_EMAILS_POR_EXECUCAO + 5; i++) novo({ nota: 200 - i, telefone: null, email: `c${i}@gr.com.br` })
    expect((await rodar(SEG_10H)).primeiros).toBe(MAX_EMAILS_POR_EXECUCAO)
    expect((await rodar(SEG_10H)).primeiros).toBe(5)
    expect(envios.email).toHaveBeenCalledTimes(MAX_EMAILS_POR_EXECUCAO + 5)
  })
  it("lembretes continuam saindo junto dos primeiros contatos", async () => {
    for (let i = 0; i < 10; i++) novo({ nota: 90 - i })
    await rodar(SEG_10H)
    for (let i = 0; i < 10; i++) novo({ nota: 40 - i })
    const r = await rodar(dias(SEG_10H, 3))
    expect(r.lembretes).toBe(10)
    expect(r.primeiros).toBe(10)
  })
})

describe("cadência do lembrete", () => {
  it("lembrete 3 dias depois, um só, e depois encerra sem mandar mais nada", async () => {
    const a = novo()
    await rodar(SEG_10H)
    expect((await rodar(dias(SEG_10H, 2))).lembretes).toBe(0)
    const r = await rodar(dias(SEG_10H, 3))
    expect(r.lembretes).toBe(1)
    expect(saidasZap()[1].text).toBe(TEXTO_LEMBRETE)
    expect(TEXTO_LEMBRETE).not.toMatch(/https?:|www\./)
    expect((await rodar(dias(SEG_10H, 4))).lembretes).toBe(0)
    expect(doBanco(a).etapa).toBe("abordado")
    const fim = await rodar(dias(SEG_10H, 7))
    expect(fim.encerrados).toBe(1)
    expect(doBanco(a).etapa).toBe("encerrado_sem_resposta")
    await rodar(dias(SEG_10H, 21)); await rodar(dias(SEG_10H, 42))
    expect(envios.evo).toHaveBeenCalledTimes(2)   // primeiro contato + lembrete, nunca terceira
  })
  it("primeiro contato por e-mail: sem lembrete em nenhum canal e sem encerramento (resposta por e-mail não é detectada)", async () => {
    const a = novo({ email: "a@grafica.com.br" })
    await rodar(SEG_10H)
    expect(envios.email).toHaveBeenCalledTimes(1)
    expect(envios.evo).toHaveBeenCalledTimes(1)
    expect((await rodar(dias(SEG_10H, 3))).lembretes).toBe(0)
    const fim = await rodar(dias(SEG_10H, 7))
    expect(fim.lembretes).toBe(0); expect(fim.encerrados).toBe(0)
    await rodar(dias(SEG_10H, 42))
    expect(doBanco(a).etapa).toBe("abordado")
    expect(envios.email).toHaveBeenCalledTimes(1)
    expect(envios.evo).toHaveBeenCalledTimes(1)
  })
  it("encerrado não volta a ser qualificado nem recebe nada", async () => {
    const a = novo({ etapa: "encerrado_sem_resposta" })
    await rodar(SEG_10H)
    expect(doBanco(a).etapa).toBe("encerrado_sem_resposta")
    expect(envios.evo).not.toHaveBeenCalled()
  })
})

describe("resposta e opt-out", () => {
  const abordar = async () => {
    const a = novo()
    await rodar(SEG_10H)
    return a
  }
  it("quem responde vira respondeu e não recebe lembrete", async () => {
    const a = await abordar()
    mundo.mensagens.push({ id: "m1", jid: `55${a.telefone}@s.whatsapp.net`, from_me: false, corpo: "Fazemos sim, como funciona?", ts: dias(SEG_10H, 1).toISOString() })
    const r = await rodar(dias(SEG_10H, 3))
    expect(r.responderam).toBe(1)
    expect(doBanco(a).etapa).toBe("respondeu")
    expect(envios.evo).toHaveBeenCalledTimes(1)   // nenhuma resposta automática, nenhum lembrete
    await rodar(dias(SEG_10H, 10))
    expect(envios.evo).toHaveBeenCalledTimes(1)
  })
  it("recusa marca opt-out (descartado + opt_out_em) e nunca mais envia", async () => {
    const a = await abordar()
    mundo.mensagens.push({ id: "m1", jid: `55${a.telefone}@s.whatsapp.net`, from_me: false, corpo: "Não quero receber, obrigado", ts: dias(SEG_10H, 1).toISOString() })
    const r = await rodar(dias(SEG_10H, 3))
    expect(r.optOuts).toBe(1)
    expect(doBanco(a)).toMatchObject({ etapa: "descartado", opt_out: true })
    expect(typeof doBanco(a).opt_out_em).toBe("string")
    await rodar(dias(SEG_10H, 10))
    expect(envios.evo).toHaveBeenCalledTimes(1)
  })
  it("recusa no mesmo dia em que o lembrete ficaria devido não dispara o lembrete", async () => {
    const a = await abordar()
    mundo.mensagens.push({ id: "m1", jid: `55${a.telefone}@s.whatsapp.net`, from_me: false, corpo: "Não quero receber", ts: dias(SEG_10H, 2).toISOString() })
    const r = await rodar(dias(SEG_10H, 3))   // 3 dias: lembrete devido neste mesmo ciclo
    expect(r.optOuts).toBe(1)
    expect(r.lembretes).toBe(0)
    expect(envios.evo).toHaveBeenCalledTimes(1)
    expect(doBanco(a)).toMatchObject({ etapa: "descartado", opt_out: true })
  })
  it("resposta casa o telefone mesmo com o número sem o 9 antigo; mensagem nossa ou de outro número não conta", async () => {
    const a = await abordar()
    mundo.mensagens.push({ id: "m0", jid: `55${a.telefone}@s.whatsapp.net`, from_me: true, corpo: "x", ts: dias(SEG_10H, 1).toISOString() })
    mundo.mensagens.push({ id: "m1", jid: "5511900000000@s.whatsapp.net", from_me: false, corpo: "oi", ts: dias(SEG_10H, 1).toISOString() })
    await rodar(dias(SEG_10H, 3))
    expect(doBanco(a).etapa).toBe("abordado")
    const t = String(a.telefone)
    mundo.mensagens.push({ id: "m2", jid: `55${t.slice(0, 2)}${t.slice(3)}@s.whatsapp.net`, from_me: false, corpo: "oi", ts: dias(SEG_10H, 3).toISOString() })
    await rodar(dias(SEG_10H, 3))
    expect(doBanco(a).etapa).toBe("respondeu")
  })
  it("mesmo telefone de quem pediu para sair não recebe por outro CNPJ", async () => {
    novo({ telefone: "11988887777", etapa: "descartado", opt_out: true, opt_out_em: "2026-11-01T00:00:00Z" })
    novo({ telefone: "11988887777" })
    await rodar(SEG_10H)
    expect(envios.evo).not.toHaveBeenCalled()
  })
  it.each([
    ["Não quero receber", true], ["nao quero mais receber mensagens", true], ["Pare de enviar", true], ["não", true], ["Sem interesse", true],
    ["Fazemos sim", false], ["Não sei, quem fala?", false], ["Sim, pode mandar", false],
  ])("ehRecusa(%s) = %s", (t, esperado) => { expect(ehRecusa(t)).toBe(esperado) })
})

describe("idempotência", () => {
  it("por CNPJ: duas execuções (retry do cron) mandam uma vez só", async () => {
    novo({ email: "a@b.com.br" })
    await rodar(SEG_10H)
    await rodar(SEG_10H)
    await rodar(SEG_15H)
    expect(envios.evo).toHaveBeenCalledTimes(1)
    expect(envios.email).toHaveBeenCalledTimes(1)
  })
  it("por CNPJ: dois disparos ao mesmo tempo não duplicam (a reserva no histórico vence)", async () => {
    novo()
    await Promise.all([rodar(SEG_10H), rodar(SEG_10H)])
    expect(envios.evo).toHaveBeenCalledTimes(1)
  })
  it("por telefone: dois CNPJs com o mesmo celular recebem uma mensagem só", async () => {
    novo({ telefone: "11977776666", nota: 80 }); novo({ telefone: "(11) 97777-6666", nota: 60 })
    await rodar(SEG_10H)
    await rodar(SEG_10H)
    expect(envios.evo).toHaveBeenCalledTimes(1)
  })
  it("por telefone no lembrete: um lembrete só para o número compartilhado", async () => {
    novo({ telefone: "11977776666", nota: 80 })
    await rodar(SEG_10H)
    novo({ telefone: "11977776666", nota: 60, etapa: "abordado", historico_etapas: [{ etapa: "abordado", em: SEG_10H.toISOString(), envio: { passo: "primeiro_contato", canal: "whatsapp", status: "enviado", em: SEG_10H.toISOString() } }] })
    await rodar(dias(SEG_10H, 3))
    expect(envios.evo).toHaveBeenCalledTimes(2)   // 1º contato + 1 lembrete
  })
  it("reserva sem desfecho (processo morreu) conta como enviada: não reenvia", async () => {
    novo({ historico_etapas: [{ etapa: "qualificado", em: SEG_10H.toISOString(), envio: { passo: "primeiro_contato", canal: "whatsapp", status: "reservado", em: SEG_10H.toISOString() } }] })
    await rodar(SEG_15H)
    expect(envios.evo).not.toHaveBeenCalled()
  })
  it("canal que falhou: tenta só ele na próxima execução, como o mesmo passo, sem reenviar o que saiu", async () => {
    const a = novo({ email: "a@b.com.br" })
    envios.email.mockResolvedValueOnce({ ok: false, erro: "Resend 500" } as never)
    const r = await rodar(SEG_10H)
    expect(r.falhas).toBe(1)
    expect(doBanco(a).etapa).toBe("abordado")
    expect(hist(a).some(h => h.envio?.canal === "email" && h.envio.status === "falhou")).toBe(true)
    await rodar(dias(SEG_10H, 1))
    expect(envios.evo).toHaveBeenCalledTimes(1)
    expect(envios.email).toHaveBeenCalledTimes(2)
    expect(hist(a).filter(h => h.envio?.status === "enviado").map(h => `${h.envio!.passo}/${h.envio!.canal}`).sort()).toEqual(["primeiro_contato/email", "primeiro_contato/whatsapp"])
    await rodar(dias(SEG_10H, 1))
    expect(envios.email).toHaveBeenCalledTimes(2)
  })
  it("falha total: continua qualificado, não consome a cota além do prospecto e para depois de 3 falhas", async () => {
    const a = novo()
    envios.evo.mockResolvedValue({ ok: false, status: 500, corpo: null } as never)
    for (let i = 0; i < 6; i++) await rodar(dias(SEG_10H, i))
    envios.evo.mockResolvedValue({ ok: true, status: 200, corpo: { key: { id: "ABC" } } })
    expect(doBanco(a).etapa).toBe("qualificado")
    expect(envios.evo).toHaveBeenCalledTimes(3)
  })
})

describe("rota /api/prospector/enviar", () => {
  it("recusa sem a senha do cron e, com ela e a chave desligada, só diz que está desligado", async () => {
    const { GET } = await import("@/app/api/prospector/enviar/route")
    const { NextRequest } = await import("next/server")
    vi.stubEnv("CRON_SECRET", "segredo-de-teste")
    expect((await GET(new NextRequest("http://x.test/api/prospector/enviar"))).status).toBe(401)
    mundo.cfg = {}
    const ok = await GET(new NextRequest("http://x.test/api/prospector/enviar", { headers: { authorization: "Bearer segredo-de-teste" } }))
    expect(ok.status).toBe(200)
    expect(await ok.json()).toMatchObject({ ok: true, ativo: false, enviado: false })
    expect(envios.evo).not.toHaveBeenCalled()
    vi.unstubAllEnvs()
  })
})

const COTA = "You have reached your daily email sending quota."
const comEmail = (p: Partial<Linha> = {}) => novo({ telefone: null, email: `g${seq + 1}@gr.com.br`, ...p })
const enviadoHoje = (em: string, status = "enviado") => ({ etapa: "abordado", em, motivo: "x", envio: { passo: "primeiro_contato", canal: "email", status, em } })

describe("cota da Resend", () => {
  it("cota da Resend esgotada: para o e-mail da execução e não penaliza o lead", async () => {
    envios.email.mockImplementation(async () => ({ ok: false as const, erro: COTA, cota: true as const }))
    const ls = [comEmail(), comEmail(), comEmail()]
    const r = await rodar(SEG_10H)
    expect(envios.email).toHaveBeenCalledTimes(1)
    expect(r.motivoParada).toBe("cota_resend")
    expect(hist(ls[0]).some(h => h.envio?.status === "falhou")).toBe(true)   // histórico preservado, nada marcado "enviado"
    expect(hist(ls.find(l => hist(l).length === 0)!)).toHaveLength(0)
  })
  it("falhas de cota já gravadas não contam para MAX_FALHAS_POR_CANAL", async () => {
    const falha = (erro: string, i: number) => ({ etapa: "qualificado", em: `2026-11-2${i}T12:00:00.000Z`, motivo: "x", envio: { passo: "primeiro_contato", canal: "email", status: "falhou", em: `2026-11-2${i}T12:00:00.000Z`, erro } })
    const l = comEmail({ historico_etapas: Array.from({ length: MAX_FALHAS_POR_CANAL + 2 }, (_, i) => falha(COTA, i)) })
    const m = comEmail({ historico_etapas: Array.from({ length: MAX_FALHAS_POR_CANAL }, (_, i) => falha("Invalid `to`", i)) })
    await rodar(SEG_10H)
    expect(envios.email).toHaveBeenCalledTimes(1)
    expect(hist(l).some(h => h.envio?.status === "enviado")).toBe(true)
    expect(hist(m).some(h => h.envio?.status === "enviado")).toBe(false)   // falha comum continua descartando
    expect(ehErroDeCota(COTA)).toBe(true)
    expect(ehErroDeCota("Invalid `to`")).toBe(false)
  })
})

describe("pausa do primeiro contato", () => {
  it("padrão de produção: não está pausado, sem limite diário, e o e-mail leva o link de cadastro", async () => {
    expect(PRIMEIRO_CONTATO_PAUSADO).toBe(false)
    for (let i = 0; i < 15; i++) novo({ nota: 100 - i, telefone: null, email: `p${i}@gr.com.br` })
    const r = await rodarReal(SEG_10H)
    expect(r.ok).toBe(true)
    expect(r.primeiros).toBe(15)
    expect(envios.email).toHaveBeenCalledTimes(15)
    const msg = envios.email.mock.calls[0][1] as { html: string; texto: string }
    expect(msg.html).toContain("Para ser parceira da ENYLA, cadastre a sua gráfica aqui: <a href=")
    expect(msg.texto).toContain("Cadastrar minha gráfica: https://app.enyla.com.br/api/prospector/r/")
    expect(msg.texto).toContain("gráfica de Barueri que faz qualquer material gráfico")
    expect(msg.texto).toContain("serviços de terceirização para outras gráficas")
  })
  it("pausa ligada por parâmetro: nada sai, segue qualificado, sem erro", async () => {
    const a = novo({ email: "p@gr.com.br" })
    const r = await executarEnvio({ agora: () => SEG_10H, primeiroContatoPausado: true })
    expect(r.primeiros).toBe(0)
    expect(r.falhas).toBe(0)
    expect(envios.email).not.toHaveBeenCalled()
    expect(doBanco(a).etapa).toBe("qualificado")
  })
})
