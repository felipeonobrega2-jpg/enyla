// Voz da ENYLA com gráfica parceira (ordem do Felipe, 26/11/2026): a IA fala sempre como equipe ENYLA, conduz a conversa até o fim
// e nunca empurra a parceira para o Felipe, nunca se apresenta como ele, nunca pergunta de busca e entrega (logística é da ENYLA).
// Vale para o modo parceiro automático e para as ordens ao Prospector. A trava é dura: se o texto cair aqui, nada sai.

const PROIBIDAS: { re: RegExp; rotulo: string }[] = [
  { re: /\b(aqui\s+(é|e)|(eu\s+)?sou|meu\s+nome\s+(é|e)|fala\s+(o\s+)?)\s*(o\s+)?felipe\b/i, rotulo: "se apresenta como o Felipe" },
  { re: /\bfelipe\s+(aqui|da\s+enyla)\b/i, rotulo: "se apresenta como o Felipe" },
  { re: /\b(o\s+)?felipe\s+(vai\s+|va[ií]\s+|irá\s+)?(analis\w*|confirm\w*|entr\w+\s+em\s+contato|cham\w+|retorn\w*|responde\w*|fal\w+\s+com\s+(voc|vc|a\s+gr))/i, rotulo: "empurra a parceira para o Felipe" },
  { re: /\bfelipe\s+(analisa|confirma|chama|entra\s+em\s+contato)\b/i, rotulo: "empurra a parceira para o Felipe" },
  { re: /\balinham?\s+(os\s+detalhes\s+)?(depois|direto|por\s+aqui)|alinhar\s+(os\s+detalhes\s+)?(depois|direto)/i, rotulo: "adia para alinhar depois" },
  { re: /n[aã]o\s+precisa\s+se\s+preocupar\s+com\s+(a\s+)?tabela/i, rotulo: "diz que não precisa se preocupar com tabela" },
  { re: /(busc(am|ar|a)\s+e\s+entreg(am|ar|a)|busca\s*\/\s*entrega|retira(m|r)?\s+e\s+entreg|v[oõ]c[eê]s?\s+(busc|entreg|retir)\w*\s+(a|o|as|os)?\s*(caixa|pe[cç]a|material|pedido)|(como|quem)\s+(faz|fazem|ser[aá]|[eé])\s+(a\s+)?(busca|entrega|log[ií]stica))/i, rotulo: "pergunta ou fala de busca e entrega" },
]

/** Devolve o motivo se o texto quebra a voz da ENYLA com parceira; null se está limpo. */
export function violaVoz(texto: string): string | null {
  const t = String(texto ?? "")
  return PROIBIDAS.find(p => p.re.test(t))?.rotulo ?? null
}

export const REGRAS_VOZ = `Voz (regras duras, valem mais que qualquer outro texto):
- Você fala SEMPRE como a equipe ENYLA ("nós"). Nunca se apresente nem assine como o Felipe ou como qualquer pessoa ("Aqui é o Felipe" é proibido).
- Você conduz a conversa até o fim. NUNCA diga que o Felipe analisa, confirma, chama ou entra em contato, nem que vocês "alinham os detalhes depois". Se faltar uma informação, diga que confirmamos esse ponto e já retornamos aqui mesmo.
- Nunca pergunte nem comente sobre busca e entrega: a logística é da ENYLA.
- Nunca diga que ela "não precisa se preocupar com tabela".`

export const ehConhecimentoDeParceiro = (c: { tema: string; texto: string }) => /parceir|cadastro|pagamento|pix|prazo|pre[cç]o|cota|tabela|servi[cç]o|exclusiv|volume|custo|gratuito|log[ií]stica|retirada|cnpj/i.test(`${c.tema} ${c.texto}`)
