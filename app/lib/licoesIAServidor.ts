import { supabase } from "./supabase"
import { mudarConfig } from "./configAtomica"
import { AreaIA, LicaoIA, LicoesIA } from "./licoesIA"

export async function lerLicoesIA(area: AreaIA): Promise<LicaoIA[]> {
  const { data } = await supabase.from("AppConfig").select("data").eq("id", 1).single()
  return ((data?.data as { licoesIA?: LicoesIA } | undefined)?.licoesIA?.[area]) ?? []
}

export async function mudarLicoesIA(area: AreaIA, mudar: (l: LicaoIA[]) => LicaoIA[]): Promise<LicaoIA[]> {
  let nova: LicaoIA[] = []
  await mudarConfig((d: Record<string, unknown> & { licoesIA?: LicoesIA }) => {
    nova = mudar(d.licoesIA?.[area] ?? [])
    return { licoesIA: { ...(d.licoesIA ?? {}), [area]: nova } }
  })
  return nova
}
