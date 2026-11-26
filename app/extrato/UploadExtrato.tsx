"use client"
import { useState } from "react"

type Res = { lidos: number; novos: number; jaExistiam: number; ignorados: number; erro?: string }

export default function UploadExtrato() {
  const [res, setRes] = useState<Res | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setEnviando(true); setRes(null)
    const r = await fetch("/api/extrato/importar", { method: "POST", body: new FormData(e.currentTarget) }).then(x => x.json()).catch(() => ({ erro: "Falha de rede." }))
    setRes(r); setEnviando(false)
  }

  return (
    <form onSubmit={enviar} className="space-y-3">
      <input type="file" name="arquivo" accept=".ofx" required className="block text-sm" />
      <button disabled={enviando} className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50">{enviando ? "Importando…" : "Importar"}</button>
      {res?.erro && <p className="text-sm text-red-600">{res.erro}</p>}
      {res && !res.erro && <p className="text-sm">{res.lidos} lançamentos lidos: {res.novos} novos, {res.jaExistiam} já existiam{res.ignorados ? `, ${res.ignorados} ignorados` : ""}.</p>}
    </form>
  )
}
