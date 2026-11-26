// Eventos da Resend (delivered, bounced, opened, clicked) e link rastreado do Prospector. Supabase simulado: nada é enviado.
import { describe, it, expect, vi, beforeEach } from "vitest"

type Linha = Record<string, any>
const mundo = vi.hoisted(() => ({ prospectos: [] as Linha[] }))

vi.mock("@/app/lib/supabase", () => ({
  supabase: {
    from: () => {
      const filtros: ((r: Linha) => boolean)[] = []
      let patch: Linha | null = null
      const exec = () => {
        const alvo = mundo.prospectos.filter(r => filtros.every(f => f(r)))
        if (patch) alvo.forEach(r => Object.assign(r, patch))
        return alvo
      }
      const q: Record<string, unknown> = {
        select: () => q,
        update: (p: Linha) => { patch = p; return q },
        eq: (c: string, v: unknown) => { filtros.push(r => r[c] === v); return q },
        contains: (_c: string, v: [{ envio: Record<string, string> }]) => {
          const [k, val] = Object.entries(v[0].envio)[0]
          filtros.push(r => (r.historico_etapas as Linha[]).some(h => h.envio?.[k] === val)); return q
        },
        limit: () => q,
        maybeSingle: () => Promise.resolve({ data: exec()[0] ?? null, error: null }),
        then: (ok: (x: unknown) => unknown) => ok({ data: exec().map(r => ({ ...r })), error: null }),
      }
      return q
    },
  },
}))
vi.mock("@/app/lib/configAtomica", () => ({ lerCampos: async () => ({}) }))
vi.mock("@/app/lib/evolution", () => ({ evo: async () => ({ ok: false, status: 500 }) }))

import { processarEventoEmail, registrarCliquePorToken } from "@/app/lib/prospectorEventosServidor"
import { envioDe, htmlDoPrimeiroContato, textoPlanoDoPrimeiroContato, URL_CADASTRO_PARCEIROS } from "@/app/lib/prospectorEnvio"
import { GET } from "@/app/api/prospector/r/[token]/route"

const AGORA = new Date("2026-11-26T14:00:00Z")
const prospecto = (extra: Linha = {}): Linha => ({
  id: 1, cnpj: "1", razao_social: "X", nome_fantasia: null, telefone: null, email: "a@b.com", nota: 5, etapa: "abordado", opt_out: false, atualizado_em: "2026-11-25T10:00:00Z",
  historico_etapas: [{ etapa: "abordado", em: "2026-11-25T10:00:00Z", motivo: "x", envio: { passo: "primeiro_contato", canal: "email", status: "enviado", em: "2026-11-25T10:00:00Z", resendId: "re_1", token: "tokenabc12345" } }],
  ...extra,
})
const envioDo = (l: Linha) => envioDe(l.historico_etapas[0])!

beforeEach(() => { mundo.prospectos = [prospecto()] })

