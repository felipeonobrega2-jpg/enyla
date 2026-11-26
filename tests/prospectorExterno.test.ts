// Porta externa: ações do Prospector para CCO e CMO. Supabase, Evolution, Resend e AppConfig são simulados: nada é enviado.
import { describe, it, expect, vi, beforeEach } from "vitest"

type Linha = Record<string, unknown>
const mundo = vi.hoisted(() => ({
  prospectos: [] as Linha[], recebidos: [] as Linha[], mensagens: [] as Linha[],
  cfg: {} as Record<string, unknown>, evo: [] as { caminho: string; corpo: unknown }[], evoResp: { ok: true, status: 200, corpo: null as unknown },
  emails: [] as { para: string; assunto: string }[], emailOk: true, status: [] as unknown[][],
}))

vi.mock("@/app/lib/supabase", () => ({
  supabase: {
    from: (tabela: string) => {
      const fonte = tabela === "prospectos_parceiros" ? mundo.prospectos : tabela === "prospectos_emails_recebidos" ? mundo.recebidos : mundo.mensagens
      const filtros: ((r: Linha) => boolean)[] = []
      let patch: Linha | null = null
      const exec = () => { const alvo = fonte.filter(r => filtros.every(f => f(r))); if (patch) alvo.forEach(r => Object.assign(r, patch)); return alvo }
      const q: Record<string, unknown> = {
        select: () => q,
        update: (p: Linha) => { patch = p; return q },
        insert: (r: Linha) => {
          if (tabela === "prospectos_parceiros" && fonte.some(x => x.cnpj === r.cnpj)) return Promise.resolve({ error: { code: "23505" }, data: null })
          const nova = { id: fonte.length + 100, opt_out: false, whatsapp_verificado: false, atualizado_em: "2026-11-25T00:00:00Z", ...r }
          fonte.push(nova)
          return { select: () => ({ maybeSingle: () => Promise.resolve({ data: { id: nova.id }, error: null }) }) }
        },
        eq: (c: string, v: unknown) => { filtros.push(r => r[c] === v); return q },
        in: (c: string, v: unknown[]) => { filtros.push(r => v.includes(r[c])); return q },
        or: (expr: string) => { filtros.push(r => expr.split(",").some(p => { const [c, , v] = p.split("."); return String(r[c]) === v })); return q },
        order: () => q, limit: () => q,
        maybeSingle: () => Promise.resolve({ data: exec()[0] ?? null, error: null }),
        then: (ok: (x: unknown) => unknown) => ok({ data: exec().map(r => ({ ...r })), error: null }),
      }
      return q
    },
  },
}))
vi.mock("@/app/lib/evolution", () => ({ evo: vi.fn(async (caminho: string, init?: { body?: string }) => { mundo.evo.push({ caminho, corpo: init?.body ? JSON.parse(init.body) : null }); return mundo.evoResp }) }))
vi.mock("@/app/lib/email", () => ({ enviarEmail: vi.fn(async (para: string, e: { assunto: string }) => { mundo.emails.push({ para, assunto: e.assunto }); return mundo.emailOk ? { ok: true, id: "em1" } : { ok: false, erro: "falhou" } }) }))
vi.mock("@/app/lib/configAtomica", () => ({
  lerCampos: vi.fn(async () => mundo.cfg),
  mudarConfig: vi.fn(async (fn: (d: Record<string, unknown>) => Record<string, unknown> | null) => { const m = fn(mundo.cfg); if (m) Object.assign(mundo.cfg, m); return mundo.cfg }),
}))
vi.mock("@/app/lib/parceirosServidor", () => ({ mudarStatus: vi.fn(async (...a: unknown[]) => { mundo.status.push(a); return null }) }))

import { importarProspectos, responderProspecto, decidirCadastroParceiro, verificarWhatsapp, telefoneValido } from "@/app/lib/prospectorExterno"
import { celularWhatsapp, canaisDisponiveis } from "@/app/lib/prospectorEnvio"

const CNPJ_A = "11222333000181", CNPJ_B = "11444777000161"
const horaUtil = new Date("2026-11-25T15:00:00Z")   // quarta, 12h em São Paulo
const prospecto = (p: Linha = {}): Linha => ({ id: 1, cnpj: CNPJ_A, razao_social: "Gráfica Teste", etapa: "abordado", opt_out: false, historico_etapas: [], atualizado_em: "2026-11-25T00:00:00Z", telefone: "11987654321", email: "contato@exemplo.com.br", whatsapp_verificado: false, ...p })

