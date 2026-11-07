// "Depende de você": o que o sistema não consegue fazer sozinho (conta externa, chave, arquivo, decisão).
// Cada item se confere sozinho quando dá (chave na Vercel, número cadastrado, saldo); o resto você marca como feito.
// Puro: o servidor junta os sinais.

export type Sinais = {
  env: { asaas: boolean; pluggy: boolean; lalamoveProducao: boolean; cronSecret: boolean }
  pluggyItens: number
  metaSaldo: number | null; metaDiasRestantes: number | null
  metaTokenExpira: string | null; metaTokenTipo: string | null
  iaRecargaEm: string | null; iaDiasRestantes: number | null
  designer: boolean; villa: boolean
  videos: number
  feitos: Record<string, string>     // marcados à mão como feitos
}
export type Pendencia = { id: string; grupo: "Dinheiro parado" | "Braço digital" | "Integrações" | "Conteúdo"; titulo: string; porque: string; como: string; nivel: "urgente" | "importante" | "quando der"; feito: boolean; manual: boolean; onde?: string }

const dias = (iso: string | null, agora: number) => iso ? (new Date(iso).getTime() - agora) / 86_400_000 : null

export function pendencias(s: Sinais, agora = Date.now()): Pendencia[] {
  const tok = dias(s.metaTokenExpira, agora)
  const m = (id: string) => !!s.feitos[id]
  const lista: Pendencia[] = [
    { id: "meta-saldo", grupo: "Dinheiro parado", titulo: "Recarregar a conta de anúncios", nivel: (s.metaSaldo ?? 0) < 20 ? "urgente" : "importante",
      porque: s.metaSaldo == null ? "Não consegui ler o saldo da conta." : `Saldo de R$ ${s.metaSaldo.toFixed(2).replace(".", ",")}${s.metaDiasRestantes != null ? `, dá para ~${s.metaDiasRestantes.toFixed(1).replace(".", ",")} dias` : ""}. Sem saldo, o anúncio para e os leads param de chegar.`,
      como: "Gerenciador de Anúncios → Cobrança → Adicionar fundos (Pix).", feito: s.metaSaldo != null && (s.metaDiasRestantes ?? 99) >= 5, manual: false, onde: "gastos" },
    { id: "ia-saldo", grupo: "Dinheiro parado", titulo: "Saldo da IA (Anthropic) em dia", nivel: (s.iaDiasRestantes ?? 99) < 2 ? "urgente" : "importante",
      porque: !s.iaRecargaEm ? "Você ainda não informou quanto tem de crédito: sem isso não dá para avisar antes de acabar." : `Dá para ~${(s.iaDiasRestantes ?? 0).toFixed(1).replace(".", ",")} dias no ritmo atual.`,
      como: "console.anthropic.com → Billing → Add credits; depois informe o saldo na página Gastos.", feito: !!s.iaRecargaEm && (s.iaDiasRestantes ?? 99) >= 5, manual: false, onde: "gastos" },
    { id: "meta-token", grupo: "Integrações", titulo: "Token permanente da Meta", nivel: tok != null && tok < 21 ? "urgente" : "quando der",
      porque: tok == null ? "Sem data de validade do token." : s.metaTokenTipo === "sistema" || tok > 3650 ? "Token permanente ativo." : `O token atual vence em ${Math.max(0, Math.floor(tok))} dias (${new Date(s.metaTokenExpira!).toLocaleDateString("pt-BR")}). Vencido, a página Campanhas e o relatório param.`,
      como: "Passar a conta de anúncios para o portfólio do Business Manager, atribuir ao usuário do sistema e colar o token “Nunca expira” em Campanhas.", feito: s.metaTokenTipo === "sistema" || (tok != null && tok > 3650), manual: false, onde: "meta" },

    { id: "designer", grupo: "Braço digital", titulo: "Cadastrar a designer", nivel: "urgente",
      porque: "Sem ela, todo briefing de pedido pago cai para você: o digital não fica 100% sozinho.", como: "Digital → Contatos do digital → WhatsApp da designer. Ela recebe o briefing e um link para subir a arte.", feito: s.designer, manual: false, onde: "digital" },
    { id: "villa", grupo: "Braço digital", titulo: "Cadastrar o WhatsApp do Leandro (Villa)", nivel: "importante",
      porque: "Arte aprovada vai sozinha para a Villa com medidas, folha e laminação. Sem o número, chega para você encaminhar.", como: "Digital → Contatos do digital → WhatsApp do Leandro.", feito: s.villa, manual: false, onde: "digital" },
    { id: "precos-villa", grupo: "Braço digital", titulo: "Preços da Villa: A4 acima de 100 e A3 de 100 a 300", nivel: "importante",
      porque: "Hoje A4 acima de 100 cota pela tabela A3 (mais cara, para não cobrar menos) e A3 de 100 a 300 não tem preço: o lead fica com você.", como: "Pedir a tabela ao Leandro e me mandar aqui.", feito: m("precos-villa"), manual: true },
    { id: "asaas", grupo: "Integrações", titulo: "Conta Asaas (cobrança automática)", nivel: "quando der",
      porque: "Com o Asaas, o Pix do sinal confirma na hora (webhook) em vez de esperar o extrato, e dá para cobrar cartão e boleto.", como: "Abrir a conta PJ no Asaas, gerar a chave da API e colar na Vercel como ASAAS_API_KEY (eu ligo o resto).", feito: s.env.asaas, manual: false },
    { id: "pluggy", grupo: "Integrações", titulo: "Banco conectado (Pluggy)", nivel: "importante",
      porque: "É pelo extrato que o sinal e o restante do digital são confirmados sozinhos.", como: "Financeiro → Banco → colar o Item ID do Meu Pluggy.", feito: s.env.pluggy && s.pluggyItens > 0, manual: false, onde: "financeiro" },
    { id: "lalamove", grupo: "Integrações", titulo: "Lalamove em produção", nivel: "quando der",
      porque: "A página Entregas ainda chama motorista no sandbox (de teste).", como: "Na Vercel: LALAMOVE_AMBIENTE=producao com as chaves de produção do Partner.", feito: s.env.lalamoveProducao, manual: false, onde: "entregas" },
    { id: "cron", grupo: "Integrações", titulo: "CRON_SECRET na Vercel", nivel: "quando der",
      porque: "As rotinas diárias aceitam hoje o cabeçalho do cron da Vercel; com o segredo ficam fechadas para qualquer outro.", como: "Vercel → Settings → Environment Variables → CRON_SECRET (um texto longo qualquer).", feito: s.env.cronSecret, manual: false },
    { id: "email", grupo: "Integrações", titulo: "E-mail no domínio enyla.com.br", nivel: "quando der",
      porque: "Proposta e avisos saindo de @enyla.com.br passam mais confiança e não caem no spam.", como: "Decidir o provedor (Google Workspace ou Zoho) e me passar o acesso ao DNS.", feito: m("email"), manual: true },

    { id: "videos", grupo: "Conteúdo", titulo: "Vídeos e fotos de produção para o agente", nivel: "importante",
      porque: s.videos ? `${s.videos} na biblioteca.` : "O follow-up com vídeo de produção é o que mais traz lead de volta, e a biblioteca está vazia.",
      como: "Configurações → Agentes → Biblioteca de mídia: suba de 3 a 6 vídeos curtos (até 16 MB) e fotos de caixas prontas, com uma linha dizendo o que é.", feito: s.videos >= 3, manual: false },
    { id: "etiquetas-wa", grupo: "Conteúdo", titulo: "Etiquetas no WhatsApp Business", nivel: "quando der",
      porque: "Com as etiquetas criadas no app, o agente marca MQL, Digital, F1… também no seu celular.", como: "No app: Ferramentas comerciais → Etiquetas, com os nomes exatos; depois Configurações → Agentes → Etiquetar no WhatsApp.", feito: m("etiquetas-wa"), manual: true },
  ]
  const ordem = { urgente: 0, importante: 1, "quando der": 2 }
  return lista.sort((a, b) => Number(a.feito) - Number(b.feito) || ordem[a.nivel] - ordem[b.nivel])
}
