// Reduz uma foto do celular (4–8 MB) para algo leve antes de enviar: lado maior 1600 px, JPEG.
// Só no navegador.

export async function reduzirFoto(arquivo: File, ladoMaior = 1600, qualidade = 0.82): Promise<File> {
  if (!arquivo.type.startsWith("image/")) return arquivo
  try {
    const bitmap = await createImageBitmap(arquivo)
    const escala = Math.min(1, ladoMaior / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement("canvas")
    canvas.width = Math.round(bitmap.width * escala)
    canvas.height = Math.round(bitmap.height * escala)
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>(ok => canvas.toBlob(ok, "image/jpeg", qualidade))
    if (!blob || blob.size >= arquivo.size) return arquivo
    return new File([blob], arquivo.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" })
  } catch {
    return arquivo   // formato que o navegador não abre (ex.: HEIC em alguns aparelhos): envia como está
  }
}

export async function enviarFotoProducao(cardId: string, cardNumero: string, foto: File) {
  const fd = new FormData()
  fd.append("file", await reduzirFoto(foto))
  fd.append("cardNumero", cardNumero)
  fd.append("tipo", "foto")
  const r = await fetch(`/api/pedido/${cardId}/arquivos`, { method: "POST", body: fd })
  return r.ok
}
