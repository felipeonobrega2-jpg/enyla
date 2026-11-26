"use client"

import { useCallback, useEffect, useState } from "react"

type Usuario = { id: string; nome: string; usuario: string; papel: "admin" | "diretor"; ativo: boolean }
type Interruptor = { id: string; nome: string; ligado: boolean }
type Registro = { id: string; em: string; usuario: string; metodo: string; caminho: string; antes: unknown; depois: unknown }
type Dados = { usuarios: Usuario[] | null; tabelaPronta: boolean; interruptores: Interruptor[]; auditoria: Registro[] }

const campo = "w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"

export default function UsuariosView() {
  const [d, setD] = useState<Dados | null>(null)
  const [msg, setMsg] = useState("")
  const [f, setF] = useState({ nome: "", usuario: "", senha: "", papel: "diretor" })

  const carregar = useCallback(async () => {
    const r = await fetch("/api/usuarios")
    if (r.ok) setD(await r.json())
  }, [])
  useEffect(() => {
    fetch("/api/usuarios").then(r => r.ok ? r.json() : null).then(j => { if (j) setD(j) }).catch(() => {})
  }, [])

  async function enviar(url: string, metodo: string, corpo: unknown) {
    setMsg("")
    const r = await fetch(url, { method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) setMsg(j.erro ?? "Não deu certo.")
    await carregar()
    return r.ok
  }

  async function criar(e: React.FormEvent) {
    e.preventDefault()
    if (await enviar("/api/usuarios", "POST", f)) setF({ nome: "", usuario: "", senha: "", papel: "diretor" })
  }

  if (!d) return <p className="p-8 text-sm">Carregando…</p>
  return (
    <main className="mx-auto max-w-3xl space-y-10 p-8 text-sm">
      <h1 className="text-xl font-bold">Usuários e acesso</h1>
      {msg && <p className="rounded-lg bg-rose-50 p-3 text-rose-700">{msg}</p>}
      {!d.tabelaPronta && <p className="rounded-lg bg-amber-50 p-3 text-amber-800">A tabela de usuários ainda não existe. Rode a migration <code>supabase/migrations/20261129_usuarios_acesso.sql</code> no SQL Editor do Supabase (veja docs/usuarios-diretor.md).</p>}

      <section className="space-y-3">
        <h2 className="font-semibold">Novo usuário</h2>
        <form onSubmit={criar} className="grid grid-cols-2 gap-3">
          <input className={campo} placeholder="Nome (ex.: Rafael, COO)" value={f.nome} onChange={e => setF({ ...f, nome: e.target.value })} required />
          <input className={campo} placeholder="Usuário (ex.: rafael)" value={f.usuario} onChange={e => setF({ ...f, usuario: e.target.value })} required />
          <input className={campo} type="password" placeholder="Senha (mín. 10 caracteres)" value={f.senha} onChange={e => setF({ ...f, senha: e.target.value })} required autoComplete="new-password" />
          <select className={campo} value={f.papel} onChange={e => setF({ ...f, papel: e.target.value })}>
            <option value="diretor">diretor</option>
            <option value="admin">admin</option>
          </select>
          <button className="col-span-2 rounded-lg bg-violet-700 py-2 font-semibold text-white">Criar usuário</button>
        </form>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Usuários</h2>
        {(d.usuarios ?? []).map(u => (
          <div key={u.id} className="flex items-center justify-between rounded-lg border border-zinc-200 p-3">
            <span>{u.nome} · <b>{u.usuario}</b> · {u.papel}{u.ativo ? "" : " · desativado"}</span>
            <span className="space-x-2">
              <button className="underline" onClick={() => enviar(`/api/usuarios/${u.id}`, "PATCH", { papel: u.papel === "admin" ? "diretor" : "admin" })}>virar {u.papel === "admin" ? "diretor" : "admin"}</button>
              <button className="underline" onClick={() => enviar(`/api/usuarios/${u.id}`, "PATCH", { ativo: !u.ativo })}>{u.ativo ? "desativar" : "ativar"}</button>
            </span>
          </div>
        ))}
        {d.usuarios?.length === 0 && <p className="text-zinc-500">Nenhum usuário ainda. A senha única continua entrando como admin.</p>}
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Bloqueios do perfil diretor</h2>
        <p className="text-zinc-500">Todos começam desligados (o diretor tem acesso total). Ligar um faz o servidor responder 403 ao diretor, na hora, sem deploy.</p>
        {d.interruptores.map(i => (
          <label key={i.id} className="flex items-center gap-3 rounded-lg border border-zinc-200 p-3">
            <input type="checkbox" checked={i.ligado} onChange={e => enviar("/api/usuarios/interruptores", "POST", { id: i.id, ligado: e.target.checked })} />
            <span>{i.nome} — {i.ligado ? <b>BLOQUEADO</b> : "liberado"}</span>
          </label>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Últimas alterações (quem, quando, antes e depois)</h2>
        {d.auditoria.map(a => (
          <details key={a.id} className="rounded-lg border border-zinc-200 p-3">
            <summary>{new Date(a.em).toLocaleString("pt-BR")} · {a.usuario} · {a.metodo} {a.caminho}</summary>
            <pre className="mt-2 overflow-x-auto text-xs">antes: {JSON.stringify(a.antes, null, 1)}{"\n"}depois: {JSON.stringify(a.depois, null, 1)}</pre>
          </details>
        ))}
      </section>
    </main>
  )
}
