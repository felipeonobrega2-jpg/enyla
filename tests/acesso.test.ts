import { describe, it, expect } from "vitest"
import { INTERRUPTORES, classificar, decidir, type InterruptorId, type Interruptores } from "../app/lib/acesso"
import { avaliarGuarda, enxugar, TAMANHO_MAX_AUDITORIA } from "../app/lib/guardaAcesso"

const desligados: Interruptores = {}
const ligado = (id: InterruptorId): Interruptores => ({ [id]: true })

// Uma ação representativa por bloqueio: o diretor faz com o interruptor desligado e é barrado (403) com ele ligado
const ACOES: { id: InterruptorId; metodo: string; caminho: string; corpo?: unknown; salvo?: Record<string, unknown> }[] = [
  { id: "apagar", metodo: "DELETE", caminho: "/api/kanban/abc" },
  { id: "financeiro", metodo: "POST", caminho: "/api/lancamentos" },
  { id: "cobranca", metodo: "POST", caminho: "/api/asaas/cobrar" },
  { id: "preco", metodo: "POST", caminho: "/api/config", corpo: { custos: { arte: 999 } }, salvo: { custos: { arte: 200 } } },
  { id: "configuracao", metodo: "POST", caminho: "/api/config/gemini" },
  { id: "mensagem_externa", metodo: "POST", caminho: "/api/whatsapp/enviar" },
  { id: "meta", metodo: "POST", caminho: "/api/campanha-digital" },
]

describe("diretor: os 7 interruptores", () => {
  it("são 7 e nascem desligados", () => {
    expect(INTERRUPTORES).toHaveLength(7)
    expect(ACOES.map(a => a.id).sort()).toEqual(INTERRUPTORES.map(i => i.id).sort())
    for (const a of ACOES) expect(avaliarGuarda({ papel: "diretor", metodo: a.metodo, caminho: a.caminho, corpo: a.corpo, configSalva: a.salvo, interruptores: undefined }).decisao.permitido).toBe(true)
  })
  for (const a of ACOES) {
    it(`${a.id}: desligado permite, ligado barra com 403 e mensagem`, () => {
      const base = { papel: "diretor" as const, metodo: a.metodo, caminho: a.caminho, corpo: a.corpo, configSalva: a.salvo }
      expect(avaliarGuarda({ ...base, interruptores: desligados }).decisao.permitido).toBe(true)
      const d = avaliarGuarda({ ...base, interruptores: ligado(a.id) }).decisao
      expect(d.permitido).toBe(false)
      if (!d.permitido) { expect(d.status).toBe(403); expect(d.interruptor).toBe(a.id); expect(d.mensagem.length).toBeGreaterThan(20) }
    })
    it(`${a.id}: ligar outro interruptor não barra esta ação`, () => {
      const outro = INTERRUPTORES.find(i => i.id !== a.id && !classificar(a.metodo, a.caminho).includes(i.id))!.id
      expect(avaliarGuarda({ papel: "diretor", metodo: a.metodo, caminho: a.caminho, corpo: a.corpo, configSalva: a.salvo, interruptores: ligado(outro) }).decisao.permitido).toBe(true)
    })
  }
  it("só `true` liga (valor estranho continua desligado)", () => {
    const d = decidir("diretor", { apagar: "sim" } as unknown as Interruptores, ["apagar"])
    expect(d.permitido).toBe(true)
  })
})

