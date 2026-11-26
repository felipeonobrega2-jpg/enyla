import type { Metadata } from "next"
import ParceirosForm from "./ParceirosForm"

export const metadata: Metadata = {
  title: "Sua gráfica na rede de parceiras da ENYLA",
  description: "A ENYLA recebe pedidos de impressão do Brasil todo. Cadastre seus serviços e suas máquinas e receba os pedidos do que a sua gráfica faz.",
  robots: { index: false, follow: false },
}
// Página do parceiro: sempre clara
export const viewport = { themeColor: "#2a1a5e", colorScheme: "only light" as const }

export const dynamic = "force-dynamic"

export default async function Page() {
  // WhatsApp do gerente de contas (o número da ENYLA no sistema) para o botão do final; sem resposta, o botão não aparece
  let w = (process.env.WHATSAPP_GERENTE ?? "").replace(/\D/g, "") || null
  if (!w) {
    const { seuNumero } = await import("../lib/agenteAuto")
    w = await Promise.race([seuNumero().catch(() => null), new Promise<null>(r => setTimeout(() => r(null), 2500))])
  }
  // Só enunciado e versão: preço e fornecedor de referência nunca chegam ao parceiro
  const { lerCenariosPublicos } = await import("../lib/parceirosServidor")
  const cenarios = await lerCenariosPublicos()
  return <ParceirosForm whatsappGerente={w} cenarios={cenarios} />
}
