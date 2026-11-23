// Agente de RH: recebe o pedido de contratação de um diretor e desenha a vaga (nome, qualificação) e o onboarding
// (conceitos da empresa, o que pode e o que não pode), com base na cultura, nas metas, no jeito da ENYLA e no que o
// diretor sabe. A contratação só vale depois do Felipe aprovar. Só roda no servidor.
import { lerCampos, mudarConfig } from "./configAtomica"
import { clienteClaude, MODELO } from "./claude"
import { DIRETORES, type IdBase, type IdDiretor, type LicaoDiretor } from "./diretoria"
import { quadro, type Funcionario } from "./rh"
import { conhecimentoNoPrompt, type Conhecimento } from "./agenteLeads"

export type PedidoContratacao = { cargo: string; funcao: string; motivo: string }

const ESQUEMA = {
  type: "object", additionalProperties: false,
  required: ["jaExiste", "nome", "qualificacao", "capacidade", "ferramentaQueFalta", "conceitos", "pode", "naoPode"],
  properties: {
    jaExiste: { type: "boolean", description: "true se um funcionário do quadro (contratado ou solicitado) já faz isso" },
    nome: { type: "string", description: "Nome do cargo, curto (ex.: Pós-venda, Cobrança, Reativação de clientes)" },
    qualificacao: { type: "string", description: "Uma frase: o que este funcionário faz" },
    capacidade: { type: "string", enum: ["mensagem_cliente", "sem_ferramenta"] },
    ferramentaQueFalta: { anyOf: [{ type: "null" }, { type: "string" }], description: "Se sem_ferramenta: o que o sistema precisa ganhar para ele trabalhar" },
    conceitos: { type: "array", items: { type: "string" }, description: "4 a 8 conceitos da empresa que ele precisa saber para a função" },
    pode: { type: "array", items: { type: "string" } },
    naoPode: { type: "array", items: { type: "string" } },
  },
} as const

