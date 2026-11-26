// Chave de liga/desliga do Aprovo (AppConfig.data.aprovoObrigatorio). Padrão: desligada (false ou ausente): o que ia
// para a fila do Aprovo sai direto, com as outras travas de pé (horário, limite diário, texto sem promessa de orçamento).
// Ligada (true): comportamento antigo, tudo espera o Aprovo do Felipe. A fila e os cartões antigos nunca são apagados.
// Só roda no servidor.
import { lerCampos } from "./configAtomica"

export const MOTIVO_APROVO_DESLIGADO = "aprovo_desligado"

export async function aprovoObrigatorio(): Promise<boolean> {
  const c = await lerCampos<{ aprovoObrigatorio?: boolean }>(["aprovoObrigatorio"]).catch(() => ({}) as { aprovoObrigatorio?: boolean })
  return c.aprovoObrigatorio === true
}
