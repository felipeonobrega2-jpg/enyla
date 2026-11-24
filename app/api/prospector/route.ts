// Funil do Prospector de Parceiros (só a equipe, pela tela Fornecedores). Só leitura.
import { NextResponse } from "next/server"
import { AVISO_SEM_TABELA, lerFunil } from "@/app/lib/prospectorServidor"

export const dynamic = "force-dynamic"

const vazio = { encontrado: 0, qualificado: 0, abordado: 0, abriu: 0, cadastrou: 0 }

export async function GET() {
  try {
    return NextResponse.json(await lerFunil())
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e)
    if (/does not exist|could not find the table|schema cache/i.test(m)) {
      return NextResponse.json({ contagem: vazio, qualificados: [], aviso: AVISO_SEM_TABELA })
    }
    return NextResponse.json({ contagem: vazio, qualificados: [], aviso: "Não consegui ler o prospector agora." }, { status: 500 })
  }
}
