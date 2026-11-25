// Resposta de e-mail do Prospector: assinatura Svix, casamento do remetente, recusa, etapa, idempotência e reply_to.
// Supabase e Resend são simulados: nada é enviado.
import { describe, it, expect, vi, beforeEach } from "vitest"
import { createHmac } from "node:crypto"

type Linha = Record<string, unknown>
const mundo = vi.hoisted(() => ({ prospectos: [] as Linha[], recebidos: [] as Linha[] }))

vi.mock("@/app/lib/supabase", () => ({
  supabase: {
    from: (tabela: string) => {
      const fonte = tabela === "prospectos_parceiros" ? mundo.prospectos : mundo.recebidos
      const filtros: ((r: Linha) => boolean)[] = []
      let patch: Linha | null = null
      const exec = () => {
        const alvo = fonte.filter(r => filtros.every(f => f(r)))
        if (patch) alvo.forEach(r => Object.assign(r, patch))
        return alvo
      }
      const q: Record<string, unknown> = {
        select: () => q,
        update: (p: Linha) => { patch = p; return q },
        insert: (r: Linha) => {
          if (fonte.some(x => x.email_id === r.email_id)) return Promise.resolve({ error: { code: "23505" } })
          fonte.push({ ...r }); return Promise.resolve({ error: null })
        },
        eq: (c: string, v: unknown) => { filtros.push(r => r[c] === v); return q },
        ilike: (c: string, v: string) => { filtros.push(r => String(r[c] ?? "").toLowerCase() === v.toLowerCase()); return q },
        limit: () => q,
        maybeSingle: () => Promise.resolve({ data: exec()[0] ?? null, error: null }),
        then: (ok: (x: unknown) => unknown) => ok({ data: exec().map(r => ({ ...r })), error: null }),
      }
      return q
    },
  },
}))

import { assinaturaValida, enderecoDoRemetente } from "@/app/lib/prospectorInbound"
import { processarEmailRecebido } from "@/app/lib/prospectorInboundServidor"
import { replyToDoProspector, REMETENTE_REPLY_TO } from "@/app/lib/prospectorEnvio"

const SEGREDO = "whsec_" + Buffer.from("segredo-de-teste").toString("base64")
const agora = new Date("2026-11-25T15:00:00Z")
const assinar = (corpo: string, id = "msg_1", ts = String(Math.floor(agora.getTime() / 1000))) =>
  ({ id, timestamp: ts, assinatura: "v1," + createHmac("sha256", Buffer.from("segredo-de-teste")).update(`${id}.${ts}.${corpo}`).digest("base64") })

describe("assinatura Svix", () => {
  it("aceita a assinatura certa", () => { expect(assinaturaValida("{}", assinar("{}"), SEGREDO, agora)).toBe(true) })
  it("recusa sem segredo, sem cabeçalho, corpo alterado e assinatura errada", () => {
    expect(assinaturaValida("{}", assinar("{}"), undefined, agora)).toBe(false)
    expect(assinaturaValida("{}", { id: null, timestamp: null, assinatura: null }, SEGREDO, agora)).toBe(false)
    expect(assinaturaValida("{x}", assinar("{}"), SEGREDO, agora)).toBe(false)
    expect(assinaturaValida("{}", { ...assinar("{}"), assinatura: "v1,AAAA" }, SEGREDO, agora)).toBe(false)
  })
  it("recusa timestamp velho", () => {
    expect(assinaturaValida("{}", assinar("{}", "m", "1000"), SEGREDO, agora)).toBe(false)
  })
})

describe("remetente", () => {
  it("extrai só o e-mail, em minúsculas", () => {
    expect(enderecoDoRemetente("Fulano <Fulano@Grafica.com.br>")).toBe("fulano@grafica.com.br")
    expect(enderecoDoRemetente("a@b.com")).toBe("a@b.com")
    expect(enderecoDoRemetente("sem email")).toBeNull()
  })
})

