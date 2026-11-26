// Passo de confirmação da Fila do WhatsApp antes de "Enviar mesmo assim" (fora da janela de envio).
// Nada é enviado ao cliente sem a chamada de `confirmar`. Não mexe em fila, Aprovo nem na lógica de envio.

export type EnvioPendente = { destinatario: string; texto: string }

export function criarConfirmacaoEnvio() {
  let pendente: EnvioPendente | null = null
  return {
    get pendente() { return pendente },
    // Clique em "Enviar mesmo assim": só abre a confirmação.
    pedir(p: EnvioPendente) { pendente = p },
    // "Cancelar" (padrão): fecha sem enviar.
    cancelar() { pendente = null },
    // "Confirmar envio": único caminho que dispara o envio.
    async confirmar(enviar: () => Promise<void> | void) {
      if (!pendente) return false
      pendente = null
      await enviar()
      return true
    },
  }
}