export async function prepararVaga(pedido: PedidoContratacao, solicitadoPor: IdDiretor, op: { salvar?: boolean } = {}): Promise<{ ok: true; vaga: Funcionario } | { ok: false; erro: string }> {
  const cfg = await lerCampos<{ apiKey?: string; funcionarios?: Funcionario[]; conhecimentoDiretoria?: Partial<Record<IdBase, LicaoDiretor[]>>; conhecimentoAgente?: Conhecimento[] }>(["apiKey", "funcionarios", "conhecimentoDiretoria", "conhecimentoAgente"])
  if (!cfg.apiKey) return { ok: false, erro: "Sem chave da IA" }
  const q = quadro(cfg.funcionarios).filter(f => f.status !== "recusado")
  const base = cfg.conhecimentoDiretoria ?? {}
  const linhas = (k: IdBase) => (base[k] ?? []).slice(0, 30).map(l => `- ${l.texto}`).join("\n")
  const diretor = DIRETORES.find(d => d.id === solicitadoPor)!
  const jeito = conhecimentoNoPrompt((cfg.conhecimentoAgente ?? []).filter(i => i.id.startsWith("felipe-")))
  try {
    const resp = await clienteClaude(cfg.apiKey).beta.messages.create({
      model: MODELO, max_tokens: 2000,
      output_config: { effort: "low", format: { type: "json_schema", schema: ESQUEMA } },
      system: `Você é o RH da ENYLA (gráfica de embalagens; Offset com o Felipe, Digital 100% IA). Os funcionários são agentes de IA. Um diretor pediu uma contratação: desenhe a vaga e o onboarding para o funcionário executar a função do jeito que a empresa precisa.
Ferramentas que o sistema dá hoje a um funcionário: só escrever uma mensagem de WhatsApp para UM cliente, que o Felipe lê e aprova antes de enviar. Se a função precisa de outra coisa (mexer em anúncio, orçar, mandar para muitos de uma vez, mexer no financeiro), capacidade = "sem_ferramenta" e diga em ferramentaQueFalta o que o sistema precisa ganhar. Não esconda isso. Orçar o Offset é do Felipe por decisão dele (até terminar de treinar o agente de orçamentos): vaga para isso é sem_ferramenta, dizendo que depende desse treino.
Onboarding: conceitos da empresa que importam para a função (cultura, metas, jeito de falar, regras do diretor), o que ele pode e o que não pode. Concreto, curto, sem enrolação. Se o quadro já tem quem faça isso, jaExiste = true. Português do Brasil.`,
      messages: [{ role: "user", content: `Pedido do ${diretor.cargo} (${diretor.area}):
Cargo: ${pedido.cargo}
Função: ${pedido.funcao}
Por quê: ${pedido.motivo}

Quadro atual:
${q.map(f => `- ${f.nome} (${f.status}, ${f.setor.toUpperCase()}): ${f.qualificacao}`).join("\n")}

Metas:
${linhas("metas") || "- (não definidas)"}
Cultura:
${linhas("cultura") || "- (não definida)"}
O que o ${diretor.cargo} sabe:
${linhas(solicitadoPor) || "- (nada ainda)"}
${jeito ? `\nJeito da ENYLA com cliente:\n${jeito}` : ""}` }],
    })
    const r = JSON.parse(resp.content.flatMap(c => c.type === "text" ? [c.text] : []).join("")) as {
      jaExiste: boolean; nome: string; qualificacao: string; capacidade: Funcionario["capacidade"]; ferramentaQueFalta: string | null; conceitos: string[]; pode: string[]; naoPode: string[]
    }
    if (r.jaExiste) return { ok: false, erro: "O RH viu que o quadro já tem quem faça isso" }
    const vaga: Funcionario = {
      id: `f-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, nome: r.nome.trim(), setor: solicitadoPor, qualificacao: r.qualificacao.trim(),
      capacidade: r.capacidade, ferramentaQueFalta: r.capacidade === "sem_ferramenta" ? r.ferramentaQueFalta : null,
      onboarding: { conceitos: r.conceitos.slice(0, 10), pode: r.pode.slice(0, 8), naoPode: r.naoPode.slice(0, 8) },
      status: "solicitado", solicitadoPor, motivo: pedido.motivo, em: new Date().toISOString(), aprendizados: [],
    }
    if (op.salvar !== false) await mudarConfig((d: { funcionarios?: Funcionario[] }) => ({ funcionarios: [...(d.funcionarios ?? []), vaga] }))
    if (op.salvar !== false && vaga.capacidade === "sem_ferramenta" && vaga.ferramentaQueFalta) {
      const { pedirFerramenta } = await import("./diretoriaServidor")
      await pedirFerramenta({ nome: `Para a vaga ${vaga.nome}`, paraQue: vaga.ferramentaQueFalta, motivo: `O ${solicitadoPor.toUpperCase()} pediu a vaga ${vaga.nome}: ${pedido.motivo}`, pedidoPor: solicitadoPor }).catch(() => null)
    }
    return { ok: true, vaga }
  } catch (e) {
    return { ok: false, erro: `O RH não conseguiu preparar a vaga (${String(e).slice(0, 120)})` }
  }
}

// Contratar / recusar uma vaga; ensinar ou tirar um aprendizado de um funcionário (fixos inclusive)
export async function decidirVaga(id: string, acao: "contratar" | "recusar") {
  await mudarConfig((d: { funcionarios?: Funcionario[] }) => {
    const lista = d.funcionarios ?? []
    if (!lista.some(f => f.id === id && f.status === "solicitado")) return null
    return { funcionarios: lista.map(f => f.id === id ? { ...f, status: acao === "contratar" ? "contratado" as const : "recusado" as const, decididoEm: new Date().toISOString() } : f) }
  })
}

export async function mudarAprendizado(id: string, m: { texto?: string; tirar?: string }) {
  await mudarConfig((d: { funcionarios?: Funcionario[] }) => {
    const lista = d.funcionarios ?? []
    const atual = quadro(lista).find(f => f.id === id)
    if (!atual) return null
    const aprendizados = m.tirar ? atual.aprendizados.filter(l => l.id !== m.tirar)
      : [{ id: `${id}-${Date.now().toString(36)}`, texto: m.texto!.slice(0, 1500), em: new Date().toISOString() }, ...atual.aprendizados].slice(0, 200)
    const salvo = lista.some(f => f.id === id)
    return { funcionarios: salvo ? lista.map(f => f.id === id ? { ...f, aprendizados } : f) : [...lista, { ...atual, aprendizados }] }
  })
}
