// Servidor do prospector: o cadastro em /parceiros não depende do gancho do funil,
// a etapa só vai para "cadastrou" na aprovação do Felipe, e a gravação usa trava otimista.
// Tudo que sairia do servidor (Supabase, e-mail, WhatsApp, aviso) é simulado: nada é enviado.
import { describe, it, expect, vi, beforeEach } from "vitest"

type Cfg = Record<string, unknown> & { cadastrosParceiros?: { id: string; documento: string; status: string }[] }
const estado = vi.hoisted(() => ({ cfg: {} as Record<string, unknown> }))

vi.mock("@/app/lib/configAtomica", () => ({
  lerConfigLinha: vi.fn(async () => ({ data: { data: estado.cfg }, error: null })),
  mudarConfig: vi.fn(async (mudar: (d: Record<string, unknown>) => Record<string, unknown> | null) => {
    estado.cfg = { ...estado.cfg, ...(mudar(estado.cfg) ?? {}) }
    return estado.cfg
  }),
}))
vi.mock("@/app/lib/supabase", () => ({ supabase: { from: vi.fn(), storage: { from: vi.fn() } } }))
vi.mock("@/app/lib/notificar", () => ({ notificar: vi.fn(async () => null), LINK_SISTEMA: "https://exemplo.test" }))
vi.mock("@/app/lib/geocodificar", () => ({ enderecoPeloCep: vi.fn(async () => ({ erro: "teste" })) }))
vi.mock("@/app/lib/emailsServidor", () => ({ emailDoCadastro: vi.fn(async () => ({ tipo: "teste", ok: false })) }))
vi.mock("@/app/lib/evolution", () => ({ evo: vi.fn(async () => null) }))
vi.mock("@/app/lib/agenteAuto", () => ({ seuNumero: vi.fn(async () => "") }))
vi.mock("@/app/lib/prospectorServidor", async orig => {
  const real = await orig<typeof import("@/app/lib/prospectorServidor")>()
  return {
    ...real,
    registrarCadastroRecebido: vi.fn(real.registrarCadastroRecebido),
    marcarProspectCadastrou: vi.fn(real.marcarProspectCadastrou),
  }
})

import { supabase } from "@/app/lib/supabase"
import { receberCadastro, mudarStatus } from "@/app/lib/parceirosServidor"
import * as prospector from "@/app/lib/prospectorServidor"
import { MOTIVO_CADASTRO_APROVADO, MOTIVO_CADASTRO_RECEBIDO } from "@/app/lib/prospector"

const CNPJ = "11222333000181"
const dados = {
  nomeFantasia: "Gráfica Exemplo", tipoDocumento: "cnpj", documento: CNPJ, cep: "01310100", rua: "Avenida Paulista", numero: "1000",
  bairro: "Bela Vista", cidade: "São Paulo", uf: "SP", responsavel: "Marcos", whatsapp: "11988887777", email: "a@b.com.br",
  servicos: [{ id: "corteVinco", cobranca: "milheiro", valor: 38, prazoDias: 3, prazoVaria: false }], aceite: true,
}
function formulario() {
  const f = new FormData()
  f.set("dados", JSON.stringify(dados))
  return f
}

// Construtor de consulta falso: guarda cada chamada e devolve a leitura (maybeSingle) ou a gravação (await).
type Chamada = { op: string; args: unknown[] }
function tabelaFalsa(leitura: { data: unknown; error: unknown }, gravacao: { data: unknown; error: unknown }) {
  const chamadas: Chamada[] = []
  const from = () => {
    const q: Record<string, unknown> = {}
    for (const op of ["select", "eq", "neq", "order", "limit", "update"]) q[op] = (...args: unknown[]) => { chamadas.push({ op, args }); return q }
    q.maybeSingle = async () => leitura
    q.then = (ok: (v: unknown) => unknown) => ok(gravacao)
    return q
  }
  return { from, chamadas }
}

beforeEach(() => {
  estado.cfg = {}
  vi.mocked(supabase.from).mockReset()
  vi.mocked(prospector.registrarCadastroRecebido).mockClear()
  vi.mocked(prospector.marcarProspectCadastrou).mockClear()
})