beforeEach(() => { Object.assign(mundo, { prospectos: [], recebidos: [], mensagens: [], cfg: {}, evo: [], emails: [], emailOk: true, status: [], evoResp: { ok: true, status: 200, corpo: null } }) })

describe("permissão: só CCO e CMO", () => {
  for (const d of ["coo", "cfo", "cto"]) {
    it(`${d} recebe 403 nas quatro ações e nada é gravado`, async () => {
      mundo.prospectos = [prospecto()]
      const antes = JSON.stringify(mundo.prospectos)
      const rs = [
        await importarProspectos(d, { itens: [{ nome: "X Gráfica", cnpj: CNPJ_B, origem: "teste" }] }),
        await responderProspecto(d, { id: 1, texto: "oi" }, horaUtil),
        await decidirCadastroParceiro(d, { id: "PAR-1", decisao: "aprovar" }),
        await verificarWhatsapp(d, { numeros: ["11987654321"] }),
      ]
      for (const r of rs) expect(r).toMatchObject({ ok: false, status: 403 })
      expect(JSON.stringify(mundo.prospectos)).toBe(antes)
      expect(mundo.evo).toHaveLength(0); expect(mundo.emails).toHaveLength(0); expect(mundo.status).toHaveLength(0)
    })
  }
})

describe("importar_prospectos", () => {
  it("valida o corpo e cada item, com o motivo", async () => {
    expect(await importarProspectos("cco", {})).toMatchObject({ ok: false, status: 400 })
    expect(await importarProspectos("cco", { itens: Array.from({ length: 201 }, () => ({})) })).toMatchObject({ ok: false, status: 400 })
    const r = await importarProspectos("cco", { itens: [
      { nome: "A", cnpj: CNPJ_A, origem: "x" }, { nome: "Gráfica Boa", cnpj: CNPJ_A }, { nome: "Gráfica Boa", origem: "x" },
      { nome: "Gráfica Boa", cnpj: "11111111111111", origem: "x" }, { nome: "Gráfica Boa", cnpj: CNPJ_A, origem: "x", email: "xx" },
      { nome: "Gráfica Boa", cnpj: CNPJ_A, origem: "x", celular: "123" }, "texto",
    ] })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const rec = r.corpo.recusados as { motivo: string }[]
    expect(rec.map(x => x.motivo)).toEqual([
      "nome: de 2 a 200 caracteres", "origem: obrigatória, até 80 caracteres", "sem CNPJ: o Prospector identifica a gráfica pelo CNPJ",
      "CNPJ inválido", "e-mail inválido", "celular inválido (DDD + número)", "item não é um objeto",
    ])
    expect(mundo.prospectos).toHaveLength(0)
  })
  it("cria, deduplica (na base e na mesma lista) e registra quem importou", async () => {
    mundo.prospectos = [prospecto({ cnpj: CNPJ_B })]
    const r = await importarProspectos("cmo", { itens: [
      { nome: "Gráfica Nova", cnpj: CNPJ_A, celular: "(11) 98765-4321", email: "Novo@Exemplo.com", cidade: "Barueri", origem: "lista da feira" },
      { nome: "Gráfica Nova", cnpj: CNPJ_A, origem: "lista da feira" }, { nome: "Já existe", cnpj: CNPJ_B, origem: "lista da feira" },
    ] })
    expect(r.ok && r.corpo.resumo).toEqual({ criados: 1, duplicados: 2, recusados: 0 })
    const nova = mundo.prospectos.find(p => p.cnpj === CNPJ_A)!
    expect(nova).toMatchObject({ etapa: "encontrado", telefone: "11987654321", email: "novo@exemplo.com", municipio: "Barueri" })
    expect((nova.historico_etapas as { por: string }[])[0].por).toBe("cmo")
    expect(nova.nota).toBeUndefined()   // sem nota: não entra sozinho no envio
    expect(mundo.prospectos.find(p => p.cnpj === CNPJ_B)!.historico_etapas).toEqual([])   // quem já existe não é tocado
  })
  it("respeita a lista de exclusão: opt-out, descartado, contato de quem saiu e fora do ramo", async () => {
    mundo.prospectos = [
      prospecto({ id: 1, cnpj: CNPJ_A, opt_out: true, etapa: "descartado", telefone: "11911112222", email: "saiu@exemplo.com" }),
      prospecto({ id: 2, cnpj: CNPJ_B, etapa: "descartado" }),
    ]
    const r = await importarProspectos("cco", { itens: [
      { nome: "Mesma gráfica", cnpj: CNPJ_A, origem: "x" }, { nome: "Outra", cnpj: CNPJ_B, origem: "x" },
      { nome: "Filial", cnpj: "45723174000110", celular: "11911112222", origem: "x" }, { nome: "Filial 2", cnpj: "45723174000110", email: "SAIU@exemplo.com", origem: "x" },
      { nome: "Balões e Festa", cnpj: "45723174000110", origem: "x" },
    ] })
    expect(r.ok && (r.corpo.recusados as { motivo: string }[]).map(x => x.motivo)).toEqual([
      "na lista de exclusão (opt-out)", "na lista de exclusão (descartado)", "contato na lista de exclusão (opt-out)", "contato na lista de exclusão (opt-out)", "fora do ramo",
    ])
    expect(mundo.prospectos).toHaveLength(2)
  })
})

