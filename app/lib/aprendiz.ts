// Aprendiz do sistema: o Felipe ensina uma vez, a partir de qualquer item da caixa de entrada, e a IA organiza para
// o lugar certo: regra da caixa (esconder / subir / baixar o que bate), conhecimento do atendente do WhatsApp, lição de
// outra IA do sistema, ou ideia para mudar o sistema (o que exige programar). Cada ensinamento guarda para onde foi,
// então dá para desfazer tudo de uma vez. Puro: tipos, regras da caixa e o esquema da resposta da IA.
import type { GrupoCaixa, PerfilCaixa } from "./caixaEntrada"

export type AcaoRegra = "esconder" | "baixar" | "subir"
export type RegraCaixa = {
  id: string; descricao: string; acao: AcaoRegra; em: string
  tipo?: string | null; grupo?: GrupoCaixa | null; perfil?: PerfilCaixa | null; contem?: string | null; jid?: string | null
  ate?: string | null                      // vale até (null = sempre)
}
export type Destino = "regra_caixa" | "agente" | "ideia" | "assistente" | "mensagens" | "marketing"
export type Ensinamento = {
  id: string; texto: string; em: string; entendi: string; contexto?: string
  feitos: { destino: Destino; ref: string; resumo: string }[]   // ref: id da regra / da lição / da ideia
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()

type ItemRegra = { tipo: string; grupo?: GrupoCaixa; perfil?: PerfilCaixa; jid?: string | null; titulo?: string; sub?: string }
export function regraVale(r: RegraCaixa, i: ItemRegra, agora = Date.now()): boolean {
  if (r.ate && new Date(r.ate).getTime() < agora) return false
  if (r.tipo && r.tipo !== i.tipo) return false
  if (r.grupo && r.grupo !== i.grupo) return false
  if (r.perfil && r.perfil !== (i.perfil ?? "medio")) return false   // sem perfil conhecido conta como médio (igual à ordem)
  if (r.jid && r.jid !== i.jid) return false
  if (r.contem && !norm(`${i.titulo ?? ""} ${i.sub ?? ""}`).includes(norm(r.contem))) return false
  // Regra sem nenhum critério não vale (não esconde a caixa inteira)
  return !!(r.tipo || r.grupo || r.perfil || r.jid || r.contem)
}
// O que as regras fazem com um item: some, ou sobe/desce dentro do grupo
export function efeitoDasRegras(regras: RegraCaixa[] | undefined, i: ItemRegra, agora = Date.now()): { esconder: boolean; ajuste: number } {
  let esconder = false, ajuste = 0
  for (const r of regras ?? []) {
    if (!regraVale(r, i, agora)) continue
    if (r.acao === "esconder") esconder = true
    else ajuste += r.acao === "subir" ? 60 : -60
  }
  return { esconder, ajuste }
}

// Resposta da IA (saída estruturada)
export const ESQUEMA_APRENDIZ = {
  type: "object", additionalProperties: false, required: ["entendi", "acoes"],
  properties: {
    entendi: { type: "string", description: "Uma frase, em português, do que você entendeu (para o Felipe conferir)" },
    acoes: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["destino", "texto", "tema", "regra"],
        properties: {
          destino: { type: "string", enum: ["regra_caixa", "agente", "ideia", "assistente", "mensagens", "marketing"] },
          texto: { type: "string", description: "A lição reescrita clara e geral (ou a descrição da regra / da ideia)" },
          tema: { type: "string", enum: ["preco", "produto", "fornecedor", "prazo", "processo", "venda", "objecao", "recusa", "outro"] },
          regra: {
            anyOf: [{ type: "null" }, {
              type: "object", additionalProperties: false, required: ["acao", "tipo", "grupo", "perfil", "contem", "so_esta_pessoa", "dias"],
              properties: {
                acao: { type: "string", enum: ["esconder", "baixar", "subir"] },
                tipo: { anyOf: [{ type: "null" }, { type: "string" }] },
                grupo: { anyOf: [{ type: "null" }, { type: "string", enum: ["dinheiro", "vendas", "producao", "relacionamento", "digital"] }] },
                perfil: { anyOf: [{ type: "null" }, { type: "string", enum: ["icp", "oportunidade", "medio", "digital"] }] },
                contem: { anyOf: [{ type: "null" }, { type: "string" }] },
                so_esta_pessoa: { type: "boolean" },
                dias: { anyOf: [{ type: "null" }, { type: "integer" }] },
              },
            }],
          },
        },
      },
    },
  },
} as const
export type RespostaAprendiz = {
  entendi: string
  acoes: { destino: Destino; texto: string; tema: string; regra: null | { acao: AcaoRegra; tipo: string | null; grupo: GrupoCaixa | null; perfil: PerfilCaixa | null; contem: string | null; so_esta_pessoa: boolean; dias: number | null } }[]
}

// Os tipos de item que existem na caixa (para a IA montar a regra certa)
export const TIPOS_CAIXA = "aprovado (aprovou o orçamento), cobrancaVencida, pagamento (sinal não caiu), semCobranca (entregue sem cobrança), propostaPronta, promessa (você prometeu orçamento), orcar (esperando seu orçamento), grande (grande negócio), esperando, responder (cliente esperando resposta), travado (MQL sem orçamento), orcamentoVencendo, abriuProposta, proposta, atrasado (entrega atrasada), fornecedor, entregaProxima, semPrazo, conferir, retomar (sem resposta há dias), comoFicou, reposicao (cliente que costuma recomprar), avaliado, negociacao (negociação do digital), sistema"
