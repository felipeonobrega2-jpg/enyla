// Agendador único (Organizar 2): todas as rotinas automáticas do sistema num lugar só, com quando rodaram pela
// última vez e o que aconteceu. Cada rotina marca a própria execução na tabela leve ("agenda|<rotina>|<resultado>";
// a hora é a coluna em). A tela do Escritório lê e avisa o que parou. Feito depois de 20/11, quando o follow-up e a
// retomada pararam sem ninguém ver (morriam dentro da carona do webhook).

export type Rotina = {
  id: string; nome: string; faz: string
  onde: "vigia" | "carona" | "servidor" | "vercel"
  quando: string                 // texto para a tela
  esperadoMin: number | null     // de quanto em quanto tempo deveria rodar (null = não dá para conferir daqui)
  horarioDoAgente?: boolean      // só roda no horário do agente (fora dele, "fora do horário" é normal)
}

export const ROTINAS: Rotina[] = [
  { id: "vigia", nome: "Vigia do sistema", faz: "Fila de quem ficou sem resposta, promessas, e-mails, digital no Financeiro", onde: "servidor", quando: "a cada 5 min", esperadoMin: 5 },
  { id: "followup", nome: "Follow-up do agente", faz: "Retoma quem parou de responder (F1, F2, F3)", onde: "vigia", quando: "a cada 10 min, no horário do agente", esperadoMin: 10, horarioDoAgente: true },
  { id: "retomada", nome: "Retomada", faz: "Lead que escreveu e ficou sem resposta enquanto você estava na conversa", onde: "vigia", quando: "a cada 3 min, no horário do agente", esperadoMin: 3, horarioDoAgente: true },
  { id: "esperando", nome: "Ninguém sem resposta", faz: "Quem escreveu há 20+ min recebe resposta (bons negócios primeiro)", onde: "vigia", quando: "a cada 5 min", esperadoMin: 5, horarioDoAgente: true },
  { id: "promessas", nome: "Cobrador de promessas", faz: "Orçamento prometido e não enviado vai para a sua caixa", onde: "vigia", quando: "a cada 5 min", esperadoMin: 5 },
  { id: "resumo", nome: "Resumo no seu WhatsApp", faz: "Caixa de entrada às 8h, 13h e 18h", onde: "vigia", quando: "8h, 13h e 18h (seg a sáb)", esperadoMin: null },
  { id: "reuniao", nome: "Reunião de diretoria", faz: "Os 5 diretores leem a área e o que você ensinou; a ata vai para o seu WhatsApp", onde: "vigia", quando: "8h (seg a sáb)", esperadoMin: null },
  { id: "auditoria", nome: "Auditor de dados", faz: "Confere se os números do Financeiro e dos pedidos batem", onde: "vigia", quando: "1 vez por dia, de madrugada", esperadoMin: 26 * 60 },
  { id: "digitalFinanceiro", nome: "Digital no Financeiro", faz: "Sinal, restante e custo da Villa viram lançamentos da linha Digital", onde: "vigia", quando: "a cada 5 min", esperadoMin: 5 },
  { id: "registroFelipe", nome: "Registro do Felipe", faz: "Guarda o que o Felipe digita no WhatsApp, escreve no GitHub e diz aos diretores (só leitura)", onde: "vigia", quando: "a cada 5 min (GitHub a cada 15)", esperadoMin: 5 },
  { id: "emails", nome: "E-mails do cliente", faz: "Pedido aprovado, sinal, arte, enviado", onde: "vigia", quando: "a cada 5 min", esperadoMin: 5 },
  { id: "carona", nome: "Tarefas de carona", faz: "Aprendizado, reativação, marketing, Pix do digital, saldo da Meta… (rodam junto das mensagens)", onde: "carona", quando: "a cada 5 min quando chega mensagem", esperadoMin: 60, horarioDoAgente: true },
  { id: "aprendizado", nome: "Aprendizado do agente", faz: "Lê as suas conversas e ensina o atendente", onde: "carona", quando: "a cada 6 h", esperadoMin: 6 * 60 + 30 },
  { id: "relatorioSemanal", nome: "Relatório semanal", faz: "PDF gerencial no seu e-mail", onde: "servidor", quando: "segunda, 8h", esperadoMin: 7 * 24 * 60 + 60 },
  { id: "metaToken", nome: "Token da Meta", faz: "Renova o acesso aos anúncios", onde: "vercel", quando: "todo dia, 8h", esperadoMin: 25 * 60 },
  { id: "whatsappVigia", nome: "Vigia do WhatsApp", faz: "Religa o WhatsApp se cair e avisa no celular", onde: "servidor", quando: "a cada 2 min", esperadoMin: null },
  { id: "siteVigia", nome: "Vigia do site", faz: "Avisa se o sistema sair do ar", onde: "servidor", quando: "a cada 2 min", esperadoMin: null },
]

export const PREFIXO_AGENDA = "agenda|"
export type Execucao = { rotina: string; em: string; resultado: string }

export function lerExecucao(id: string, em: string): Execucao | null {
  if (!id.startsWith(PREFIXO_AGENDA)) return null
  const [, rotina, ...resto] = id.split("|")
  let resultado = resto.join("|")
  try { resultado = decodeURIComponent(resultado) } catch { /* fica como veio */ }
  return rotina ? { rotina, em, resultado } : null
}
export const ehErro = (r: string) => /^erro|error|timeout|falhou/i.test(r)

// Situação de uma rotina agora: em dia, atrasada (passou de 3× o intervalo esperado), com erro ou sem registro
export function situacaoRotina(r: Rotina, ex: Execucao | undefined, agora = Date.now(), noHorario = true): { tom: "ok" | "atrasada" | "erro" | "sem"; texto: string } {
  if (!ex) return { tom: r.esperadoMin == null ? "ok" : "sem", texto: r.esperadoMin == null ? "roda no servidor (sem registro aqui)" : "ainda sem registro" }
  if (ehErro(ex.resultado)) return { tom: "erro", texto: ex.resultado }
  if (r.esperadoMin != null && (noHorario || !r.horarioDoAgente) && agora - new Date(ex.em).getTime() > r.esperadoMin * 3 * 60_000)
    return { tom: "atrasada", texto: `parada há ${tempo(agora - new Date(ex.em).getTime())}` }
  return { tom: "ok", texto: ex.resultado }
}
export function tempo(ms: number): string {
  const m = Math.round(ms / 60_000)
  return m < 60 ? `${Math.max(1, m)} min` : m < 48 * 60 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} dias`
}

// Servidor: marca a execução (a anterior da mesma rotina sai)
export async function marcarRotina(rotina: string, resultado: unknown): Promise<void> {
  const { supabase } = await import("./supabase")
  const texto = typeof resultado === "string" ? resultado : resultado == null ? "ok" : JSON.stringify(resultado)
  const id = `${PREFIXO_AGENDA}${rotina}|${encodeURIComponent(texto.slice(0, 160))}`
  await supabase.from("agente_tratadas").delete().like("id", `${PREFIXO_AGENDA}${rotina}|%`)
  await supabase.from("agente_tratadas").insert({ id })
}

export async function lerExecucoes(): Promise<Record<string, Execucao>> {
  const { supabase } = await import("./supabase")
  const { data } = await supabase.from("agente_tratadas").select("id, em").like("id", `${PREFIXO_AGENDA}%`).limit(200)
  const out: Record<string, Execucao> = {}
  for (const r of data ?? []) { const e = lerExecucao(r.id as string, r.em as string); if (e && (!out[e.rotina] || e.em > out[e.rotina].em)) out[e.rotina] = e }
  return out
}
