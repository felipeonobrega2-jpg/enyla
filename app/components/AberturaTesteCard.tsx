"use client"

// Teste A/B da primeira mensagem: metade dos leads do anúncio recebe a de sempre (A, do filtro) e metade a desafiante
// (B). O sistema mede quem respondeu e quem disse o volume em 24 h e fica com a melhor sozinho.

import { useEffect, useState } from "react"
import { FlaskConical, Loader2, RefreshCw, Trophy } from "lucide-react"
import { Cartao, TituloCartao, Selo, Botao } from "./ds"
import type { MedicaoAbertura, Placar, TesteAbertura, Variante } from "../lib/aberturaAB"

type Dados = { a: string; teste: TesteAbertura | null; medida: MedicaoAbertura | null; minimo: number }
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "–")
const dm = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })

export default function AberturaTesteCard() {
  const [d, setD] = useState<Dados | null>(null)
  const [b, setB] = useState("")
  const [editando, setEditando] = useState(false)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    fetch("/api/abertura").then(r => r.json()).then((x: Dados) => { if (vivo) { setD(x); setB(x.teste?.b ?? "") } }).catch(() => {})
    return () => { vivo = false }
  }, [])

  async function mandar(corpo: Record<string, unknown>, chave: string) {
    setOcupado(chave); setErro(null)
    const r = await fetch("/api/abertura", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }).catch(() => null)
    const x = await r?.json().catch(() => null)
    if (r?.ok && x) { setD(x); setB(x.teste?.b ?? ""); setEditando(false) } else setErro(x?.erro ?? "Não salvou. Tente de novo.")
    setOcupado(null)
  }

  if (!d) return null
  const t = d.teste
  const m = d.medida
  const linha = (v: Variante, texto: string, p: Placar | undefined) => {
    const ganhou = t?.vencedora === v
    return (
      <div className={`rounded-xl px-3.5 py-3 ds-borda ${ganhou ? "bg-[#009351]/[0.05]" : "bg-white"}`}>
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-md grid place-items-center text-[12px] font-bold text-white shrink-0" style={{ background: v === "A" ? "#72707d" : "#8456e8" }}>{v}</span>
          <span className="text-[12px] font-semibold text-[#191625]">{v === "A" ? "A de sempre (vem do filtro)" : "Desafiante"}</span>
          {ganhou && <Selo tom="sucesso"><Trophy className="w-3 h-3 inline -mt-0.5 mr-1" />ficou</Selo>}
        </div>
        {v === "B" && editando
          ? <textarea value={b} onChange={e => setB(e.target.value)} rows={3} maxLength={500}
              className="mt-2 w-full rounded-lg px-2.5 py-2 text-[12.5px] text-[#191625] bg-white ds-borda focus:outline-none focus:ring-2 focus:ring-[#8456e8]/20" />
          : <p className="mt-2 text-[12.5px] text-[#5e5c68] leading-snug whitespace-pre-wrap">{texto || "—"}</p>}
        <div className="mt-2.5 grid grid-cols-4 gap-2">
          {[["Leads", p ? String(p.leads) : "0"], ["Responderam", p ? pct(p.responderam, p.leads) : "–"], ["Disseram volume", p ? pct(p.volume, p.leads) : "–"], ["Viraram MQL", p ? pct(p.mql, p.leads) : "–"]].map(([r, val]) => (
            <div key={r} className="rounded-lg px-2 py-1.5 bg-[rgba(116,116,128,0.06)] min-w-0">
              <p className="text-[10px] font-medium text-[#898892] truncate">{r}</p>
              <p className="text-[14px] font-semibold ds-num text-[#191625]">{val}</p>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const faltam = m ? Math.max(0, d.minimo - Math.min(m.A.leads, m.B.leads)) : d.minimo
  const status = !t ? "Começa sozinho com a próxima mensagem que chegar."
    : !t.ligado ? "Desligado: todo lead recebe a A."
    : t.vencedora ? `Decidido em ${dm(t.decididoEm ?? t.inicio)}. ${t.motivo ?? ""} Todo lead novo recebe a ${t.vencedora}.`
    : `Rodando desde ${dm(t.inicio)}. Cada lead do anúncio que chega só com a mensagem pronta recebe uma das duas (sempre a mesma). Conta quem respondeu e quem disse o volume nas 24 h seguintes. ${faltam ? `Decide quando as duas tiverem ${d.minimo} leads (faltam ${faltam} na que tem menos).` : "Já tem amostra: decide quando uma passar a outra em 8 pontos de \"disse o volume\"."}`

  return (
    <div id="teste-abertura"><Cartao className="ds-entrada">
      <TituloCartao titulo="Teste da primeira mensagem" icone={<FlaskConical className="w-4 h-4" />} sub={status}
        acao={t?.ligado && !t.vencedora ? <Selo tom="acento">rodando</Selo> : t?.vencedora ? <Selo tom="sucesso">decidido</Selo> : undefined} />
      <div className="space-y-2.5">
        {linha("A", d.a, m?.A)}
        {linha("B", t?.b ?? "", m?.B)}
      </div>
      {m && <p className="mt-2 text-[11px] text-[#898892]">Medido em {dm(m.em)} (o sistema mede a cada 6 h). Só contam leads que já passaram 24 h da abertura.</p>}
      {erro && <p className="mt-2 text-[11.5px] text-[#d33a3c]">{erro}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {editando ? <>
          <Botao variante="primario" onClick={() => void mandar({ b }, "b")} disabled={!!ocupado}>{ocupado === "b" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}Salvar e recomeçar o teste</Botao>
          <Botao variante="fantasma" onClick={() => { setEditando(false); setB(t?.b ?? "") }}>Cancelar</Botao>
        </> : <>
          <Botao variante="secundario" onClick={() => setEditando(true)}>Trocar a B</Botao>
          <Botao variante="fantasma" onClick={() => void mandar({ medir: true }, "medir")} disabled={!!ocupado}>
            {ocupado === "medir" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}Medir agora</Botao>
          {t?.vencedora
            ? <Botao variante="fantasma" onClick={() => void mandar({ novo: true }, "novo")} disabled={!!ocupado}>Testar de novo</Botao>
            : <>
              {t?.ligado && <Botao variante="fantasma" onClick={() => { if (confirm("Encerrar agora e ficar com a A?")) void mandar({ ficar: "A" }, "fA") }} disabled={!!ocupado}>Ficar com a A</Botao>}
              {t?.ligado && <Botao variante="fantasma" onClick={() => { if (confirm("Encerrar agora e ficar com a B?")) void mandar({ ficar: "B" }, "fB") }} disabled={!!ocupado}>Ficar com a B</Botao>}
              <Botao variante="fantasma" onClick={() => void mandar({ ligado: !t?.ligado }, "ligar")} disabled={!!ocupado}>{t?.ligado ? "Pausar" : "Ligar"}</Botao>
            </>}
        </>}
      </div>
      <p className="mt-2 text-[11px] text-[#898892]">Trocar a B recomeça a contagem. A A muda no filtro de leads (linha da PRIMEIRA MENSAGEM).</p>
    </Cartao></div>
  )
}