describe("responder_prospecto", () => {
  it("valida id, texto, existência e estado", async () => {
    expect(await responderProspecto("cco", { id: "x", texto: "oi" }, horaUtil)).toMatchObject({ status: 400 })
    expect(await responderProspecto("cco", { id: 1, texto: "  " }, horaUtil)).toMatchObject({ status: 400 })
    expect(await responderProspecto("cco", { id: 1, texto: "a".repeat(2001) }, horaUtil)).toMatchObject({ status: 400 })
    expect(await responderProspecto("cco", { id: 9, texto: "oi" }, horaUtil)).toMatchObject({ status: 404 })
    mundo.prospectos = [prospecto()]
    expect(await responderProspecto("cco", { id: 1, texto: "oi" }, horaUtil)).toMatchObject({ status: 409 })   // nunca escreveu
    expect(mundo.evo).toHaveLength(0)
  })
  it("exclusão: opt-out e descartado não recebem, mesmo tendo escrito antes", async () => {
    mundo.mensagens = [{ jid: "5511987654321@s.whatsapp.net", from_me: false, ts: "2026-11-25T10:00:00Z" }]
    for (const p of [{ opt_out: true }, { etapa: "descartado" }]) {
      mundo.prospectos = [prospecto(p)]
      expect(await responderProspecto("cco", { id: 1, texto: "oi" }, horaUtil)).toMatchObject({ ok: false, status: 409 })
    }
    expect(mundo.evo).toHaveLength(0)
  })
  it("só na janela de segunda a sexta, 8h às 20h", async () => {
    mundo.prospectos = [prospecto()]
    mundo.mensagens = [{ jid: "5511987654321@s.whatsapp.net", from_me: false, ts: "2026-11-25T10:00:00Z" }]
    for (const quando of ["2026-11-25T10:59:00Z", "2026-11-25T23:00:00Z", "2026-11-29T15:00:00Z"]) {
      expect(await responderProspecto("cco", { id: 1, texto: "oi" }, new Date(quando))).toMatchObject({ ok: false, status: 409 })
    }
    expect(mundo.evo).toHaveLength(0)
  })
  it("WhatsApp quando foi o último canal; grava como enviada, com quem fez", async () => {
    mundo.prospectos = [prospecto()]
    mundo.mensagens = [{ jid: "5511987654321@s.whatsapp.net", from_me: false, ts: "2026-11-25T14:00:00Z" }]
    mundo.recebidos = [{ prospecto_id: 1, de: "contato@exemplo.com.br", assunto: "Oi", recebido_em: "2026-11-24T10:00:00Z" }]
    mundo.evoResp = { ok: true, status: 201, corpo: { key: { id: "m1" } } }
    const r = await responderProspecto("cmo", { id: 1, texto: "Olá!" }, horaUtil)
    expect(r).toMatchObject({ ok: true, corpo: { canal: "whatsapp" } })
    expect(mundo.evo[0]).toMatchObject({ caminho: "/message/sendText/{i}", corpo: { number: "5511987654321", text: "Olá!" } })
    const h = (mundo.prospectos[0].historico_etapas as { por: string; mensagem: { status: string; canal: string } }[]).at(-1)!
    expect(h).toMatchObject({ por: "cmo", mensagem: { status: "enviada", canal: "whatsapp" } })
  })
  it("e-mail quando foi o último canal, com o mesmo assunto", async () => {
    mundo.prospectos = [prospecto()]
    mundo.mensagens = [{ jid: "5511987654321@s.whatsapp.net", from_me: false, ts: "2026-11-20T14:00:00Z" }]
    mundo.recebidos = [{ prospecto_id: 1, de: "contato@exemplo.com.br", assunto: "Parceria", recebido_em: "2026-11-25T11:00:00Z" }]
    const r = await responderProspecto("cco", { id: 1, texto: "Obrigado" }, horaUtil)
    expect(r).toMatchObject({ ok: true, corpo: { canal: "email" } })
    expect(mundo.emails).toEqual([{ para: "contato@exemplo.com.br", assunto: "Re: Parceria" }])
    expect(mundo.evo).toHaveLength(0)
  })
  it("falha do canal: 502 e a tentativa fica no histórico como não enviada", async () => {
    mundo.prospectos = [prospecto()]
    mundo.mensagens = [{ jid: "5511987654321@s.whatsapp.net", from_me: false, ts: "2026-11-25T14:00:00Z" }]
    mundo.evoResp = { ok: false, status: 500, corpo: null }
    expect(await responderProspecto("cco", { id: 1, texto: "oi" }, horaUtil)).toMatchObject({ ok: false, status: 502 })
    expect((mundo.prospectos[0].historico_etapas as { mensagem: { status: string } }[]).at(-1)!.mensagem.status).toBe("falhou")
  })
})

