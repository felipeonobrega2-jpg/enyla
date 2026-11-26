// Rascunho de cadastro de parceiro montado pela conversa do WhatsApp (modo parceiro do Atendente, issue #252).
// Puro: esquema da extração, mescla com o rascunho anterior e a lista do que falta. A IA só preenche o que a gráfica
// disse; quem aprova é o Felipe (mudarStatus). Usa os mesmos campos e a mesma validação do formulário /parceiros.
import { errosDoCadastro, limparCadastro, nomeServico, SERVICOS_PARCEIRO, FORMAS_COBRANCA, GERENTE_PADRAO, type CadastroParceiro, type ServicoCadastrado, type IdServicoParceiro } from "./parceiros"

const nul = (t: object) => ({ anyOf: [t, { type: "null" }] })
const TXT = nul({ type: "string" }), NUM = nul({ type: "number" })

/** Só o que a gráfica escreveu ou mostrou (texto, imagem ou PDF). Tudo é opcional: null = ela não disse. */
export const ESQUEMA_EXTRACAO = {
  type: "object", additionalProperties: false,
  required: ["responsavel", "email", "documento", "cep", "rua", "numero", "bairro", "cidade", "uf", "servicos"],
  properties: {
    responsavel: TXT, email: TXT, documento: TXT, cep: TXT, rua: TXT, numero: TXT, bairro: TXT, cidade: TXT, uf: TXT,
    servicos: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["id", "qual", "cobranca", "valor", "acerto", "prazoDias", "prazoVaria", "formatoL", "formatoA", "obs"],
        properties: {
          id: { type: "string", enum: SERVICOS_PARCEIRO.map(s => s.id) },
          qual: TXT,
          cobranca: nul({ type: "string", enum: FORMAS_COBRANCA.map(f => f.id) }),
          valor: NUM, acerto: NUM, prazoDias: NUM,
          prazoVaria: nul({ type: "boolean" }),
          formatoL: NUM, formatoA: NUM, obs: TXT,
        },
      },
    },
  },
} as const

export type Extraido = {
  responsavel?: string | null; email?: string | null; documento?: string | null; cep?: string | null; rua?: string | null
  numero?: string | null; bairro?: string | null; cidade?: string | null; uf?: string | null
  servicos?: { id: IdServicoParceiro; qual?: string | null; cobranca?: ServicoCadastrado["cobranca"]; valor?: number | null; acerto?: number | null
    prazoDias?: number | null; prazoVaria?: boolean | null; formatoL?: number | null; formatoA?: number | null; obs?: string | null }[]
}

const CAMPOS_TEXTO = ["responsavel", "email", "documento", "cep", "rua", "numero", "bairro", "cidade", "uf"] as const
const preenchido = (v: unknown) => v != null && v !== "" && !(typeof v === "number" && !(v > 0))

export const temDado = (x: Extraido | null | undefined) => !!x && (!!x.servicos?.length || CAMPOS_TEXTO.some(k => preenchido(x[k])))

/** Base do rascunho com o que já se sabe do prospecto (nome e WhatsApp da conversa). */
export type BaseProspecto = { nome: string; razaoSocial?: string | null; whatsapp: string; cnpj?: string | null }

/** O que já existe vale até a gráfica dizer outra coisa: valor novo e preenchido substitui, o resto fica. */
export function mesclarRascunho(atual: Partial<CadastroParceiro> | null, novo: Extraido, base: BaseProspecto): Omit<CadastroParceiro, "id" | "em" | "status" | "gerente" | "arquivos" | "base"> {
  const a = atual ?? {}
  const servicos = new Map<string, Partial<ServicoCadastrado> & { id: IdServicoParceiro }>((a.servicos ?? []).map(s => [s.id === "outro" ? `outro:${s.qual ?? ""}` : s.id, { ...s }]))
  for (const n of novo.servicos ?? []) {
    const chave = n.id === "outro" ? `outro:${n.qual ?? ""}` : n.id
    const velho = servicos.get(chave) ?? { id: n.id, cobranca: null, prazoDias: null, prazoVaria: false }
    const f = Number(n.formatoL) > 0 && Number(n.formatoA) > 0 ? { l: Number(n.formatoL), a: Number(n.formatoA) } : null
    servicos.set(chave, {
      ...velho,
      ...(n.id === "outro" && n.qual ? { qual: n.qual } : {}),
      ...(n.cobranca ? { cobranca: n.cobranca } : {}),
      ...(preenchido(n.valor) ? { valor: n.valor } : {}), ...(preenchido(n.acerto) ? { acerto: n.acerto } : {}),
      ...(preenchido(n.prazoDias) ? { prazoDias: n.prazoDias, prazoVaria: false } : n.prazoVaria ? { prazoVaria: true } : {}),
      ...(f ? { tecnico: { ...(velho.tecnico ?? {}), formatoMax: f } } : {}),
      ...(n.obs ? { obs: [velho.obs, n.obs].filter(Boolean).join(" · ").slice(0, 600) } : {}),
    })
  }
  const texto: Partial<CadastroParceiro> = {}
  for (const k of CAMPOS_TEXTO) (texto as Record<string, unknown>)[k] = preenchido(novo[k]) ? novo[k] : (a as Record<string, unknown>)[k]
  return limparCadastro({
    ...a, ...texto,
    nomeFantasia: a.nomeFantasia || base.nome, razaoSocial: a.razaoSocial || base.razaoSocial || undefined,
    whatsapp: a.whatsapp || base.whatsapp, tipoDocumento: "cnpj", documento: texto.documento || base.cnpj || "",
    servicos: [...servicos.values()] as ServicoCadastrado[],
  })
}