describe("eventos da Resend", () => {
  it("ignora tipo desconhecido e exige email_id", async () => {
    expect((await processarEventoEmail({ type: "email.sent", data: { email_id: "re_1" } })).motivo).toBe("evento ignorado")
    expect((await processarEventoEmail({ type: "email.opened", data: {} })).status).toBe(400)
  })
  it("id sem envio do Prospector: 200 e nada muda", async () => {
    const r = await processarEventoEmail({ type: "email.opened", data: { email_id: "re_outro" } }, AGORA)
    expect(r).toMatchObject({ ok: true, status: 200 })
    expect(mundo.prospectos[0].etapa).toBe("abordado")
  })
  it("delivered e bounced gravam a entrega sem mudar status nem etapa (nunca reenvia)", async () => {
    await processarEventoEmail({ type: "email.delivered", data: { email_id: "re_1" } }, AGORA)
    expect(envioDo(mundo.prospectos[0]).entrega).toBe("entregue")
    await processarEventoEmail({ type: "email.bounced", data: { email_id: "re_1" } }, AGORA)
    const e = envioDo(mundo.prospectos[0])
    expect(e.entrega).toBe("bounce"); expect(e.status).toBe("enviado"); expect(mundo.prospectos[0].etapa).toBe("abordado")
  })
  it("opened leva abordado a abriu, uma vez só (retry não repete)", async () => {
    const r = await processarEventoEmail({ type: "email.opened", data: { email_id: "re_1" } }, AGORA)
    expect(r.atualizado).toBe(true)
    expect(mundo.prospectos[0].etapa).toBe("abriu")
    expect(envioDo(mundo.prospectos[0]).abriuEm).toBe(AGORA.toISOString())
    const n = mundo.prospectos[0].historico_etapas.length
    const r2 = await processarEventoEmail({ type: "email.opened", data: { email_id: "re_1" } }, new Date(AGORA.getTime() + 1000))
    expect(r2.atualizado).toBe(false)
    expect(mundo.prospectos[0].historico_etapas.length).toBe(n)
  })
  it("clicked marca clique e abriu", async () => {
    await processarEventoEmail({ type: "email.clicked", data: { email_id: "re_1" } }, AGORA)
    expect(mundo.prospectos[0].etapa).toBe("abriu")
    expect(envioDo(mundo.prospectos[0])).toMatchObject({ cliqueEm: AGORA.toISOString(), abriuEm: AGORA.toISOString() })
  })
  it("quem já respondeu não volta para abriu", async () => {
    mundo.prospectos = [prospecto({ etapa: "respondeu" })]
    await processarEventoEmail({ type: "email.opened", data: { email_id: "re_1" } }, AGORA)
    expect(mundo.prospectos[0].etapa).toBe("respondeu")
    expect(envioDo(mundo.prospectos[0]).abriuEm).toBeTruthy()
  })
  it("opt-out não é tocado", async () => {
    mundo.prospectos = [prospecto({ etapa: "descartado", opt_out: true })]
    const r = await processarEventoEmail({ type: "email.opened", data: { email_id: "re_1" } }, AGORA)
    expect(r.atualizado).toBe(false)
    expect(mundo.prospectos[0].etapa).toBe("descartado")
  })
})

describe("link rastreado", () => {
  it("o HTML leva o link só com token, e o texto comercial segue igual", () => {
    expect(htmlDoPrimeiroContato("Oi & tudo bem?")).toBe("<p>Oi &amp; tudo bem?</p>")
    const h = htmlDoPrimeiroContato("Oi", "tokenabc12345")
    expect(h).toContain("https://app.enyla.com.br/api/prospector/r/tokenabc12345")
    expect(h).not.toContain("/api/d/")
    expect(h).toContain('Para ser parceira da ENYLA, cadastre a sua gráfica aqui: <a href="https://app.enyla.com.br/api/prospector/r/tokenabc12345">Cadastrar minha gráfica</a>')
  })
  it("o texto do link não mostra endereço nenhum", () => {
    const h = htmlDoPrimeiroContato("Oi", "tokenabc12345")
    const textoDoLink = h.match(/<a [^>]*>([^<]*)<\/a>/)![1]
    expect(textoDoLink).toBe("Cadastrar minha gráfica")
    expect(textoDoLink).not.toMatch(/https?:|www\.|\.com|\.br|\//)
  })
  it("texto puro: `Cadastrar minha gráfica: {link}` só com token", () => {
    expect(textoPlanoDoPrimeiroContato("Oi")).toBe("Oi")
    expect(textoPlanoDoPrimeiroContato("Oi", "tokenabc12345")).toContain("Cadastrar minha gráfica: https://app.enyla.com.br/api/prospector/r/tokenabc12345")
  })
  it("token válido marca clique e redireciona 302 ao formulário", async () => {
    const res = await GET(new Request("https://x") as never, { params: Promise.resolve({ token: "tokenabc12345" }) })
    expect(res.status).toBe(302)
    expect(res.headers.get("location")).toBe(`${URL_CADASTRO_PARCEIROS}?utm_source=email&utm_medium=prospector`)
    expect(mundo.prospectos[0].etapa).toBe("abriu")
    expect(envioDo(mundo.prospectos[0]).cliqueEm).toBeTruthy()
  })
  it("token desconhecido ou malformado redireciona do mesmo jeito e não muda nada", async () => {
    for (const token of ["naoexiste12345", "x", "a/b"]) {
      const res = await GET(new Request("https://x") as never, { params: Promise.resolve({ token }) })
      expect(res.status).toBe(302)
      expect(res.headers.get("location")).toBe(`${URL_CADASTRO_PARCEIROS}?utm_source=email&utm_medium=prospector`)
    }
    expect(mundo.prospectos[0].etapa).toBe("abordado")
    expect(await registrarCliquePorToken("x")).toBe(false)
  })
})