describe("cadastro em /parceiros com o gancho do prospector", () => {
  it("o cadastro continua salvo se o gancho do prospector rejeitar", async () => {
    vi.mocked(prospector.registrarCadastroRecebido).mockRejectedValueOnce(new Error("falhou"))
    const r = await receberCadastro(formulario())
    expect(r.ok).toBe(true)
    const salvos = (estado.cfg as Cfg).cadastrosParceiros ?? []
    expect(salvos).toHaveLength(1)
    expect(salvos[0]).toMatchObject({ documento: CNPJ, status: "novo" })
    expect(prospector.registrarCadastroRecebido).toHaveBeenCalledWith(CNPJ, "cnpj", salvos[0].id)
  })

  it("o cadastro continua salvo se a tabela do prospector não existir", async () => {
    vi.mocked(supabase.from).mockImplementation(() => { throw new Error('relation "prospectos_parceiros" does not exist') })
    const r = await receberCadastro(formulario())
    expect(r.ok).toBe(true)
    expect((estado.cfg as Cfg).cadastrosParceiros).toHaveLength(1)
  })

  it("o cadastro público não muda a etapa: só registra no histórico", async () => {
    const t = tabelaFalsa({ data: { id: 7, etapa: "abordado", opt_out: false, historico_etapas: [] }, error: null }, { data: [{ id: 7 }], error: null })
    vi.mocked(supabase.from).mockImplementation(t.from as never)
    const r = await receberCadastro(formulario())
    expect(r.ok).toBe(true)
    expect(prospector.marcarProspectCadastrou).not.toHaveBeenCalled()
    const update = t.chamadas.find(c => c.op === "update")?.args[0] as { etapa: string; historico_etapas: { motivo: string; cadastroId: string }[] }
    expect(update.etapa).toBe("abordado")
    expect(update.historico_etapas).toEqual([expect.objectContaining({ etapa: "abordado", motivo: MOTIVO_CADASTRO_RECEBIDO, cadastroId: (r as { id: string }).id })])
  })
})

describe("aprovação do Felipe", () => {
  it("aprovar leva o prospecto para cadastrou; a aprovação fica salva mesmo se o gancho falhar", async () => {
    estado.cfg = { cadastrosParceiros: [{ ...dados, id: "PAR-1", em: "2026-11-24T12:00:00Z", status: "novo", gerente: "Felipe", arquivos: [] }] }
    vi.mocked(prospector.marcarProspectCadastrou).mockRejectedValueOnce(new Error("falhou"))
    await mudarStatus("PAR-1", "aprovado", "f-1")
    expect(prospector.marcarProspectCadastrou).toHaveBeenCalledWith(CNPJ, "cnpj", "PAR-1")
    expect((estado.cfg as Cfg).cadastrosParceiros?.[0]).toMatchObject({ status: "aprovado" })
  })

  it("recusar não mexe no prospecto", async () => {
    estado.cfg = { cadastrosParceiros: [{ ...dados, id: "PAR-2", em: "2026-11-24T12:00:00Z", status: "novo", gerente: "Felipe", arquivos: [] }] }
    await mudarStatus("PAR-2", "recusado")
    expect(prospector.marcarProspectCadastrou).not.toHaveBeenCalled()
  })
})

describe("marcarProspectCadastrou", () => {
  it("o update é condicionado à etapa lida no select (trava otimista)", async () => {
    const t = tabelaFalsa({ data: { id: 7, etapa: "qualificado", opt_out: false, historico_etapas: [] }, error: null }, { data: [{ id: 7 }], error: null })
    vi.mocked(supabase.from).mockImplementation(t.from as never)
    expect(await prospector.marcarProspectCadastrou(CNPJ, "cnpj", "PAR-1")).toBe(true)
    const i = t.chamadas.findIndex(c => c.op === "update")
    const update = t.chamadas[i].args[0] as { etapa: string; historico_etapas: unknown[] }
    expect(update.etapa).toBe("cadastrou")
    expect(update.historico_etapas).toEqual([expect.objectContaining({ etapa: "cadastrou", motivo: MOTIVO_CADASTRO_APROVADO, cadastroId: "PAR-1" })])
    const filtros = t.chamadas.slice(i + 1).filter(c => c.op === "eq").map(c => c.args)
    expect(filtros).toContainEqual(["id", 7])
    expect(filtros).toContainEqual(["etapa", "qualificado"])
  })

  it("se a etapa mudou entre a leitura e a gravação, não grava nada", async () => {
    const t = tabelaFalsa({ data: { id: 7, etapa: "qualificado", opt_out: false, historico_etapas: [] }, error: null }, { data: [], error: null })
    vi.mocked(supabase.from).mockImplementation(t.from as never)
    expect(await prospector.marcarProspectCadastrou(CNPJ, "cnpj", "PAR-1")).toBe(false)
  })

  it("descartado não volta para cadastrou", async () => {
    const t = tabelaFalsa({ data: { id: 7, etapa: "descartado", opt_out: true, historico_etapas: [] }, error: null }, { data: [{ id: 7 }], error: null })
    vi.mocked(supabase.from).mockImplementation(t.from as never)
    expect(await prospector.marcarProspectCadastrou(CNPJ, "cnpj", "PAR-1")).toBe(false)
    expect(t.chamadas.some(c => c.op === "update")).toBe(false)
  })
})

describe("lista das maiores notas", () => {
  it("ordena por nota no banco antes do limite", async () => {
    const t = tabelaFalsa({ data: null, error: null }, { data: [], error: null, count: 0 } as never)
    vi.mocked(supabase.from).mockImplementation(t.from as never)
    await prospector.lerFunil()
    const ops = t.chamadas.map(c => c.op)
    const ordem = t.chamadas.findIndex(c => c.op === "order")
    expect(t.chamadas[ordem].args).toEqual(["nota", { ascending: false, nullsFirst: false }])
    expect(ops.indexOf("limit", ordem)).toBeGreaterThan(ordem)
  })
})
