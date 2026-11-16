import { NextResponse } from "next/server"
import { sugerirPendentes } from "@/app/lib/bancoServidor"
import { talvezCadastrarSubcategorias } from "@/app/lib/ideiasServidor"

export const maxDuration = 60

// Prepara mais um pedaço das sugestões; a tela chama de novo enquanto houver "restantes". (Rota protegida.)
// Antes, garante as subcategorias cadastradas pelo sistema (uma vez só): a IA já escolhe entre elas.
export async function POST() {
  await talvezCadastrarSubcategorias().catch(() => null)
  return NextResponse.json(await sugerirPendentes(45_000))
}
