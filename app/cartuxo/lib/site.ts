// Endereço da loja Cartuxo, usado nos links das mensagens e nos textos do sistema.
// O domínio antigo caixaria.com redireciona para este.
export const SITE_CARTUXO = (process.env.NEXT_PUBLIC_CARTUXO_SITE_URL ?? "https://cartuxo.com.br").replace(/\/$/, "")
export const DOMINIO_CARTUXO = new URL(SITE_CARTUXO).host
