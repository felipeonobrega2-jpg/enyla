// Fase 4 — coleta: dados que a inteligência vai usar depois.
//   Motivo de perda em lista (os antigos, escritos à mão, são lidos pela mesma lista)
//   Origem do cliente (anúncio, indicação, Instagram…), deduzida quando dá e perguntada uma vez quando não dá

import { KanbanCard, Cliente, COL_PERDIDO } from "../types"
import { isExpirado, nomeChave } from "./negocio"

// ── Motivo de perda ──────────────────────────────────────────────────────────

export type CategoriaPerda = "preco" | "sumiu" | "concorrente" | "prazo" | "perfil" | "outraOpcao" | "desistiu" | "erro" | "expirado" | "outro"

export const MOTIVOS_PERDA: { id: Exclude<CategoriaPerda, "expirado">; rotulo: string; dica: string }[] = [
  { id: "preco",       rotulo: "Preço",                 dica: "achou caro ou fora do orçamento" },
  { id: "sumiu",       rotulo: "Sumiu",                 dica: "parou de responder" },
  { id: "concorrente", rotulo: "Fechou com outro",      dica: "foi para outra gráfica" },
  { id: "prazo",       rotulo: "Prazo",                 dica: "precisava para antes" },
  { id: "perfil",      rotulo: "Fora do perfil",        dica: "quantidade pequena, começando o negócio" },
  { id: "outraOpcao",  rotulo: "Fechou outra opção",    dica: "fechou conosco, mas outro orçamento" },
  { id: "desistiu",    rotulo: "Desistiu do projeto",   dica: "adiou ou cancelou a ideia" },
  { id: "erro",        rotulo: "Erro nosso",            dica: "preço, atendimento ou golpe" },
  { id: "outro",       rotulo: "Outro",                 dica: "" },
]

export const rotuloPerda = (c: CategoriaPerda) => c === "expirado" ? "Venceu sem resposta" : MOTIVOS_PERDA.find(m => m.id === c)?.rotulo ?? "Outro"

// Grava como "Rótulo — detalhe" no motivoPerdido (o campo de texto que já existe)
export const textoMotivo = (c: CategoriaPerda, detalhe?: string) => [rotuloPerda(c), detalhe?.trim()].filter(Boolean).join(" — ")

// Lê qualquer motivo (da lista nova ou escrito à mão) e devolve a categoria
export function categoriaPerda(card: Pick<KanbanCard, "coluna" | "motivoPerdido">): CategoriaPerda | null {
  if (card.coluna !== COL_PERDIDO) return null
  if (isExpirado(card as KanbanCard)) return "expirado"
  const t = (card.motivoPerdido ?? "").trim()
  const daLista = MOTIVOS_PERDA.find(m => t === m.rotulo || t.startsWith(m.rotulo + " — "))
  if (daLista) return daLista.id
  const s = nomeChave(t)
  if (/fechou (pedido|orcamento|a opcao)|optou pelo orcamento|fechou .*(menor|maior)/.test(s)) return "outraOpcao"
  if (/erro|golpe|falha nossa/.test(s)) return "erro"
  if (/outro lugar|outra grafica|concorr|fechou com/.test(s)) return "concorrente"
  if (/caro|preco|realidade|valor|orcamento do cliente/.test(s)) return "preco"
  if (/sumiu|nao respond|sem resposta|nao quis mais contato|visualiz/.test(s)) return "sumiu"
  if (/icp|perfil|comecando|menor quantidade|pouca quantidade|aproximacao/.test(s)) return "perfil"
  if (/prazo|urgen|data/.test(s)) return "prazo"
  if (/desist|adiou|cancel|projeto/.test(s)) return "desistiu"
  return "outro"
}

// ── Origem do cliente ────────────────────────────────────────────────────────

export type CanalOrigem = "anuncio" | "instagram" | "indicacao" | "google" | "site" | "evento" | "outro"
export type OrigemCliente = { canal: CanalOrigem; detalhe?: string }

export const CANAIS_ORIGEM: { id: CanalOrigem; rotulo: string; detalhe?: string }[] = [
  { id: "anuncio",   rotulo: "Anúncio" },
  { id: "instagram", rotulo: "Instagram" },
  { id: "indicacao", rotulo: "Indicação", detalhe: "Quem indicou?" },
  { id: "google",    rotulo: "Google" },
  { id: "site",      rotulo: "Site" },
  { id: "evento",    rotulo: "Feira / evento" },
  { id: "outro",     rotulo: "Outro", detalhe: "De onde?" },
]

export const rotuloCanal = (c: CanalOrigem | "sem") => c === "sem" ? "Sem origem" : CANAIS_ORIGEM.find(x => x.id === c)?.rotulo ?? "Outro"

export type OrigensClientes = Record<string, OrigemCliente>   // nomeChave → origem

// Origem do cliente: o que foi informado; senão, a campanha do cadastro; senão, nada (perguntar)
export function origemDoCliente(nome: string, origens: OrigensClientes | undefined, clientes: Pick<Cliente, "nome" | "origemCampanhaNome">[]): (OrigemCliente & { deduzida?: boolean }) | null {
  const k = nomeChave(nome)
  const informada = origens?.[k]
  if (informada) return informada
  const campanha = clientes.find(c => nomeChave(c.nome) === k)?.origemCampanhaNome
  if (campanha) return { canal: "anuncio", detalhe: campanha, deduzida: true }
  return null
}

export const textoOrigem = (o: OrigemCliente | null) =>
  !o ? "Sem origem" : o.detalhe ? `${rotuloCanal(o.canal)} · ${o.detalhe}` : rotuloCanal(o.canal)
