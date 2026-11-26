// Lado do servidor da pergunta numerada (Versão B): grava o registro por lead em AppConfig.volumeVB (só JSON, sem
// migração) e avisa o Felipe na faixa 3 pelo canal que já existe (avisarMql). Dependências injetáveis para os testes.

import { mudarConfig } from "./configAtomica"
import { aplicarResposta, registrarPergunta, PERFIL_DA_FAIXA, type RegistroVb, type RespostaVb } from "./perguntaQuantidade"

type Mapa = Record<string, RegistroVb>
export type DepsVb = {
  gravar: (jid: string, mudar: (atual: RegistroVb | undefined) => RegistroVb) => Promise<void>
  avisar: (quantidadeTotal: number | null) => Promise<unknown>
}

const MAX_REGISTROS = 3000
export const gravarNoConfig: DepsVb["gravar"] = async (jid, mudar) => {
  await mudarConfig((d: Record<string, unknown> & { volumeVB?: Mapa }) => {
    const mapa = { ...(d.volumeVB ?? {}), [jid]: mudar(d.volumeVB?.[jid]) }
    const chaves = Object.keys(mapa)
    if (chaves.length > MAX_REGISTROS) for (const k of chaves.sort((a, b) => mapa[a].perguntouEm.localeCompare(mapa[b].perguntouEm)).slice(0, chaves.length - MAX_REGISTROS)) delete mapa[k]
    return { volumeVB: mapa }
  })
}

export async function registrarPerguntaVb(jid: string, deps: Pick<DepsVb, "gravar"> = { gravar: gravarNoConfig }) {
  const em = new Date().toISOString()
  await deps.gravar(jid, a => registrarPergunta(a, em))
}

// Grava a faixa (e a quantidade só se o lead digitou número) e, na faixa 3, avisa uma única vez por conversa
export async function tratarRespostaVb(jid: string, r: RespostaVb, deps: DepsVb): Promise<{ avisou: boolean }> {
  const em = new Date().toISOString()
  let avisar = false
  await deps.gravar(jid, atual => {
    if (atual?.respondeuEm) { avisar = false; return atual }   // já tratada: não regrava nem avisa de novo
    const x = aplicarResposta(atual, r, em)
    avisar = x.avisarIcp
    return x.registro
  })
  if (avisar && r.tipo === "faixa") await deps.avisar(r.quantidade).catch(() => null)
  return { avisou: avisar }
}

export const perfilDaResposta = (r: RespostaVb) => (r.tipo === "faixa" ? PERFIL_DA_FAIXA[r.faixa] : null)
