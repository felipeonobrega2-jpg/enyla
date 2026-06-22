import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/app/lib/supabase"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ numero: string }> }
) {
  const { numero } = await params
  const { data } = await supabase
    .from("Lote")
    .select("pixLink")
    .eq("numero", numero.toUpperCase())
    .maybeSingle()

  if (!data?.pixLink) {
    return NextResponse.json({ error: "not found" }, { status: 404 })
  }
  return NextResponse.json(data.pixLink)
}
