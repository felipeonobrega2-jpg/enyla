// Captador de parceiros: convida para o cadastro Parceiros ENYLA quem já presta serviço (fornecedores do WhatsApp,
// fornecedores de produção e contatos que você colar). Você escolhe e aprova; o envio é espaçado e dentro do limite
// do número; um lembrete só; link próprio por convite para medir abriu → cadastrou. Puro: listas, textos e regras.

export type StatusConvite = "fila" | "enviado" | "abriu" | "cadastrou" | "respondeu" | "sem_interesse" | "erro"
export type Convite = {
  id: string; jid: string; nome: string | null
  origem: "whatsapp" | "fornecedor" | "manual"
  status: StatusConvite
  texto: string
  criadoEm: string; enviadoEm?: string; abriuEm?: string; cadastrouEm?: string; respondeuEm?: string; lembreteEm?: string
  cadastroId?: string; erro?: string
}
export type Candidato = { jid: string; nome: string | null; origem: Convite["origem"]; relevante: boolean; motivo: string | null; ultimaConversa: string | null }

export const LINK_PARCEIROS = "https://app.enyla.com.br/parceiros"
export const linkConvite = (id: string) => `${LINK_PARCEIROS}?c=${encodeURIComponent(id)}`
export const DIAS_LEMBRETE = 4

export const TEMPLATE_PADRAO = `Oi{, nome}, tudo bem? Aqui é o Felipe, da ENYLA.

Estamos montando a nossa rede de parceiros para mandar pedido com mais frequência para quem já trabalha com embalagem e gráfica. Pensei em você.

Se fizer sentido, o cadastro leva uns 5 minutos e você coloca os serviços, a sua máquina e como cobra: {link}

Qualquer dúvida, me chama aqui.`
export const TEMPLATE_LEMBRETE = `Oi{, nome}! Conseguiu ver o cadastro de parceiros da ENYLA? É rapidinho: {link}`

// Quem parece prestar serviço gráfico (pelo nome e pelo que já conversaram)
const PALAVRAS: [RegExp, string][] = [
  [/gr[aá]fica|graf\b|impress|offset|digital print/i, "gráfica"], [/r[oó]tulo|etiqueta|adesivo/i, "rótulos e adesivos"],
  [/pap[eé]is|papel|paper|cart[aã]o|papel[aã]o|kraft/i, "papel"], [/corte|vinco|faca/i, "corte e vinco"], [/verniz|lamina[cç]|hot ?stamp|relevo/i, "acabamento"],
  [/colagem|coladeira|cartonagem|caixa|embalag/i, "embalagem"], [/transport|frete|entrega|motoboy/i, "transporte"], [/arte|design|cria[cç]/i, "arte"],
]
export function relevancia(textos: (string | null | undefined)[]): string | null {
  const t = textos.filter(Boolean).join(" ")
  return PALAVRAS.find(([re]) => re.test(t))?.[1] ?? null
}

const digitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "")
export const jidDoTelefone = (tel: string) => { const d = digitos(tel); return d.length >= 10 ? `55${d}@s.whatsapp.net` : null }

// Candidatos: fornecedores do WhatsApp e de produção, menos quem já se cadastrou ou já foi convidado
export function montarCandidatos(a: {
  conversas: { jid: string; nome: string | null; ultima_msg?: string | null; ultima_at?: string | null; textos?: string[] }[]
  fornecedores: { nome: string; telefone?: string | null; contato?: string | null }[]
  nomesDaCasa?: string[]   // fornecedores cadastrados (produção e financeiro): quem bate pelo nome é da casa
  cadastrosWhatsapp: string[]
  convites: Convite[]
}): Candidato[] {
  const cadastrados = new Set(a.cadastrosWhatsapp.map(digitos).filter(Boolean))
  const convidados = new Set(a.convites.map(c => c.jid))
  const vistos = new Set<string>()
  const casa = [...(a.nomesDaCasa ?? []), ...a.fornecedores.flatMap(f => [f.nome, f.contato ?? ""])].map(n => n.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")).filter(Boolean)
  const fora = (jid: string) => jid.includes("@g.us") || convidados.has(jid) || vistos.has(jid) || cadastrados.has(digitos(jid.split("@")[0]))
  const out: Candidato[] = []
  for (const f of a.fornecedores) {
    const jid = f.telefone ? jidDoTelefone(f.telefone) : null
    if (!jid || fora(jid)) continue
    vistos.add(jid)
    out.push({ jid, nome: f.nome, origem: "fornecedor", relevante: true, motivo: "fornecedor de produção", ultimaConversa: null })
  }
  for (const c of a.conversas) {
    if (fora(c.jid)) continue
    vistos.add(c.jid)
    const primeiroNome = (c.nome ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/\s+/)[0]
    const daCasa = primeiroNome.length >= 4 && casa.some(n => n.split(/\s+/).includes(primeiroNome))
    const motivo = daCasa ? "fornecedor da casa" : relevancia([c.nome]) ?? relevancia([c.ultima_msg, ...(c.textos ?? [])])
    out.push({ jid: c.jid, nome: c.nome, origem: "whatsapp", relevante: !!motivo, motivo, ultimaConversa: c.ultima_at ?? null })
  }
  return out.sort((x, y) => Number(y.relevante) - Number(x.relevante) || (y.ultimaConversa ?? "").localeCompare(x.ultimaConversa ?? ""))
}

// "Nome; telefone" (ou "Nome - telefone", "telefone") por linha
export function lerListaManual(texto: string): { nome: string | null; jid: string }[] {
  return texto.split(/\n+/).map(l => l.trim()).filter(Boolean).flatMap(l => {
    const tel = l.match(/(\+?\(?\d[\d\s().-]{8,}\d)/)?.[1]
    const jid = tel ? jidDoTelefone(tel) : null
    if (!jid) return []
    const nome = l.replace(tel!, "").replace(/[;,|–—()-]+/g, " ").replace(/\s+/g, " ").trim() || null
    return [{ nome, jid }]
  })
}

// Texto final: {nome} com vírgula só quando há nome de pessoa; {link} do convite
export function textoConvite(template: string, nome: string | null, link: string) {
  return template.replace(/\{,\s*nome\}/g, nome ? `, ${nome}` : "").replace(/\{nome\}/g, nome ?? "").replace(/\{link\}/g, link).trim()
}

// Lembrete: um só, DIAS_LEMBRETE dias depois, para quem recebeu e não abriu nem respondeu
export const precisaLembrete = (c: Convite, agora = Date.now()) =>
  c.status === "enviado" && !c.lembreteEm && !!c.enviadoEm && agora - new Date(c.enviadoEm).getTime() >= DIAS_LEMBRETE * 86_400_000

export function funil(convites: Convite[]) {
  const enviados = convites.filter(c => c.status !== "fila" && c.status !== "erro")
  return {
    naFila: convites.filter(c => c.status === "fila").length,
    enviados: enviados.length,
    abriram: enviados.filter(c => c.abriuEm || c.status === "cadastrou").length,
    cadastraram: enviados.filter(c => c.status === "cadastrou").length,
    responderam: enviados.filter(c => c.respondeuEm).length,
  }
}
