// Ideias que o sistema (ou o Claude, a pedido seu) põe no seu banco de ideias. Entra uma vez por lote (marca no
// servidor) e nunca duplica: o que você já apagou ou marcou não volta.
import { mudarConfig } from "./configAtomica"
import type { Ideia, GastoFixo } from "../config"

const LOTES: { v: number; ideias: string[] }[] = [
  { v: 1, ideias: [
    "Marketing: atribuição dos leads do WhatsApp. Com uma campanha só gastando, o lead já conta para ela no relatório. Com duas ou mais, mandar o anúncio com mensagem pronta diferente por campanha (ou um parâmetro no link) para cada lead cair na campanha certa.",
    "Marketing: 120 dos 191 leads da semana não disseram o volume. Testar no anúncio a mensagem pronta já com a quantidade (\"Quero orçamento de ___ caixinhas\") ou botões de quantidade (até 500 / 1.000 a 5.000 / 5.000+).",
    "Marketing: o F1 de quem não disse o volume pergunta direto a quantidade, com faixas para responder com um toque.",
    "Marketing: manter a verba da campanha TESTAR NOVAMENTE até ter uns 7 dias de dado limpo (custo por MQL caiu de R$ 43,94 para R$ 16,42, mas a semana anterior teve só 2 MQL).",
    "Marketing: dos 28 MQL da semana, 5 viraram orçamento. Ver por que os outros 23 não viraram (o Hoje já mostra \"Orçamento para fazer\"); meta de orçar todo MQL em até 24 h.",
    "Robustez: teste A/B de mensagens (abertura e F2). O agente alterna duas versões e fica com a de maior taxa de resposta.",
    "Robustez: alarme de queda. Taxa de resposta ou número de leads caindo 30% de um dia para o outro, anúncio parado ou WhatsApp desconectado viram aviso no seu WhatsApp.",
    "Robustez: vigia do WhatsApp. Mais de 10 min sem mensagem chegando no horário comercial: confere a conexão da Evolution e avisa.",
    "Robustez: revisão semanal das conversas que esfriaram. A IA aponta onde o agente errou e você aprova as correções na base de conhecimento.",
    "Robustez: backup diário da configuração crítica (pedidos digitais, aprendizado, guia, contatos) com histórico para voltar atrás.",
    "Digital: Asaas para o Pix confirmar na hora (webhook) e abrir cartão parcelado no sinal e no restante.",
    "Digital: recompra automática. 45 dias depois da entrega, o agente oferece repetir o pedido com a mesma arte e o mesmo preço.",
  ] },
  { v: 2, ideias: [
    "Robustez (prioridade): proteger o sistema. Cópia diária da configuração (preços, contatos, conhecimento da IA, próximos passos, pedidos digitais) guardando 30 dias, com botão \"voltar para ontem\" em Configurações. E aviso no seu WhatsApp quando algo para: WhatsApp 2 h sem receber mensagem no horário comercial, Asaas recusando o aviso de pagamento ou envio automático falhando.",
  ] },
  { v: 3, ideias: [
    "Robustez (prioridade): aviso de servidor do WhatsApp fora do ar. Em 10/11 a Railway (onde roda a Evolution) tirou o servidor do ar quando o teste grátis acabou e os leads ficaram 2 h sem resposta. Checar a Evolution a cada 5 min e, se não responder ou o número desconectar, avisar no seu e-mail e no WhatsApp pessoal (por fora da Evolution). E lembrete 3 dias antes do vencimento do plano da Railway (dia 10).",
  ] },
]

// Gastos fixos que o sistema põe uma vez (marca no servidor); apagou ou editou, não volta
const GASTOS_FIXOS: { v: number; gastos: GastoFixo[] }[] = [
  { v: 1, gastos: [
    { id: "sis-railway", nome: "Railway (servidor do WhatsApp)", categoriaId: "assinaturas", valor: 30, diaVencimento: 10, ativa: true,
      obs: "Plano Hobby, US$ 5/mês no cartão (valor em reais aproximado, com IOF). Roda a Evolution, que liga o WhatsApp ao sistema: se a cobrança falhar, o agente para de responder." },
  ] },
]

export async function talvezAdicionarIdeias() {
  const ultimo = LOTES.at(-1)!.v
  await mudarConfig((d: Record<string, unknown> & { ideias?: Ideia[]; ideiasDoSistemaV?: number }) => {
    const v = d.ideiasDoSistemaV ?? 0
    if (v >= ultimo) return null
    const ja = new Set((d.ideias ?? []).map(i => i.texto))
    const agora = new Date().toISOString()
    const novas: Ideia[] = LOTES.filter(l => l.v > v).flatMap(l => l.ideias.filter(t => !ja.has(t)).map((texto, i) => ({ id: `sis-${l.v}-${i}`, texto, status: "ideia" as const, criadaEm: agora })))
    return { ideias: [...novas, ...(d.ideias ?? [])], ideiasDoSistemaV: ultimo }
  })
}

export async function talvezAdicionarGastosFixos() {
  const ultimo = GASTOS_FIXOS.at(-1)!.v
  await mudarConfig((d: Record<string, unknown> & { gastosFixos?: GastoFixo[]; gastosFixosDoSistemaV?: number; gastosFixosDoSistemaEm?: string }) => {
    const v = d.gastosFixosDoSistemaV ?? 0
    if (v >= ultimo) return null
    const ja = new Set((d.gastosFixos ?? []).map(g => g.id))
    const novos = GASTOS_FIXOS.filter(l => l.v > v).flatMap(l => l.gastos.filter(g => !ja.has(g.id)))
    return { gastosFixos: [...(d.gastosFixos ?? []), ...novos], gastosFixosDoSistemaV: ultimo, gastosFixosDoSistemaEm: new Date().toISOString() }
  })
}
