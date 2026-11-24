// Envio automático do Prospector: chave, horário, cota, cadência, resposta/opt-out e idempotência.
// Supabase, Evolution e Resend são simulados: nenhum teste envia nada de verdade.
import { describe, it, expect, vi, beforeEach } from "vitest"

type Linha = Record<string, unknown>
const mundo = vi.hoisted(() => ({ cfg: {} as Record<string, unknown>, prospectos: [] as Record<string, unknown>[], mensagens: [] as Record<string, unknown>[], consultas: 0 }))
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
      q.order = (col: string, o: { ascending?: boolean }) => { ordem = { col, asc: o?.ascending !== false }; return q }
      q.limit = (n: number) => { limite = n; return q }
      const achar = () => {
        let rs = fonte.filter(r => filtros.every(f => f(r)))
        if (ordem) { const { col, asc } = ordem; rs = [...rs].sort((a, b) => ((a[col] as number) - (b[col] as number)) * (asc ? 1 : -1)) }
        return rs.slice(0, limite)
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
import { celularWhatsapp, dentroDoHorario, ehRecusa, textoPrimeiroContato, TEXTO_LEMBRETE } from "@/app/lib/prospectorEnvio"

// 2026-11-23 é segunda. São Paulo é UTC-3. Os deslocamentos em dias caem em dia útil (o horário é checado de verdade).
const SEG_10H = new Date("2026-11-23T13:00:00Z")
const SEG_15H = new Date("2026-11-23T18:00:00Z")
const dias = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000)
const rodar = (agora: Date) => executarEnvio({ agora: () => agora })

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
    ["quarta 8h59", "2026-11-25T11:59:00Z"],
    ["quarta 17h", "2026-11-25T20:00:00Z"],
    ["quarta 22h", "2026-11-26T01:00:00Z"],
  ])("recusa %s", async (_n, iso) => {
    novo()
    const r = await rodar(new Date(iso))
    expect(r.enviado).toBe(false)
    expect(r.motivo).toMatch(/fora do horário/)
    expect(envios.evo).not.toHaveBeenCalled()
    expect(doBanco(mundo.prospectos[0]).etapa).toBe("qualificado")
  })
  it("aceita 9h00 e 16h59 de segunda a sexta", () => {
    expect(dentroDoHorario(new Date("2026-11-23T12:00:00Z"))).toBe(true)
    expect(dentroDoHorario(new Date("2026-11-27T19:59:00Z"))).toBe(true)
  })
})

describe("primeiro contato", () => {
  it("texto exato, bom dia/boa tarde, sem link nem opt-out, e a etapa vai para abordado", async () => {
    const a = novo()
    await rodar(SEG_10H)
    expect(saidasZap()[0]).toEqual({ number: `55${a.telefone}`, text: "Bom dia, tudo bem? Aqui é da ENYLA, somos uma gráfica de embalagens em Barueri. Vocês fazem serviços de terceirização para outras gráficas?" })
    expect(doBanco(a).etapa).toBe("abordado")
    expect(hist(a).some(h => h.envio?.status === "enviado" && h.envio.canal === "whatsapp" && h.envio.passo === "primeiro_contato" && h.envio.texto)).toBe(true)
    expect(textoPrimeiroContato(SEG_15H)).toBe("Boa tarde, tudo bem? Aqui é da ENYLA, somos uma gráfica de embalagens em Barueri. Vocês fazem serviços de terceirização para outras gráficas?")
    expect(textoPrimeiroContato(SEG_10H)).not.toMatch(/https?:|www\.|\.com/)
  })
  it("usa os dois canais no mesmo dia, e-mail com assunto discreto, remetente e Reply-To do Prospector", async () => {
    novo({ email: "contato@grafica.com.br" })
    await rodar(SEG_15H)
    expect(envios.evo).toHaveBeenCalledTimes(1)
    expect(envios.email).toHaveBeenCalledTimes(1)
    const [para, msg, anexos, opcoes] = envios.email.mock.calls[0] as [string, { assunto: string; texto: string }, unknown[], { de: string; responderPara: string }]
    expect(para).toBe("contato@grafica.com.br")
    expect(msg.assunto).toBe("ENYLA, gráfica de embalagens em Barueri")
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

describe("limite de 10 primeiros contatos por dia", () => {
  it("manda 10 e para; nova execução no mesmo dia não manda mais; no dia seguinte manda os próximos", async () => {
    for (let i = 0; i < 13; i++) novo({ nota: 100 - i })
    expect((await rodar(SEG_10H)).primeiros).toBe(10)
    expect((await rodar(dias(SEG_10H, 0))).primeiros).toBe(0)
    expect(envios.evo).toHaveBeenCalledTimes(10)
    const dia2 = await rodar(dias(SEG_10H, 1))
    expect(dia2.primeiros).toBe(3)
    expect(envios.evo).toHaveBeenCalledTimes(13)
  })
  it("lembretes não entram na cota", async () => {
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