describe("decidir_cadastro_parceiro", () => {
  const cad = (c: Linha = {}) => ({ id: "PAR-1", em: "2026-11-20T10:00:00Z", status: "novo", nomeFantasia: "Gráfica Teste", documento: CNPJ_A, tipoDocumento: "cnpj", servicos: [], responsavel: "Fulano", whatsapp: "11987654321", email: "a@b.com", ...c })
  it("valida id, decisão, motivo, existência e que o cadastro ainda é novo", async () => {
    expect(await decidirCadastroParceiro("cco", { decisao: "aprovar" })).toMatchObject({ status: 400 })
    expect(await decidirCadastroParceiro("cco", { id: "PAR-1", decisao: "talvez" })).toMatchObject({ status: 400 })
    expect(await decidirCadastroParceiro("cco", { id: "PAR-1", decisao: "recusar", motivo: "a".repeat(301) })).toMatchObject({ status: 400 })
    mundo.cfg = { cadastrosParceiros: [cad({ status: "aprovado" })] }
    expect(await decidirCadastroParceiro("cco", { id: "PAR-9", decisao: "aprovar" })).toMatchObject({ status: 404 })
    expect(await decidirCadastroParceiro("cco", { id: "PAR-1", decisao: "aprovar" })).toMatchObject({ status: 409 })
    expect(mundo.status).toHaveLength(0)
    expect(mundo.cfg.producao).toBeUndefined()
  })
  it("aprovar cria o fornecedor uma vez, muda o status e registra quem decidiu no cadastro e no prospecto", async () => {
    mundo.cfg = { cadastrosParceiros: [cad()], producao: { fornecedores: [] } }
    mundo.prospectos = [prospecto({ etapa: "abordado" })]
    const r = await decidirCadastroParceiro("cco", { id: "PAR-1", decisao: "aprovar", motivo: "preços ok" })
    expect(r).toMatchObject({ ok: true, corpo: { status: "aprovado", fornecedorId: "f-par-1", registradoNoProspecto: true } })
    expect((mundo.cfg.producao as { fornecedores: { id: string }[] }).fornecedores.map(f => f.id)).toEqual(["f-par-1"])
    expect(mundo.status[0]).toEqual(["PAR-1", "aprovado", "f-par-1"])
    expect((mundo.cfg.cadastrosParceiros as { decisao: unknown }[])[0].decisao).toMatchObject({ por: "cco", decisao: "aprovar", motivo: "preços ok" })
    expect((mundo.prospectos[0].historico_etapas as { por: string }[]).at(-1)!.por).toBe("cco")
  })
  it("recusar não cria fornecedor", async () => {
    mundo.cfg = { cadastrosParceiros: [cad()] }
    const r = await decidirCadastroParceiro("cmo", { id: "PAR-1", decisao: "recusar" })
    expect(r).toMatchObject({ ok: true, corpo: { status: "recusado" } })
    expect(mundo.cfg.producao).toBeUndefined()
    expect(mundo.status[0]).toEqual(["PAR-1", "recusado", undefined])
  })
  it("prospecto em opt-out não é alterado", async () => {
    mundo.cfg = { cadastrosParceiros: [cad()] }
    mundo.prospectos = [prospecto({ opt_out: true, etapa: "descartado" })]
    const r = await decidirCadastroParceiro("cco", { id: "PAR-1", decisao: "recusar" })
    expect(r).toMatchObject({ ok: true, corpo: { registradoNoProspecto: false } })
    expect(mundo.prospectos[0].historico_etapas).toEqual([])
  })
})