describe("reply_to", () => {
  it("vazio ou inválido: Gmail; preenchido: o novo", () => {
    expect(replyToDoProspector("")).toBe(REMETENTE_REPLY_TO)
    expect(replyToDoProspector(undefined)).toBe(REMETENTE_REPLY_TO)
    expect(replyToDoProspector("lixo")).toBe(REMETENTE_REPLY_TO)
    expect(replyToDoProspector("Parceiros@respostas.enyla.com.br")).toBe("parceiros@respostas.enyla.com.br")
  })
})

const conteudo = (text: string, from = "Fulano <Fulano@Grafica.com.br>") => async () => ({ from, to: ["parceiros@respostas.enyla.com.br"], subject: "Re: ENYLA", text, created_at: "2026-11-25T14:59:00Z" })
const evento = (id = "em_1") => ({ type: "email.received", data: { email_id: id } })
const prospecto = (o: Linha = {}): Linha => ({ id: 1, cnpj: "1", email: "fulano@grafica.com.br", etapa: "abordado", opt_out: false, historico_etapas: [], atualizado_em: "t0", ...o })

describe("processarEmailRecebido", () => {
  beforeEach(() => { mundo.prospectos = [prospecto()]; mundo.recebidos = [] })

  it("evento que não é email.received: 200 e nada acontece", async () => {
    const r = await processarEmailRecebido({ type: "email.sent", data: { email_id: "x" } }, agora, conteudo("oi"))
    expect(r.status).toBe(200)
    expect(mundo.recebidos).toHaveLength(0)
    expect(mundo.prospectos[0].etapa).toBe("abordado")
  })
  it("resposta normal: guarda o texto e abordado vira respondeu, com motivo de e-mail", async () => {
    const r = await processarEmailRecebido(evento(), agora, conteudo("Fazemos sim, me liga"))
    expect(r.responderam).toBe(1)
    expect(mundo.prospectos[0].etapa).toBe("respondeu")
    expect((mundo.prospectos[0].historico_etapas as Linha[]).at(-1)?.motivo).toBe("respondeu por e-mail")
    expect(mundo.recebidos[0]).toMatchObject({ email_id: "em_1", prospecto_id: 1, de: "fulano@grafica.com.br", assunto: "Re: ENYLA", corpo: "Fazemos sim, me liga" })
  })
  it("recusa clara: descartado + opt_out + opt_out_em", async () => {
    const r = await processarEmailRecebido(evento(), agora, conteudo("Não quero receber"))
    expect(r.optOuts).toBe(1)
    expect(mundo.prospectos[0]).toMatchObject({ etapa: "descartado", opt_out: true })
    expect(mundo.prospectos[0].opt_out_em).toBeTruthy()
  })
  it("idempotência: o mesmo email_id não grava nem muda etapa duas vezes", async () => {
    await processarEmailRecebido(evento(), agora, conteudo("ok"))
    mundo.prospectos[0].etapa = "abordado"
    const r = await processarEmailRecebido(evento(), agora, conteudo("ok"))
    expect(r.duplicado).toBe(true)
    expect(mundo.recebidos).toHaveLength(1)
    expect(mundo.prospectos[0].etapa).toBe("abordado")
  })
  it("remetente sem prospecto: registra e não cria cadastro", async () => {
    await processarEmailRecebido(evento(), agora, conteudo("oi", "outro@x.com"))
    expect(mundo.prospectos).toHaveLength(1)
    expect(mundo.recebidos[0].prospecto_id).toBeNull()
  })
  it("prospecto com opt-out ou fora de abordado/respondeu não muda", async () => {
    mundo.prospectos = [prospecto({ etapa: "qualificado" })]
    await processarEmailRecebido(evento(), agora, conteudo("oi"))
    expect(mundo.prospectos[0].etapa).toBe("qualificado")
  })
})
