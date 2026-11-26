"use client"

import { useCallback, useEffect, useState } from "react"
import { BLOQUEIOS, ROTULO_BLOQUEIO, INTERRUPTORES_PADRAO, type Interruptores } from "@/app/lib/acesso"

type Usuario = { login: string; nome: string; perfil: string; ativo: boolean; criadoEm: string }
type Registro = { quem: string; quando: string; metodo: string; caminho: string; resultado: string; bloqueio?: string; antes: unknown; depois: unknown }

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [inter, setInter] = useState<Interruptores>(INTERRUPTORES_PADRAO)
  const [registros, setRegistros] = useState<Registro[]>([])
  const [form, setForm] = useState({ login: "", nome: "", senha: "", perfil: "diretor" })
  const [msg, setMsg] = useState("")

  const carregar = useCallback(async () => {
    const [u, i, a] = await Promise.all([
      fetch("/api/usuarios").then(r => r.json()),
      fetch("/api/usuarios/interruptores").then(r => r.json()),
      fetch("/api/usuarios/auditoria").then(r => r.json()),
    ])
    setUsuarios(u.usuarios ?? []); setInter(i.interruptores ?? INTERRUPTORES_PADRAO); setRegistros(a.registros ?? [])
  }, [])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar() }, [carregar])

  async function enviar(url: string, metodo: string, corpo: unknown) {
    const r = await fetch(url, { method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) })
    const j = await r.json().catch(() => ({}))
    setMsg(r.ok ? "Salvo." : (j.erro ?? "Erro ao salvar."))
    if (r.ok) await carregar()
    return r.ok
  }

  const campo = "h-10 rounded-lg border border-zinc-300 px-3 text-sm"
  return (
    <main className="mx-auto max-w-4xl space-y-8 p-6 text-sm">
      <h1 className="text-xl font-bold">Usuários e perfis</h1>
      {msg && <p className="rounded-lg bg-zinc-100 px-3 py-2">{msg}</p>}

      <section className="space-y-3">
        <h2 className="font-semibold">Criar usuário</h2>
        <form className="flex flex-wrap gap-2" onSubmit={async e => { e.preventDefault(); if (await enviar("/api/usuarios", "POST", form)) setForm({ ...form, login: "", nome: "", senha: "" }) }}>
          <input className={campo} placeholder="usuário (ex.: cmo)" value={form.login} onChange={e => setForm({ ...form, login: e.target.value })} autoCapitalize="none" required />
          <input className={campo} placeholder="nome" value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} />
          <input className={campo} type="password" placeholder="senha (mín. 10)" value={form.senha} onChange={e => setForm({ ...form, senha: e.target.value })} autoComplete="new-password" required />
          <select className={campo} value={form.perfil} onChange={e => setForm({ ...form, perfil: e.target.value })}>
            <option value="diretor">diretor</option><option value="admin">admin</option>
          </select>
          <button className="h-10 rounded-lg bg-violet-700 px-4 font-semibold text-white">Criar</button>
        </form>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Usuários</h2>
        {usuarios.length === 0 && <p className="text-zinc-500">Nenhum usuário ainda. A senha de acesso de sempre continua entrando como admin.</p>}
        {usuarios.map(u => (
          <div key={u.login} className="flex items-center gap-3 rounded-lg border border-zinc-200 px-3 py-2">
            <span className="font-medium">{u.login}</span><span className="text-zinc-500">{u.nome}</span>
            <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs">{u.perfil}</span>
            <button className="ml-auto text-violet-700" onClick={() => enviar("/api/usuarios", "PATCH", { login: u.login, ativo: !u.ativo })}>{u.ativo ? "Desativar" : "Reativar"}</button>
            <button className="text-violet-700" onClick={() => { const senha = prompt(`Nova senha de ${u.login} (mín. 10)`); if (senha) enviar("/api/usuarios", "PATCH", { login: u.login, senha }) }}>Trocar senha</button>
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Bloqueios do perfil diretor</h2>
        <p className="text-zinc-500">Todos desligados: o diretor faz tudo. Ligue um para barrar aquela ação (erro 403 no servidor), sem novo deploy.</p>
        {BLOQUEIOS.map(b => (
          <label key={b} className="flex items-center gap-3 rounded-lg border border-zinc-200 px-3 py-2">
            <input type="checkbox" checked={inter[b]} onChange={e => enviar("/api/usuarios/interruptores", "POST", { interruptores: { ...inter, [b]: e.target.checked } })} />
            <span>Barrar: {ROTULO_BLOQUEIO[b]}</span>
          </label>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Últimas alterações (auditoria)</h2>
        {registros.map((r, i) => (
          <details key={i} className="rounded-lg border border-zinc-200 px-3 py-2">
            <summary>{new Date(r.quando).toLocaleString("pt-BR")} · {r.quem} · {r.metodo} {r.caminho} · {r.resultado}{r.bloqueio ? ` (${r.bloqueio})` : ""}</summary>
            <pre className="mt-2 overflow-auto text-xs">{JSON.stringify({ antes: r.antes, depois: r.depois }, null, 2)}</pre>
          </details>
        ))}
      </section>
    </main>
  )
}