describe("verificar_whatsapp", () => {
  it("valida a lista: vazia, acima de 50, item que não é texto", async () => {
    expect(await verificarWhatsapp("cco", {})).toMatchObject({ status: 400 })
    expect(await verificarWhatsapp("cco", { numeros: [] })).toMatchObject({ status: 400 })
    expect(await verificarWhatsapp("cco", { numeros: Array.from({ length: 51 }, () => "11987654321") })).toMatchObject({ status: 400 })
    expect(await verificarWhatsapp("cco", { numeros: [11987654321] })).toMatchObject({ status: 400 })
    expect(mundo.evo).toHaveLength(0)
  })
  it("número inválido não vai à Evolution", async () => {
    const r = await verificarWhatsapp("cco", { numeros: ["123", "abc"] })
    expect(r).toMatchObject({ ok: true, corpo: { invalidos: ["123", "abc"] } })
    expect(mundo.evo).toHaveLength(0)
  })
  it("marca whatsapp_verificado só em quem tem WhatsApp, sem mandar mensagem, com quem fez", async () => {
    mundo.prospectos = [prospecto({ id: 1, telefone: "1133334444" }), prospecto({ id: 2, cnpj: CNPJ_B, telefone: "11955556666" })]
    mundo.evoResp = { ok: true, status: 200, corpo: [{ exists: true, number: "551133334444" }, { exists: false, number: "5511955556666" }] }
    const r = await verificarWhatsapp("cmo", { numeros: ["(11) 3333-4444", "11955556666"] })
    expect(r).toMatchObject({ ok: true, corpo: { resultados: [{ whatsapp: true, prospectosAtualizados: 1 }, { whatsapp: false, prospectosAtualizados: 0 }] } })
    expect(mundo.evo).toHaveLength(1)
    expect(mundo.evo[0].caminho).toBe("/chat/whatsappNumbers/{i}")
    expect(mundo.prospectos.map(p => p.whatsapp_verificado)).toEqual([true, false])
    expect((mundo.prospectos[0].historico_etapas as { por: string }[]).at(-1)!.por).toBe("cmo")
  })
  it("exclusão: prospecto em opt-out não é alterado", async () => {
    mundo.prospectos = [prospecto({ telefone: "11987654321", opt_out: true, etapa: "descartado" })]
    mundo.evoResp = { ok: true, status: 200, corpo: [{ exists: true, number: "5511987654321" }] }
    const r = await verificarWhatsapp("cco", { numeros: ["11987654321"] })
    expect(r).toMatchObject({ ok: true, corpo: { resultados: [{ whatsapp: true, prospectosAtualizados: 0 }] } })
    expect(mundo.prospectos[0].whatsapp_verificado).toBe(false)
  })
  it("Evolution fora do ar: erro e nada gravado", async () => {
    mundo.prospectos = [prospecto()]
    mundo.evoResp = { ok: false, status: 0, corpo: null }
    expect(await verificarWhatsapp("cco", { numeros: ["11987654321"] })).toMatchObject({ ok: false, status: 503 })
    expect(mundo.prospectos[0].whatsapp_verificado).toBe(false)
  })
})

describe("fixo com whatsapp_verificado", () => {
  it("telefone válido com ou sem 55", () => {
    expect(telefoneValido("+55 (11) 3333-4444")).toBe("1133334444")
    expect(telefoneValido("11")).toBeNull()
  })
  it("fixo só vira canal WhatsApp quando verificado; celular segue igual", () => {
    expect(celularWhatsapp("1133334444")).toBeNull()
    expect(celularWhatsapp("1133334444", true)).toBe("551133334444")
    expect(celularWhatsapp("551133334444", true)).toBe("551133334444")
    expect(celularWhatsapp("11987654321")).toBe("5511987654321")
    expect(canaisDisponiveis({ telefone: "1133334444" })).toEqual([])
    expect(canaisDisponiveis({ telefone: "1133334444", whatsapp_verificado: true })).toEqual(["whatsapp"])
  })
})
