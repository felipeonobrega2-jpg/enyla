// O mesmo HTML que vai para a impressão vira um arquivo .pdf A4, sem a janela de imprimir (para mandar pelo
// WhatsApp do sistema ou baixar). O próprio navegador desenha cada página (caixa 3D, fontes e cores iguais à
// impressão) e o arquivo junta as páginas como imagem. Só roda no navegador.

// Área útil da impressão: A4 com margem de 1 cm (o @page dos PDFs), a 96 dpi
const MM = 96 / 25.4
const MARGEM_MM = 10
const LARGURA = Math.round((210 - 2 * MARGEM_MM) * MM)   // 718 px
const ALTURA = Math.round((297 - 2 * MARGEM_MM) * MM)    // 1047 px
const ESCALA = 2

// Igual ao @media print dos PDFs (o desenho é de tela; a impressão usa recuo menor)
const COMO_IMPRESSAO = `.page{padding:16px 20px}html,body{background:#fff}`

// Cada folha como imagem (JPEG) e a fração da altura útil que ela ocupa
export async function folhasDoHtml(html: string): Promise<{ imagem: string; altura: number }[]> {
  const { toCanvas } = await import("html-to-image")
  const iframe = document.createElement("iframe")
  iframe.setAttribute("aria-hidden", "true")
  iframe.style.cssText = `position:fixed;left:-${LARGURA + 100}px;top:0;width:${LARGURA}px;height:${ALTURA}px;border:0`
  document.body.appendChild(iframe)
  try {
    const doc = iframe.contentDocument!
    doc.open(); doc.write(html); doc.close()
    const estilo = doc.createElement("style"); estilo.textContent = COMO_IMPRESSAO; doc.head.appendChild(estilo)
    await Promise.all([...doc.images].map(img => img.complete ? null : new Promise(r => { img.onload = img.onerror = r })))
    await doc.fonts?.ready
    // Cada bloco do corpo é uma página (a proposta, a 3D, as condições); o que passar de uma folha continua na seguinte
    const blocos = [...doc.body.children].filter(e => (e as HTMLElement).offsetHeight > 0) as HTMLElement[]
    const folhas: { imagem: string; altura: number }[] = []
    for (const bloco of blocos) {
      // Mais largo que a folha (a página 3D): desenha na largura dele e reduz para caber, como a impressão faz
      const largura = Math.max(LARGURA, ...[...bloco.querySelectorAll("*")].map(e => (e as HTMLElement).getBoundingClientRect().right - bloco.getBoundingClientRect().left + 24))
      const canvas = await toCanvas(bloco, { pixelRatio: ESCALA, width: Math.ceil(largura), backgroundColor: "#ffffff" })
      const porFolha = Math.round(ALTURA * ESCALA * largura / LARGURA)
      for (let y = 0; y < canvas.height; y += porFolha) {
        const h = Math.min(porFolha, canvas.height - y)
        if (y > 0 && h < porFolha * 0.04) break   // sobra de poucos pixels (arredondamento): não abre folha em branco
        const folha = document.createElement("canvas")
        folha.width = canvas.width; folha.height = h
        const ctx = folha.getContext("2d")!
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, folha.width, h)
        ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h)
        folhas.push({ imagem: folha.toDataURL("image/jpeg", 0.9), altura: h / porFolha })
      }
    }
    return folhas
  } finally {
    iframe.remove()
  }
}

export async function htmlParaPdf(html: string, nomeArquivo: string): Promise<File> {
  const [folhas, { jsPDF }] = await Promise.all([folhasDoHtml(html), import("jspdf")])
  const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true })
  const largMm = 210 - 2 * MARGEM_MM, altMm = 297 - 2 * MARGEM_MM
  folhas.forEach((f, i) => {
    if (i > 0) pdf.addPage()
    pdf.addImage(f.imagem, "JPEG", MARGEM_MM, MARGEM_MM, largMm, f.altura * altMm, undefined, "FAST")
  })
  return new File([pdf.output("blob")], nomeArquivo, { type: "application/pdf" })
}

export function baixarArquivo(f: File) {
  const url = URL.createObjectURL(f)
  const a = document.createElement("a")
  a.href = url; a.download = f.name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
