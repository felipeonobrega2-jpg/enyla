// Leitura do funil por campanha (só leitura) para ?o=meta_ads: junta a Meta ao vivo (gasto) com os leads do sistema.
import { leituraMetaAds } from "./metaAdsLeitura"
import { lerConfigLinha } from "./configAtomica"
import { montarFunil, type GastoCampanha } from "./funilCampanhas"

export async function leituraMetaAdsComFunil() {
  const meta = await leituraMetaAds()
  // O funil é um extra: se o sistema falhar, a leitura da Meta continua saindo (funil: { erro })
  try {
    // import tardio: a porta externa não carrega o agente/IA de marketing até alguém pedir o funil
    const [{ leadsDoAnuncio }, { gastosAtuais }] = await Promise.all([import("./marketingServidor"), import("./gastosServidor")])
    const [{ data }, g] = await Promise.all([lerConfigLinha(), gastosAtuais().catch(() => null)])
    const leads = await leadsDoAnuncio((data?.data ?? {}) as Parameters<typeof leadsDoAnuncio>[0])
    const gasto = (k: "d7" | "d30"): GastoCampanha[] => meta.campanhas.map(c => ({ id: c.id, nome: (c.nome as string | null) ?? null, gasto: c.gasto[k] }))
    return { ...meta, funil: montarFunil({ gasto7: gasto("d7"), gasto30: gasto("d30"), leads, previsaoSaldoDias: g?.meta?.diasRestantes ?? null }) }
  } catch (e) {
    console.error("[funil meta_ads]", e)
    return { ...meta, funil: { erro: "Não consegui montar o funil agora; a leitura da Meta segue valendo." } }
  }
}
