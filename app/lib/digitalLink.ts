// Link assinado da página do pedido digital (/d/DIG-0001?t=…)
import { assinar } from "./aprovacao"

export const BASE_PUBLICA = "https://app.enyla.com.br"
export const tokenDigital = (id: string) => assinar("digital", id)
export const tokenDigitalValido = (id: string, t: string | null | undefined) => !!t && t === tokenDigital(id)
export const linkPedido = (id: string) => `${BASE_PUBLICA}/d/${encodeURIComponent(id)}?t=${tokenDigital(id)}`
// Link da designer: a mesma página, com a parte de subir a arte (token próprio, não abre com o link do cliente)
export const tokenDesigner = (id: string) => assinar("digital-designer", id)
export const tokenDesignerValido = (id: string, t: string | null | undefined) => !!t && t === tokenDesigner(id)
export const linkDesigner = (id: string) => `${linkPedido(id)}&dz=${tokenDesigner(id)}`
