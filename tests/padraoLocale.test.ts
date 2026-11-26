import { describe, it, expect } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

// Padrão visual (docs/padrao-visual.md): toLocaleDateString/toLocaleString/toLocaleTimeString/Intl.DateTimeFormat
// sempre com locale explícito. Sem locale, o Node usa o do servidor (inglês) e a data sai em inglês.
// Locale técnico (sv-SE/en-CA para "AAAA-MM-DD", en-US/en-GB só para ler partes numéricas) é aceito; texto para pessoa usa 'pt-BR'.
const CHAMADA = /(toLocaleDateString|toLocaleString|toLocaleTimeString|Intl\.DateTimeFormat)\(\s*([^)]?)/g
const OK = /^["'`](pt-BR|sv-SE|en-CA|en-US|en-GB)["'`]/

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n)
    if (n === "node_modules" || n === ".next") return []
    return statSync(p).isDirectory() ? arquivos(p) : /\.(ts|tsx)$/.test(n) ? [p] : []
  })
}

describe("padrão de locale em app/", () => {
  it("nenhuma data/hora formatada sem locale", () => {
    const erros: string[] = []
    for (const f of arquivos("app")) {
      const src = readFileSync(f, "utf8")
      for (const m of src.matchAll(CHAMADA)) {
        const resto = src.slice(m.index! + m[0].length - m[2].length).trimStart()
        if (!OK.test(resto)) erros.push(`${f}:${src.slice(0, m.index).split("\n").length} ${m[1]}(`)
      }
    }
    expect(erros, "use 'pt-BR' (ver docs/padrao-visual.md)").toEqual([])
  })
})
