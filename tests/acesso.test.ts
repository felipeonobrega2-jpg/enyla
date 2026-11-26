import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import {
  BLOQUEIOS, INTERRUPTORES_PADRAO, avaliar, bloqueiosDaConfig, bloqueiosDaRota, normalizarInterruptores, type Bloqueio, type Interruptores,
} from "@/app/lib/acesso"

const ligado = (b: Bloqueio): Interruptores => ({ ...INTERRUPTORES_PADRAO, [b]: true })

// Uma ação de cada um dos 7 bloqueios: como o proxy a enxerga (método + caminho, ou campo da configuração)
const ACOES: { bloqueio: Bloqueio; nome: string; tocados: () => Bloqueio[] }[] = [
  { bloqueio: "apagar", nome: "DELETE /api/kanban/123", tocados: () => bloqueiosDaRota("DELETE", "/api/kanban/123") },
  { bloqueio: "financeiro", nome: "POST /api/lancamentos", tocados: () => bloqueiosDaRota("POST", "/api/lancamentos") },
  { bloqueio: "cobranca", nome: "GET /api/pix-link/ENY-1", tocados: () => bloqueiosDaRota("GET", "/api/pix-link/ENY-1") },
  { bloqueio: "preco", nome: "POST /api/config mudando materiais", tocados: () => bloqueiosDaConfig(["materiais"]) },
  { bloqueio: "configuracao", nome: "POST /api/usuarios", tocados: () => bloqueiosDaRota("POST", "/api/usuarios") },
  { bloqueio: "mensagem_externa", nome: "POST /api/whatsapp/enviar", tocados: () => bloqueiosDaRota("POST", "/api/whatsapp/enviar") },
  { bloqueio: "meta", nome: "POST /api/campanha-digital", tocados: () => bloqueiosDaRota("POST", "/api/campanha-digital") },
]

describe("perfil diretor: 7 interruptores, desligados por padrão", () => {
  it("o padrão é tudo desligado", () => {
    expect(BLOQUEIOS).toHaveLength(7)
    expect(Object.values(INTERRUPTORES_PADRAO).every(v => v === false)).toBe(true)
    expect(normalizarInterruptores(undefined)).toEqual(INTERRUPTORES_PADRAO)
    expect(normalizarInterruptores({ apagar: "true", meta: 1 })).toEqual(INTERRUPTORES_PADRAO)   // só `true` liga
  })

  for (const a of ACOES) {
    describe(a.bloqueio, () => {
      it(`${a.nome}: toca o bloqueio certo`, () => expect(a.tocados()).toContain(a.bloqueio))
      it("diretor faz com o interruptor desligado", () => {
        expect(avaliar("diretor", INTERRUPTORES_PADRAO, a.tocados())).toEqual({ ok: true })
      })
      it("diretor é barrado (403, mensagem clara) com o interruptor ligado", () => {
        const d = avaliar("diretor", ligado(a.bloqueio), a.tocados())
        expect(d.ok).toBe(false)
        if (!d.ok) { expect(d.status).toBe(403); expect(d.bloqueio).toBe(a.bloqueio); expect(d.erro).toMatch(/Perfil diretor sem permissão/) }
      })
      it("ligar um interruptor não barra os outros nem o admin", () => {
        const outros = ACOES.filter(x => x.bloqueio !== a.bloqueio && !x.tocados().includes(a.bloqueio))
        for (const o of outros) expect(avaliar("diretor", ligado(a.bloqueio), o.tocados()).ok).toBe(true)
        expect(avaliar("admin", ligado(a.bloqueio), a.tocados())).toEqual({ ok: true })
      })
    })
  }
})

describe("caminhos que o diretor segue fazendo (nenhum bloqueio)", () => {
  const todosLigados = Object.fromEntries(BLOQUEIOS.map(b => [b, true])) as Interruptores
  const livres: [string, string][] = [
    ["PATCH", "/api/kanban/123"],            // mover card (inclui Entregue e Perdidos)
    ["POST", "/api/fornecedores"],
    ["GET", "/api/lancamentos"],             // leitura do financeiro
    ["GET", "/api/meta"],                    // leitura dos números da Meta
    ["GET", "/api/whatsapp/conversas"],
    ["POST", "/api/propostas"],
    ["POST", "/api/diretoria/conversa"],     // ordem ao funcionário não envia nada direto
  ]
  for (const [m, p] of livres) it(`${m} ${p}`, () => {
    expect(bloqueiosDaRota(m, p)).toEqual([])
    expect(avaliar("diretor", todosLigados, bloqueiosDaRota(m, p))).toEqual({ ok: true })
  })
  it("config: salvar ideias não toca nenhum bloqueio", () => expect(bloqueiosDaConfig(["ideias", "producao"])).toEqual([]))
})

describe("integração com o proxy", () => {
  const proxy = readFileSync("proxy.ts", "utf8")
  it("o proxy confere o perfil no servidor e registra a alteração", () => {
    expect(proxy).toMatch(/avaliar\(u\.perfil, interruptores, tocados\)/)
    expect(proxy).toMatch(/registrarAuditoria/)
    expect(proxy).toMatch(/status: 503/)   // sem conferir/registrar, não passa
  })
  it("nenhum usuário, senha ou chave no código novo", () => {
    for (const f of ["app/lib/acesso.ts", "app/lib/usuarios.ts", "app/lib/auditoriaDiretor.ts"]) {
      expect(readFileSync(f, "utf8")).not.toMatch(/\$2[aby]\$\d\d\$[./A-Za-z0-9]{50,}/)
    }
  })
})