const ROTULO_CAMPO: Record<string, string> = {
  nomeFantasia: "nome da empresa", documento: "CNPJ", cep: "CEP", rua: "rua", numero: "número", bairro: "bairro", cidade: "cidade", uf: "UF",
  responsavel: "nome de quem responde pela produção", whatsapp: "WhatsApp", email: "e-mail", servicos: "quais serviços a gráfica faz",
}
const ROTULO_SERVICO: Record<string, string> = { formatoMax: "formato máximo da máquina (cm)", acerto: "valor do acerto", valor: "valor do milheiro", prazo: "prazo médio em dias úteis", cobranca: "como cobra", qual: "qual é o serviço" }

/**
 * O que ainda falta, na ordem em que vale perguntar: serviços, preço e prazo primeiro. Mesma validação do formulário, menos
 * o aceite (só quem preenche o formulário concorda ali) e os preços dos cenários-exemplo (o Felipe pede na análise).
 */
export function faltaDoRascunho(c: Partial<CadastroParceiro>): string[] {
  const erros = Object.keys(errosDoCadastro(c)).filter(k => k !== "aceite" && !k.includes(".preco."))
  const nomes = new Map((c.servicos ?? []).map(s => [s.id, nomeServico(s)]))
  const rotulo = (k: string) => {
    const [id, campo] = k.split(".")
    return campo ? `${ROTULO_SERVICO[campo] ?? campo} (${nomes.get(id as IdServicoParceiro) ?? id})` : ROTULO_CAMPO[k] ?? k
  }
  const peso = (k: string) => (k === "servicos" ? 0 : k.includes(".") ? 1 : 2)
  return erros.sort((a, b) => peso(a) - peso(b)).map(rotulo)
}

/** O que a IA vê do rascunho (sem R$, para a resposta não repetir valor). */
export function resumoDoRascunho(c: Partial<CadastroParceiro>): string {
  const s = (c.servicos ?? []).map(x => `${nomeServico(x)}${x.valor ? ", milheiro informado" : ""}${x.acerto ? ", acerto informado" : ""}${x.prazoDias ? `, prazo ${x.prazoDias} dias úteis` : x.prazoVaria ? ", prazo varia" : ""}`)
  return s.length ? s.join("; ") : "nada ainda"
}

export function novoRascunho(dados: Omit<CadastroParceiro, "id" | "em" | "status" | "gerente" | "arquivos" | "base">, a: { id: string; prospectoId: number; arquivos: CadastroParceiro["arquivos"]; faltando: string[]; em: string }): CadastroParceiro {
  return { ...dados, id: a.id, em: a.em, status: "novo", gerente: GERENTE_PADRAO, arquivos: a.arquivos, base: null, origem: "prospector", prospectoId: a.prospectoId, faltando: a.faltando }
}

/** Aplica o rascunho na lista: um por prospecto (sem duplicar). Cadastro já aprovado ou recusado não é mexido. */
export function aplicarRascunho(lista: CadastroParceiro[], r: CadastroParceiro): CadastroParceiro[] {
  const i = lista.findIndex(x => x.origem === "prospector" && x.prospectoId === r.prospectoId && x.status === "novo")
  if (i < 0) return [r, ...lista].slice(0, 500)
  const velho = lista[i]
  const arquivos = [...velho.arquivos, ...r.arquivos.filter(a => !velho.arquivos.some(v => v.nome === a.nome))].slice(0, 20)
  return lista.map((x, j) => j === i ? { ...velho, ...r, id: velho.id, em: velho.em, status: velho.status, gerente: velho.gerente, base: velho.base, emails: velho.emails, arquivos } : x)
}

export const rascunhoDoProspecto = (lista: CadastroParceiro[] | undefined, prospectoId: number) =>
  (lista ?? []).find(x => x.origem === "prospector" && x.prospectoId === prospectoId && x.status === "novo") ?? null
