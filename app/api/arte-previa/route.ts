import { NextRequest, NextResponse } from "next/server"
import { lerCampos } from "@/app/lib/configAtomica"
import { clienteClaude, MODELO } from "@/app/lib/claude"
import { registrarUsoIA } from "@/app/lib/gastosServidor"
import { ESQUEMA_ARTE, FACES, limparSvg, sistemaArte, tamanhoDasFaces, type DimsCaixa, type FacesArte } from "@/app/lib/artePrevia"

// Arte prévia (rota protegida pelo login): material do cliente (imagens e PDF) + a ideia escrita + as medidas da
// caixa → a arte de cada face em SVG. Com "anterior" + "ajuste", refaz a partir da última versão.
export const maxDuration = 300

type Arquivo = { nome: string; tipo: string; dados: string }   // dados: base64 (sem o prefixo data:)
type Corpo = { arquivos?: Arquivo[]; texto?: string; dims?: DimsCaixa; acabamento?: string; anterior?: FacesArte | null; ajuste?: string }
const IMAGEM = /^image\/(png|jpeg|webp|gif)$/

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null) as Corpo | null
  const d = b?.dims
  if (!d || !(d.largura > 0 && d.profundidade > 0 && d.altura > 0)) return NextResponse.json({ erro: "Preencha as medidas da caixa primeiro." }, { status: 400 })
  const arquivos = (b.arquivos ?? []).filter(a => IMAGEM.test(a.tipo) || a.tipo === "application/pdf").slice(0, 6)
  const texto = (b.texto ?? "").trim().slice(0, 3000)
  if (!arquivos.length && !texto && !b.ajuste) return NextResponse.json({ erro: "Arraste o material do cliente ou escreva a ideia." }, { status: 400 })
  const { apiKey } = await lerCampos<{ apiKey?: string }>(["apiKey"])
  if (!apiKey) return NextResponse.json({ erro: "Sem chave da IA nas Configurações." }, { status: 400 })

  const tam = tamanhoDasFaces(d)
  const conteudo: unknown[] = arquivos.map(a => a.tipo === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: a.dados } }
    : { type: "image", source: { type: "base64", media_type: a.tipo, data: a.dados } })
  const pedido = [
    arquivos.length ? `Material do cliente: ${arquivos.map(a => a.nome).join(", ")} (acima).` : "Sem material: crie a partir da ideia.",
    texto ? `Ideia do cliente / do vendedor:\n<ideia>\n${texto}\n</ideia>` : "",
    b.acabamento ? `Acabamentos do orçamento: ${b.acabamento}.` : "",
    `Caixa: frente ${tam.frente[0]}×${tam.frente[1]} mm, lateral ${tam.lateral_esq[0]}×${tam.lateral_esq[1]} mm, tampa e fundo ${tam.tampa[0]}×${tam.tampa[1]} mm.`,
    `viewBox de cada face: ${FACES.map(f => `${f}: 0 0 ${tam[f][0]} ${tam[f][1]}`).join("; ")}.`,
    b.anterior && b.ajuste ? `Versão anterior (refaça a partir dela, mudando só o que foi pedido):\n${FACES.map(f => `<${f}>${b.anterior![f]}</${f}>`).join("\n")}\n\nAjuste pedido:\n<ajuste>\n${b.ajuste.slice(0, 1500)}\n</ajuste>` : "",
  ].filter(Boolean).join("\n\n")
  conteudo.push({ type: "text", text: pedido })

  try {
    const msg = await clienteClaude(apiKey).beta.messages.stream({
      model: MODELO, max_tokens: 32000,
      output_config: { effort: "low", format: { type: "json_schema", schema: ESQUEMA_ARTE } },
      system: sistemaArte(),
      messages: [{ role: "user", content: conteudo as never }],
    }).finalMessage()
    await registrarUsoIA(msg.model, msg.usage as never).catch(() => null)
    const r = JSON.parse(msg.content.flatMap(c => c.type === "text" ? [c.text] : []).join("")) as FacesArte & { nota: string }
    const faces = {} as FacesArte
    for (const f of FACES) {
      const s = limparSvg(r[f])
      if (!s) return NextResponse.json({ erro: `A IA não desenhou a face "${f}". Tente de novo.` }, { status: 502 })
      faces[f] = s
    }
    return NextResponse.json({ faces, nota: r.nota ?? "" })
  } catch (e) {
    return NextResponse.json({ erro: `A IA não conseguiu montar agora: ${String(e).slice(0, 160)}` }, { status: 502 })
  }
}
