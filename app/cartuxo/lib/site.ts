// Endereço da loja Cartuxo, usado nos links das mensagens e nos textos do sistema.
// Quando cartuxo.com.br estiver no ar, trocar o padrão abaixo (o domínio antigo caixaria.com redireciona para o novo).
export const SITE_CARTUXO = (process.env.NEXT_PUBLIC_CARTUXO_SITE_URL ?? "https://caixaria.com").replace(/\/$/, "")
export const DOMINIO_CARTUXO = new URL(SITE_CARTUXO).host
