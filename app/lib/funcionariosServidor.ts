// Funcionários que executam as ordens da diretoria. O diretor decide o quê; o funcionário qualificado escreve a mensagem
// com o histórico real da conversa do cliente, o jeito da ENYLA (base de conhecimento) e a cultura da companhia.
// Só redige: o envio acontece depois do "Aprovo" do Felipe (lib/enviarCliente). Só roda no servidor.
import { supabase } from "./supabase"
import { clienteClaude, MODELO } from "./claude"
import { destinoDoCliente } from "./enviarCliente"
import { chaveTelefone } from "./vinculoWhatsapp"
import { conhecimentoNoPrompt, type Conhecimento } from "./agenteLeads"
import { FUNCIONARIOS, type IdFuncionario } from "./diretoria"

const ESQUEMA = {
  type: "object", additionalProperties: false, required: ["texto"],
  properties: { texto: { type: "string", description: "A mensagem de WhatsApp pronta para o cliente" } },
} as const

// Conversa do cliente (jid ligado, ou a conversa com o mesmo telefone do cadastro): últimas mensagens, da mais antiga à mais nova
async function historico(destino: string, jid: string | null): Promise<string> {
  let alvo = jid
  if (!alvo) {
    const chave = chaveTelefone(destino)
    if (chave) {
      const { data } = await supabase.from("whatsapp_conversas").select("jid, telefone, ultima_at").ilike("telefone", `%${chave.slice(-8)}%`).order("ultima_at", { ascending: false }).limit(5)
      alvo = (data ?? []).find(c => chaveTelefone(c.telefone) === chave)?.jid ?? null
    }
  }
  if (!alvo) return ""
  const { data } = await supabase.from("whatsapp_mensagens").select("from_me, corpo, ts").eq("jid", alvo).order("ts", { ascending: false }).limit(20)
  return (data ?? []).reverse().filter(m => m.corpo).map(m => `${m.from_me ? "ENYLA" : "Cliente"}: ${String(m.corpo).slice(0, 400)}`).join("\n")
}

export async function redigirComoFuncionario(a: {
  funcionario: IdFuncionario; cliente: string; ordem: string; apiKey: string
  conhecimento?: Conhecimento[]; cultura?: string[]
}): Promise<{ ok: true; texto: string } | { ok: false; erro: string }> {
  const f = FUNCIONARIOS.find(x => x.id === a.funcionario)
  if (!f) return { ok: false, erro: "Funcionário desconhecido" }
  const { destino, jid } = await destinoDoCliente(a.cliente)
  if (!destino) return { ok: false, erro: `${f.nome} não achou o WhatsApp de ${a.cliente} (sem telefone no cadastro e sem conversa ligada)` }
  const conversa = await historico(destino, jid).catch(() => "")
  const jeito = conhecimentoNoPrompt((a.conhecimento ?? []).filter(i => i.id.startsWith("felipe-")))
  try {
    const resp = await clienteClaude(a.apiKey).beta.messages.create({
      model: MODELO, max_tokens: 800,
      output_config: { effort: "low", format: { type: "json_schema", schema: ESQUEMA } },
      system: `Você é o funcionário de ${f.nome} da ENYLA (gráfica de embalagens). Sua qualificação: ${f.qualificacao}.
A diretoria decidiu uma ação e você executa: escreva a mensagem de WhatsApp para o cliente. O Felipe (CEO) lê antes de enviar.
Como escrever: empresa falando ("nós"), cordial, curta (2 a 4 frases), sem pressão. Use a conversa para acertar o tratamento (como o cliente é chamado, o assunto do pedido) e não repetir o que já foi dito. Nunca invente data, valor ou número de pedido que não esteja na ordem ou na conversa. Sem emoji em excesso (no máximo um). Português do Brasil.
${jeito ? `\nO jeito da ENYLA (ensinado pelo Felipe):\n${jeito}\n` : ""}${a.cultura?.length ? `\nCultura da companhia:\n${a.cultura.map(c => `- ${c}`).join("\n")}\n` : ""}`,
      messages: [{ role: "user", content: `Ordem da diretoria: ${a.ordem}\nCliente: ${a.cliente}\n\nConversa recente:\n${conversa || "(sem conversa registrada com este cliente)"}` }],
    })
    const texto = (JSON.parse(resp.content.flatMap(c => c.type === "text" ? [c.text] : []).join("")) as { texto: string }).texto?.trim()
    return texto ? { ok: true, texto } : { ok: false, erro: `${f.nome} não conseguiu escrever a mensagem` }
  } catch (e) {
    return { ok: false, erro: `${f.nome} não conseguiu escrever a mensagem (${String(e).slice(0, 120)})` }
  }
}
