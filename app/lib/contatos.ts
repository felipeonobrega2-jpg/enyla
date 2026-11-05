// Contatos que valem dinheiro (MQL, ICP, oportunidade, clientes), guardados no sistema para não depender do
// número do WhatsApp: se o número for restrito, você baixa a lista e importa no celular ou em outro número.
// Aqui só as regras puras (quem é importante, telefone, arquivos .vcf e .csv); o servidor busca e grava.

export type ContatoImportante = {
  jid: string
  nome: string
  telefone: string | null
  motivos: string[]          // "MQL", "ICP", "Cliente: Raniere Pericles"…
  etiquetas: string[]
  ultima: string | null      // última conversa
}

export const ETIQUETAS_IMPORTANTES = ["MQL", "ICP", "Lead médio", "Oportunidade"]

// Telefone só com dígitos e DDI (Brasil quando vier com 10–11 dígitos)
export function normalizarTelefone(t: string | null | undefined): string | null {
  const d = (t ?? "").replace(/\D/g, "")
  if (d.length === 10 || d.length === 11) return "55" + d
  if (d.length >= 12 && d.length <= 15) return d
  return null
}

// Telefone da conversa: o gravado, ou o próprio jid quando é o formato antigo (número@s.whatsapp.net)
export const telefoneDaConversa = (c: { jid: string; telefone: string | null }) =>
  normalizarTelefone(c.telefone) ?? (c.jid.endsWith("@s.whatsapp.net") ? normalizarTelefone(c.jid.split("@")[0]) : null)

// Procura um número de telefone em qualquer resposta da Evolution (o campo muda entre versões)
export function telefoneNaResposta(x: unknown, prof = 0): string | null {
  if (prof > 5 || x == null) return null
  if (typeof x === "string") {
    const m = x.match(/^(\d{10,15})(?::\d+)?@s\.whatsapp\.net$/)
    return m ? normalizarTelefone(m[1]) : null
  }
  if (Array.isArray(x)) { for (const v of x) { const t = telefoneNaResposta(v, prof + 1); if (t) return t } return null }
  if (typeof x === "object") {
    for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
      if (/^(phone|phoneNumber|number|pn|senderPn)$/i.test(k) && typeof v === "string") { const t = normalizarTelefone(v); if (t) return t }
      const t = telefoneNaResposta(v, prof + 1)
      if (t) return t
    }
  }
  return null
}

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, " ")

// .vcf: importa direto no celular (só quem tem telefone)
export function vcf(lista: ContatoImportante[]) {
  return lista.filter(c => c.telefone).map(c => [
    "BEGIN:VCARD", "VERSION:3.0",
    `FN:${esc(c.nome)}`, `N:${esc(c.nome)};;;;`,
    `TEL;TYPE=CELL:+${c.telefone}`,
    `NOTE:${esc(["ENYLA", ...c.motivos].join(" · "))}`,
    "END:VCARD",
  ].join("\r\n")).join("\r\n") + "\r\n"
}

// .csv: planilha com tudo (inclui quem ainda está sem telefone, para você completar)
export function csv(lista: ContatoImportante[]) {
  const q = (s: string | null) => `"${(s ?? "").replace(/"/g, '""')}"`
  return ["nome;telefone;motivo;etiquetas;ultima_conversa;id_whatsapp",
    ...lista.map(c => [q(c.nome), q(c.telefone ? `+${c.telefone}` : ""), q(c.motivos.join(", ")), q(c.etiquetas.join(", ")), q(c.ultima?.slice(0, 10) ?? ""), q(c.jid)].join(";")),
  ].join("\r\n")
}
