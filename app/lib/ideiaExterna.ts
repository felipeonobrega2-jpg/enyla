// Porta externa: o diretor registra e atualiza ideias no banco de ideias (acao 'registrar_ideia' e 'atualizar_ideia').
// Mesmo lugar e mesma gravação do anotar_ideia (AppConfig.ideias, via mudarConfig). Não existe ação de apagar:
// apagar continua só na tela, com o Felipe. Não manda mensagem a ninguém.
import { mudarConfig } from "./configAtomica"
import type { IdDiretor } from "./diretoria"
import type { Ideia, StatusIdeia } from "../config"

export const TEXTO_MAX = 2000
export const STATUS_VALIDOS: StatusIdeia[] = ["ideia", "andamento", "feita"]
export type ResultadoIdeia = { status: number; corpo: Record<string, unknown> }

export const AJUDA_IDEIAS = {
  registrar_ideia: "QUALQUER DIRETOR. POST {acao:'registrar_ideia', texto}: grava uma ideia nova no banco de ideias (status 'ideia', autor = a sua área). texto obrigatório, até 2.000 caracteres. Resposta: { ok, resultado, ideia }",
  atualizar_ideia: "QUALQUER DIRETOR. POST {acao:'atualizar_ideia', id, status:'ideia'|'andamento'|'feita', texto?}: muda o status de uma ideia (ex.: marcar como feita o que já foi construído) e, se vier texto (até 2.000 caracteres), reescreve o texto. Para juntar duplicadas: reescreva o texto de uma e marque a outra como feita com texto 'juntada em <id>'. id inexistente: 404; status inválido: 400. Não existe ação de apagar (só na tela, com o Felipe). Resposta: { ok, resultado, ideia }",
}

const lerTexto = (v: unknown): { ok: true; texto: string } | { ok: false; erro: string } => {
  if (typeof v !== "string") return { ok: false, erro: "texto: obrigatório (texto)." }
  const texto = v.trim()
  if (!texto) return { ok: false, erro: "texto: obrigatório." }
  if (texto.length > TEXTO_MAX) return { ok: false, erro: `texto: no máximo ${TEXTO_MAX} caracteres.` }
  return { ok: true, texto }
}

export async function registrarIdeia(diretor: IdDiretor, b: Record<string, unknown>): Promise<ResultadoIdeia> {
  const t = lerTexto(b.texto)
  if (!t.ok) return { status: 400, corpo: { erro: t.erro } }
  // Mesmo formato de id do anotar_ideia (prefixo + tempo em base 36); o prefixo marca a origem (porta externa)
  const ideia: Ideia = { id: `ex-${Date.now().toString(36)}`, texto: t.texto, status: "ideia", criadaEm: new Date().toISOString(), autor: diretor }
  await mudarConfig((d: Record<string, unknown> & { ideias?: Ideia[] }) => ({ ideias: [ideia, ...(d.ideias ?? [])] }))
  return { status: 200, corpo: { ok: true, resultado: `Ideia registrada no banco de ideias (${ideia.id}).`, ideia } }
}

export async function atualizarIdeia(diretor: IdDiretor, b: Record<string, unknown>): Promise<ResultadoIdeia> {
  const id = typeof b.id === "string" ? b.id.trim() : ""
  if (!id) return { status: 400, corpo: { erro: "id: obrigatório." } }
  if (typeof b.status !== "string" || !STATUS_VALIDOS.includes(b.status as StatusIdeia)) return { status: 400, corpo: { erro: `status: ${STATUS_VALIDOS.join(" | ")}.` } }
  const status = b.status as StatusIdeia
  let texto: string | null = null
  if (b.texto != null) {
    const t = lerTexto(b.texto)
    if (!t.ok) return { status: 400, corpo: { erro: t.erro } }
    texto = t.texto
  }
  let achada: Ideia | null = null
  await mudarConfig((d: Record<string, unknown> & { ideias?: Ideia[] }) => {
    achada = null
    const lista = d.ideias ?? []
    if (!lista.some(i => i.id === id)) return null
    return { ideias: lista.map(i => {
      if (i.id !== id) return i
      achada = { ...i, status, ...(texto ? { texto } : {}), atualizadaPor: diretor, atualizadaEm: new Date().toISOString() }
      return achada
    }) }
  })
  if (!achada) return { status: 404, corpo: { erro: `Ideia ${id} não encontrada (veja ?o=conhecimento, campo bancoDeIdeias).` } }
  return { status: 200, corpo: { ok: true, resultado: `Ideia ${id} atualizada (status ${status}).`, ideia: achada } }
}
