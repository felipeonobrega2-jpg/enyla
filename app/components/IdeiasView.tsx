"use client"

// Ideias para implementar depois: um quadro simples de backlog, salvo na configuração.

import React, { useState } from "react"
import { Lightbulb, Plus, X, Circle, CircleDot, CircleCheck } from "lucide-react"
import { Configuracoes, Ideia, StatusIdeia } from "../config"
import { Pagina, CabecalhoPagina, Cartao, TituloCartao, Botao, Vazio, Selo } from "./ds"

const STATUS: { v: StatusIdeia; nome: string; acao: string; icone: React.ReactNode }[] = [
  { v: "ideia", nome: "Para fazer", acao: "Reabrir", icone: <Circle className="w-3.5 h-3.5" /> },
  { v: "andamento", nome: "Em andamento", acao: "Começar", icone: <CircleDot className="w-3.5 h-3.5 text-[#8456e8]" /> },
  { v: "feita", nome: "Feitas", acao: "Concluir", icone: <CircleCheck className="w-3.5 h-3.5 text-[#009351]" /> },
]

const dataBR = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/")

export function IdeiasView({ config, onSalvar }: { config: Configuracoes; onSalvar: (c: Configuracoes) => void }) {
  const ideias = config.ideias ?? []
  const [texto, setTexto] = useState("")
  const salvar = (lista: Ideia[]) => onSalvar({ ...config, ideias: lista })

  function adicionar() {
    const t = texto.trim()
    if (!t) return
    salvar([{ id: Date.now().toString(36), texto: t, status: "ideia", criadaEm: new Date().toLocaleDateString("sv-SE") }, ...ideias])
    setTexto("")
  }

  return (
    <Pagina>
      <CabecalhoPagina titulo="Ideias" sub="Anote o que quer no sistema. A gente implementa depois, uma de cada vez." />

      <Cartao className="ds-entrada">
        <div className="flex gap-2">
          <input value={texto} onChange={e => setTexto(e.target.value)} onKeyDown={e => e.key === "Enter" && adicionar()}
            placeholder="Ex.: média de cada etapa nos fornecedores para saber o prazo de produção"
            className="flex-1 min-w-0 h-10 rounded-lg px-3 text-[13px] text-[#191625] bg-white ds-borda focus:outline-none focus:ring-2 focus:ring-[#8456e8]/20" />
          <Botao variante="primario" icone={<Plus className="w-4 h-4" />} onClick={adicionar} disabled={!texto.trim()}>Anotar</Botao>
        </div>
      </Cartao>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        {STATUS.map(st => {
          const doStatus = ideias.filter(i => i.status === st.v)
          return (
            <Cartao key={st.v} padding={false} className="ds-entrada">
              <div className="px-5 pt-5">
                <TituloCartao titulo={st.nome} icone={st.icone} acao={<Selo>{doStatus.length}</Selo>} />
              </div>
              <div className="px-3 pb-3 -mt-1 space-y-1.5">
                {doStatus.length === 0 && <Vazio icone={<Lightbulb className="w-7 h-7" />} titulo="Nada aqui" />}
                {doStatus.map(i => (
                  <div key={i.id} className="group rounded-xl bg-[rgba(116,116,128,0.04)] px-3.5 py-3">
                    <p className={`text-[13px] leading-relaxed ${i.status === "feita" ? "text-[#898892] line-through decoration-[#898892]/40" : "text-[#191625]"}`}>{i.texto}</p>
                    <div className="flex items-center gap-1.5 mt-2">
                      <span className="text-[11px] text-[#898892] ds-num mr-auto">{dataBR(i.criadaEm)}</span>
                      {STATUS.filter(s => s.v !== i.status).map(s => (
                        <button key={s.v} onClick={() => salvar(ideias.map(x => x.id === i.id ? { ...x, status: s.v } : x))}
                          className="h-6 px-2 rounded-md text-[11px] text-[#5e5c68] hover:bg-[rgba(116,116,128,0.1)] flex items-center gap-1 transition-colors">
                          {s.icone}{s.acao}
                        </button>
                      ))}
                      <button onClick={() => salvar(ideias.filter(x => x.id !== i.id))} aria-label="Apagar ideia"
                        className="h-6 w-6 grid place-items-center rounded-md text-[#c7c7cc] hover:text-[#d33a3c] hover:bg-[#d33a3c]/10 transition-colors">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </Cartao>
          )
        })}
      </div>
    </Pagina>
  )
}
