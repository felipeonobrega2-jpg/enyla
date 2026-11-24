"use client"

// Fornecedores → Prospector de Parceiros. Contagem do funil e a lista das qualificadas, só leitura.
// A aprovação de quem se cadastrou continua no bloco de cima. Daqui não sai mensagem.

import React from "react"
import { Search } from "lucide-react"

const ETAPAS = [
  ["encontrado", "Encontrados"],
  ["qualificado", "Qualificados"],
  ["abordado", "Abordados"],
  ["abriu", "Abriram"],
  ["cadastrou", "Cadastraram"],
] as const

const ROTULO: Record<string, string> = {
  offset: "Offset",
  digital: "Digital",
  corteVinco: "Corte e vinco",
  colagem: "Colagem",
  acabamento: "Acabamento",
  hotStamping: "Hot stamping",
  cartonagem: "Cartonagem",
}

type Item = { cnpj: string; nome: string; municipio: string | null; uf: string | null; nota: number; servicos: string[] }
type Funil = { contagem: Record<(typeof ETAPAS)[number][0], number>; qualificados: Item[]; aviso?: string }

const cnpjFmt = (v: string) => v.replace(/\D/g, "").replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")

export function ProspectorParceirosCard() {
  const [dados, setDados] = React.useState<Funil | null>(null)
  const [erro, setErro] = React.useState<string | null>(null)
  React.useEffect(() => {
    let vivo = true
    fetch("/api/prospector")
      .then(r => r.ok ? r.json() : Promise.reject(new Error("resposta")))
      .then((d: Funil) => { if (vivo) setDados(d) })
      .catch(() => { if (vivo) setErro("Não consegui carregar o prospector.") })
    return () => { vivo = false }
  }, [])

  const total = dados ? ETAPAS.reduce((s, [id]) => s + (dados.contagem[id] ?? 0), 0) : 0

  return (
    <div className="bg-white rounded-2xl ds-borda p-5 mb-4 ds-entrada">
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-xl grid place-items-center bg-[#8456e8]/10 text-[#8456e8] shrink-0"><Search className="w-4.5 h-4.5" /></span>
        <div className="min-w-0">
          <p className="text-[13.5px] font-semibold text-[#191625]">Prospector de Parceiros</p>
          <p className="text-[12px] text-[#898892] mt-0.5">Gráficas candidatas à rede, só leitura. A abordagem não dispara daqui. Quem se cadastrou continua sendo aprovado no bloco de cima.</p>
        </div>
      </div>

      {erro ? <p className="mt-4 text-[12px] text-[#b26b00]">{erro}</p> : null}
      {!dados && !erro ? <p className="mt-4 text-[12px] text-[#898892]">Carregando o prospector…</p> : null}

      {dados ? (
        <>
          {dados.aviso ? <p className="mt-4 text-[12px] text-[#b26b00]">{dados.aviso}</p> : null}
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-2">
            {ETAPAS.map(([id, nome]) => (
              <div key={id} className="rounded-xl bg-[rgba(116,116,128,0.05)] px-3 py-2">
                <p className="text-[18px] font-semibold text-[#191625] ds-num leading-none">{dados.contagem[id] ?? 0}</p>
                <p className="text-[11px] text-[#898892] mt-1">{nome}</p>
              </div>
            ))}
          </div>

          <div className="mt-4">
            <p className="text-[12.5px] font-semibold text-[#191625]">Qualificadas</p>
            <p className="text-[12px] text-[#898892] mt-0.5">Da maior nota para a menor. A nota pesa o frete até Barueri, os serviços, o tempo de empresa e o porte.</p>
            {dados.qualificados.length === 0 ? (
              dados.aviso ? null : <p className="mt-3 text-[12px] text-[#898892]">{total === 0 ? "Ainda não há gráficas na base." : "Nenhuma gráfica qualificada ainda."}</p>
            ) : (
              <ul className="mt-2 rounded-xl border border-[rgba(60,60,67,0.10)] divide-y divide-[rgba(60,60,67,0.08)]">
                {dados.qualificados.map(item => {
                  const lugar = [item.municipio, item.uf].filter(Boolean).join("/") || "São Paulo"
                  const servicos = item.servicos.map(s => ROTULO[s] ?? s).join(", ") || "serviço não informado"
                  return (
                    <li key={item.cnpj} className="flex items-center gap-3 px-3 py-2.5">
                      <span className="w-9 text-right text-[13px] font-semibold text-[#8456e8] ds-num shrink-0" title="Nota de 0 a 100">{item.nota}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[13px] font-semibold text-[#191625] truncate">{item.nome}</span>
                        <span className="block text-[12px] text-[#898892] truncate">{lugar} · {servicos}</span>
                      </span>
                      <span className="text-[11px] text-[#898892] ds-num shrink-0 hidden sm:block">{cnpjFmt(item.cnpj)}</span>
                    </li>
                  )
                })}
              </ul>
            )}
            {dados.contagem.qualificado > dados.qualificados.length ? (
              <p className="mt-2 text-[11.5px] text-[#898892]">Mostrando as {dados.qualificados.length} maiores notas, de {dados.contagem.qualificado} qualificadas.</p>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  )
}