describe("admin e leitura", () => {
  const tudoLigado = Object.fromEntries(INTERRUPTORES.map(i => [i.id, true])) as Interruptores
  it("admin passa por tudo, mesmo com tudo ligado, e não gera auditoria de diretor", () => {
    for (const a of ACOES) {
      const r = avaliarGuarda({ papel: "admin", metodo: a.metodo, caminho: a.caminho, corpo: a.corpo, configSalva: a.salvo, interruptores: tudoLigado })
      expect(r.decisao.permitido).toBe(true)
      expect(r.auditar).toBe(false)
    }
  })
  it("diretor com tudo ligado ainda lê (GET) financeiro, Meta e conversas", () => {
    for (const c of ["/api/lancamentos", "/api/gastos", "/api/meta", "/api/whatsapp/conversas", "/api/whatsapp/mensagens/x", "/api/campanha-digital"]) {
      expect(avaliarGuarda({ papel: "diretor", metodo: "GET", caminho: c, interruptores: tudoLigado }).decisao.permitido).toBe(true)
    }
  })
  it("diretor com tudo ligado ainda opera produção, ideias, propostas e recebi/enviei", () => {
    const livres: [string, string][] = [["PUT", "/api/kanban/abc"], ["POST", "/api/kanban"], ["POST", "/api/clientes"], ["POST", "/api/propostas"], ["POST", "/api/fornecedores/avisar-pedido"], ["POST", "/api/whatsapp/lead"], ["POST", "/api/pendencias"]]
    for (const [m, c] of livres) expect(avaliarGuarda({ papel: "diretor", metodo: m, caminho: c, interruptores: tudoLigado }).decisao.permitido).toBe(true)
  })
  it("config: salvar ideias (nada de preço ou chave mudou) passa mesmo com tudo ligado", () => {
    const r = avaliarGuarda({ papel: "diretor", metodo: "POST", caminho: "/api/config", corpo: { ideias: [{ id: "x" }], custos: { arte: 200 } }, configSalva: { custos: { arte: 200 } }, interruptores: tudoLigado })
    expect(r.decisao.permitido).toBe(true)
  })
  it("config: mudar chave de API cai em configuração e mudar despesa fixa cai em financeiro", () => {
    expect(avaliarGuarda({ papel: "diretor", metodo: "POST", caminho: "/api/config", corpo: { apiKey: "nova" }, configSalva: { apiKey: "" }, interruptores: ligado("configuracao") }).decisao.permitido).toBe(false)
    expect(avaliarGuarda({ papel: "diretor", metodo: "POST", caminho: "/api/config", corpo: { gastosFixos: [{ id: "1" }] }, configSalva: { gastosFixos: [] }, interruptores: ligado("financeiro") }).decisao.permitido).toBe(false)
  })
  it("a chave de API nunca vai para o log", () => {
    const r = avaliarGuarda({ papel: "diretor", metodo: "POST", caminho: "/api/config", corpo: { apiKey: "sk-segredo" }, configSalva: { apiKey: "sk-antiga" }, interruptores: desligados })
    expect(JSON.stringify(r.antesDepois)).not.toContain("sk-")
  })
})

describe("usuários e papéis", () => {
  it("diretor nunca acessa /api/usuarios, nem com tudo desligado", () => {
    for (const m of ["GET", "POST", "PATCH"]) {
      const d = avaliarGuarda({ papel: "diretor", metodo: m, caminho: "/api/usuarios", interruptores: desligados }).decisao
      expect(d.permitido).toBe(false)
    }
    expect(avaliarGuarda({ papel: "diretor", metodo: "POST", caminho: "/api/usuarios/interruptores", interruptores: desligados }).decisao.permitido).toBe(false)
  })
  it("sem papel, nega", () => {
    expect(decidir(undefined, desligados, []).permitido).toBe(false)
  })
})

describe("auditoria do diretor", () => {
  it("escrita liberada do diretor é auditada; leitura e bloqueio não", () => {
    expect(avaliarGuarda({ papel: "diretor", metodo: "PUT", caminho: "/api/kanban/abc", interruptores: desligados }).auditar).toBe(true)
    expect(avaliarGuarda({ papel: "diretor", metodo: "GET", caminho: "/api/kanban", interruptores: desligados }).auditar).toBe(false)
    expect(avaliarGuarda({ papel: "diretor", metodo: "DELETE", caminho: "/api/kanban/abc", interruptores: ligado("apagar") }).auditar).toBe(false)
  })
  it("config: registra só os campos que mudaram, antes e depois", () => {
    const r = avaliarGuarda({ papel: "diretor", metodo: "POST", caminho: "/api/config", corpo: { custos: { arte: 300 }, materiais: [1] }, configSalva: { custos: { arte: 200 }, materiais: [1] }, interruptores: desligados })
    expect(r.antesDepois).toEqual({ antes: { custos: { arte: 200 } }, depois: { custos: { arte: 300 } } })
  })
  it("corpo grande é cortado", () => {
    const g = enxugar({ x: "a".repeat(TAMANHO_MAX_AUDITORIA + 10) }) as { _cortado?: boolean }
    expect(g._cortado).toBe(true)
    expect(enxugar(undefined)).toBeNull()
  })
})
