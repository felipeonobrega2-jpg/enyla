"use client"

import { signIn } from "next-auth/react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"

export default function LoginPage() {
  const [password, setPassword] = useState("")
  const [error, setError]       = useState("")
  const [loading, setLoading]   = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")
    const result = await signIn("credentials", { password, redirect: false })
    setLoading(false)
    if (result?.error) {
      setError("Senha incorreta.")
    } else {
      router.push("/")
      router.refresh()
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#09090b" }}>

      {/* Ambient glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
        <div style={{
          position: "absolute", top: "30%", left: "50%", transform: "translate(-50%, -50%)",
          width: 600, height: 600,
          background: "radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)",
        }} />
      </div>

      <div className="relative w-full max-w-[360px] px-6">

        {/* Brand mark */}
        <div className="flex flex-col items-center mb-10">
          <Image src="/brand/enyla-wordmark-light.png" alt="Enyla" width={1094} height={159}
            className="h-9 w-auto mb-3" priority />
          <p className="text-zinc-500 text-xs mt-1.5 tracking-wide uppercase font-medium">Comunicação Visual</p>
        </div>

        {/* Card */}
        <div style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 20,
          padding: "28px 28px 24px",
        }}>
          <p className="text-white font-semibold text-[15px] mb-1">Bem-vindo de volta</p>
          <p className="text-zinc-500 text-[12.5px] mb-6">Acesso restrito — equipe interna</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-zinc-400 text-[11px] font-semibold uppercase tracking-[0.1em] mb-2">Senha de acesso</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoFocus
                style={{
                  width: "100%", height: 44,
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 12,
                  padding: "0 16px",
                  color: "#fff",
                  fontSize: 14,
                  outline: "none",
                  transition: "border-color 0.15s",
                }}
                onFocus={e => { e.currentTarget.style.borderColor = "#6366f1" }}
                onBlur={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)" }}
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2.5">
                <svg className="w-3.5 h-3.5 text-rose-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
                <p className="text-rose-400 text-[12px]">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !password}
              style={{
                width: "100%", height: 44,
                background: loading || !password ? "rgba(99,102,241,0.4)" : "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
                border: "none", borderRadius: 12,
                color: "#fff", fontWeight: 700, fontSize: 14,
                cursor: loading || !password ? "not-allowed" : "pointer",
                transition: "opacity 0.15s",
                boxShadow: loading || !password ? "none" : "0 4px 24px rgba(99,102,241,0.35)",
              }}
            >
              {loading ? "Entrando…" : "Entrar"}
            </button>
          </form>
        </div>

        <p className="text-center text-zinc-700 text-[10.5px] mt-8">
          ENYLA Comunicação Visual · Sistema interno
        </p>
      </div>
    </div>
  )
}
