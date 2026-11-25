"use client"

// Digital: o cliente parece ter aprovado a arte/prova no WhatsApp. É só uma sugestão: o pedido só muda com o clique.
import { CheckCircle2, X } from "lucide-react"
import { Botao } from "./ds"
import type { SugestaoArte } from "../lib/arteAprovadaSugestao"

const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })

export type DecidirArte = (id: string, decisao: "confirmar" | "descartar") => void

export function SugestaoArteAprovada({ id, nome, s, ocupado, onDecidir }: { id: string; nome?: string | null; s: SugestaoArte; ocupado: boolean; onDecidir: DecidirArte }) {
  return (
    <div className="rounded-xl px-3.5 py-3 space-y-2" style={{ border: "1px solid rgba(0,147,81,0.35)", background: "rgba(0,147,81,0.05)" }}>
      <p className="text-[12.5px] font-semibold text-[#191625]">{id}{nome ? ` · ${nome}` : ""} <span className="font-normal text-[#898892]">· parece que o cliente aprovou a arte</span></p>
      <p className="text-[12.5px] text-[#5d5b66]">“{s.trecho}” <span className="text-[#898892]">· {quando(s.em)}</span></p>
      {s.ambigua && <p className="text-[12px] text-[#c57800]">O mesmo cliente tem mais de um pedido nesta conversa ({s.candidatos.join(", ")}). Confirme só no pedido certo.</p>}
      <div className="flex flex-wrap gap-2">
        <Botao variante="primario" icone={<CheckCircle2 className="w-3.5 h-3.5" />} disabled={ocupado} onClick={() => onDecidir(id, "confirmar")}>Confirmar arte aprovada</Botao>
        <Botao icone={<X className="w-3.5 h-3.5" />} disabled={ocupado} onClick={() => onDecidir(id, "descartar")}>Não é aprovação</Botao>
      </div>
    </div>
  )
}
