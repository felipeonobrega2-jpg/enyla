// Link assinado da página do pedido digital (/d/DIG-0001?t=…)
import { assinar } from "./aprovacao"

export const BASE_PUBLICA = "https://app.enyla.com.br"
export const tokenDigital = (id: string) => assinar("digital", id)
export const tokenDigitalValido = (id: string, t: string | null | undefined) => !!t && t === tokenDigital(id)
export const linkPedido = (id: string) => `${BASE_PUBLICA}/d/${encodeURIComponent(id)}?t=${tokenDigital(id)}`
