function field(id: string, value: string): string {
  return `${id}${String(value.length).padStart(2, "0")}${value}`
}

function crc16(str: string): string {
  let crc = 0xffff
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0")
}

function clean(s: string, max: number): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .trim()
    .slice(0, max)
    .toUpperCase()
}

export function gerarPixPayload(opts: {
  chave: string
  nome: string
  cidade: string
  valor: number
  txid?: string
  descricao?: string
}): string {
  const { chave, nome, cidade, valor, txid = "***", descricao } = opts

  const guiField = field("00", "BR.GOV.BCB.PIX") + field("01", chave) + (descricao ? field("02", clean(descricao, 72)) : "")
  const merchantInfo = field("26", guiField)

  const txidClean = txid.replace(/[^a-zA-Z0-9]/g, "").slice(0, 25) || "***"
  const additionalData = field("62", field("05", txidClean))

  const payload =
    field("00", "01") +
    merchantInfo +
    field("52", "0000") +
    field("53", "986") +
    (valor > 0 ? field("54", valor.toFixed(2)) : "") +
    field("58", "BR") +
    field("59", clean(nome, 25)) +
    field("60", clean(cidade, 15)) +
    additionalData +
    "6304"

  return payload + crc16(payload)
}
