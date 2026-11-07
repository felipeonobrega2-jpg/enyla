// Gravação segura da configuração (AppConfig id 1, um JSON só). Várias tarefas gravam ao mesmo tempo (agente,
// conferência do Pix, follow-ups, a tela): ler tudo e regravar tudo fazia uma apagar a outra (o agente perdia o
// registro do que enviou e passava a achar que era você na conversa). Aqui cada gravação confere a versão (_v) que
// leu: se outra gravou no meio, lê de novo e reaplica a mudança.

import { supabase } from "./supabase"

type Dados = Record<string, unknown>
const pausa = (ms: number) => new Promise(r => setTimeout(r, ms))

// mudar recebe a configuração atual e devolve só os campos que mudam (null = nada a gravar)
export async function mudarConfig<T extends Dados = Dados>(mudar: (d: T) => Partial<T> | Dados | null, tentativas = 10): Promise<T> {
  for (let i = 0; ; i++) {
    const { data, error: erroLer } = await supabase.from("AppConfig").select("data").eq("id", 1).maybeSingle()
    if (erroLer) throw new Error(`config: ${erroLer.message}`)
    const d = ((data?.data ?? {}) as T)
    const m = mudar(d)
    if (!m) return d
    const v = typeof d._v === "number" ? d._v : null
    const novo = { ...d, ...m, _v: (v ?? 0) + 1 } as T
    if (!data) {   // ainda não existe (banco novo)
      const { error } = await supabase.from("AppConfig").insert({ id: 1, data: novo })
      if (!error) return novo
    } else {
      const q = supabase.from("AppConfig").update({ data: novo }).eq("id", 1)
      const { data: ok, error } = await (v == null ? q.is("data->_v", null) : q.eq("data->>_v", String(v))).select("id")
      if (error) throw new Error(`config: ${error.message}`)
      if (ok?.length) return novo
    }
    if (i + 1 >= tentativas) throw new Error("config: muitas gravações ao mesmo tempo")
    await pausa(40 + Math.random() * 120 * (i + 1))
  }
}

// Atalho: grava estes campos por cima (sem depender do que está salvo)
export const gravarCampos = (campos: Dados) => mudarConfig(() => campos)
