"use client"

// Configurações → Contatos importantes: MQLs, ICPs, oportunidades e clientes guardados no sistema, com telefone,
// para não depender do número do WhatsApp. Baixa em .vcf (importa no celular) ou .csv (planilha).

import { useEffect, useState } from "react"
import { ShieldCheck, Download, Loader2, Search } from "lucide-react"
import { Cartao, TituloCartao, Botao, Selo } from "./ds"
import type { ContatoImportante } from "../lib/contatos"

export default function ContatosProtegidosCard() {
  const [d, setD] = useState<{ lista: ContatoImportante[]; total: number; comTelefone: number } | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [digitado, setDigitado] = useState<Record<string, string>>({})

  const carregar = () => fetch("/api/whatsapp/contatos").then(r => r.json()).then(setD).catch(() => {})
  useEffect(() => { carregar() }, [])

  async function descobrir() {
    setBuscando(true); setMsg(null)
    let total = 0
    for (let i = 0; i < 4; i++) {
      const r = await fetch("/api/whatsapp/contatos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ descobrir: true }) }).then(x => x.json()).catch(() => null)
      if (!r) break
      total += r.achados
      setMsg(`Achei ${total} telefones (${r.faltam} ainda sem)…`)
      if (!r.achados) break
    }
    await carregar()
    setMsg(m => (m ?? "").replace("…", "."))
    setBuscando(false)
  }

  async function salvar(jid: string) {
    const r = await fetch("/api/whatsapp/contatos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jid, telefone: digitado[jid] }) }).then(x => x.json()).catch(() => null)
    if (r?.ok) { setDigitado(p => { const n = { ...p }; delete n[jid]; return n }); carregar() } else setMsg(r?.erro ?? "Não salvou.")
  }

  const sem = (d?.lista ?? []).filter(c => !c.telefone)
  return (
    <Cartao className="ds-entrada">
      <TituloCartao titulo="Contatos importantes" icone={<ShieldCheck className="w-4 h-4" />}
        sub="MQLs, ICPs, oportunidades e clientes guardados aqui com telefone. Se o número do WhatsApp tiver problema, você baixa e importa no celular ou em outro número." />
      {!d ? <p className="text-[12px] text-[#898892]">Carregando…</p> : (<>
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <Selo tom="sucesso">{d.comTelefone} com telefone</Selo>
          {d.total - d.comTelefone > 0 && <Selo tom="alerta">{d.total - d.comTelefone} sem telefone</Selo>}
          <span className="text-[11.5px] text-[#898892]">de {d.total} contatos importantes</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <a href="/api/whatsapp/contatos?formato=vcf"><Botao variante="primario" icone={<Download className="w-3.5 h-3.5" />}>Baixar para o celular (.vcf)</Botao></a>
          <a href="/api/whatsapp/contatos?formato=csv"><Botao icone={<Download className="w-3.5 h-3.5" />}>Planilha (.csv)</Botao></a>
          {sem.length > 0 && <Botao onClick={descobrir} disabled={buscando} icone={buscando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}>Descobrir telefones que faltam</Botao>}
        </div>
        {msg && <p className="text-[11.5px] text-[#5e5c68] mt-2">{msg}</p>}
        <p className="text-[11px] text-[#898892] mt-2">Os telefones novos são guardados sozinhos: quando o WhatsApp manda o número e quando um lead vira MQL. Vale baixar o .vcf de vez em quando.</p>
        {sem.length > 0 && (
          <div className="mt-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#898892] mb-1.5">Sem telefone ({sem.length}): o WhatsApp escondeu o número</p>
            <p className="text-[11px] text-[#898892] mb-2">No seu celular, abra a conversa e veja o número no perfil; cole aqui (DDD + número).</p>
            <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
              {sem.slice(0, 60).map(c => (
                <div key={c.jid} className="flex items-center gap-2 text-[12px]">
                  <span className="flex-1 min-w-0 truncate"><span className="font-semibold text-[#191625]">{c.nome}</span><span className="text-[#898892]"> · {c.motivos.join(", ")}</span></span>
                  <input value={digitado[c.jid] ?? ""} onChange={e => setDigitado(p => ({ ...p, [c.jid]: e.target.value }))} onKeyDown={e => { if (e.key === "Enter") salvar(c.jid) }}
                    placeholder="(11) 99999-9999" inputMode="tel"
                    className="w-[150px] h-8 rounded-lg px-2.5 text-[12px] text-[#191625] bg-white focus:outline-none focus:ring-2 focus:ring-[#8456e8]/20 focus:border-[#8456e8] ds-borda" />
                  <Botao disabled={!digitado[c.jid]} onClick={() => salvar(c.jid)} className="h-8 px-2.5 text-[11.5px]">Salvar</Botao>
                </div>
              ))}
            </div>
          </div>
        )}
      </>)}
    </Cartao>
  )
}
