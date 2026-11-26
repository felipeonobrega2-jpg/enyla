import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { importarOfx, TAMANHO_MAX } from "@/app/lib/extratoServidor"

// Upload do .ofx (só usuário logado do painel). Só grava em extratoLancamento; não mexe em despesas, cobrança nem Asaas.
export async function POST(req: NextRequest) {
  if (!(await auth().catch(() => null))) return NextResponse.json({ erro: "Entre no sistema para importar o extrato." }, { status: 401 })
  const form = await req.formData().catch(() => null)
  const arq = form?.get("arquivo")
  if (!(arq instanceof File)) return NextResponse.json({ erro: "Envie o arquivo .ofx no campo 'arquivo'." }, { status: 400 })
  if (!/\.ofx$/i.test(arq.name)) return NextResponse.json({ erro: "O arquivo precisa ser .ofx." }, { status: 400 })
  if (arq.size > TAMANHO_MAX) return NextResponse.json({ erro: "Arquivo grande demais (máximo 2 MB)." }, { status: 413 })
  try {
    const buf = new Uint8Array(await arq.arrayBuffer())
    // OFX do Santander costuma vir em latin1 (Windows-1252); se o UTF-8 não decodifica, cai para latin1
    let texto: string
    try { texto = new TextDecoder("utf-8", { fatal: true }).decode(buf) } catch { texto = new TextDecoder("windows-1252").decode(buf) }
    return NextResponse.json(await importarOfx(texto, arq.name))
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : "Falha ao importar o OFX." }, { status: 400 })
  }
}
