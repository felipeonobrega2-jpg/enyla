"use client"

// Gráfica virtual (link de acompanhamento): a linha de produção da ENYLA ilustrada, setor por setor, com as máquinas
// animadas e o pedido do cliente parado no setor em que está. Opcional: o cliente escolhe ver (a página continua sóbria).

import { useEffect, useRef, useState } from "react"

type Setor = { id: string; nome: string; colunas: number[]; texto: string }
export const SETORES: Setor[] = [
  { id: "plan", nome: "Planejamento", colunas: [1], texto: "Seu pedido entrou na agenda: conferimos medidas, material e prazo, e reservamos o papel." },
  { id: "pre", nome: "Pré-impressão", colunas: [2, 3], texto: "A arte é ajustada na faca (o molde da caixa) e vai para você aprovar. Depois, vira chapa de impressão." },
  { id: "fila", nome: "Fila de máquina", colunas: [4], texto: "Arte aprovada! O papel já está cortado no tamanho da máquina e o seu pedido espera a vez de imprimir." },
  { id: "imp", nome: "Impressão", colunas: [5], texto: "A impressora offset passa as quatro cores (ciano, magenta, amarelo e preto), folha por folha." },
  { id: "uv", nome: "Verniz UV", colunas: [6], texto: "O verniz é aplicado e secado na hora pela luz UV: dá brilho e protege a impressão." },
  { id: "acab", nome: "Acabamento", colunas: [7], texto: "A faca corta e vinca cada folha, e a coladeira dobra e cola as caixinhas, uma a uma." },
  { id: "exp", nome: "Expedição", colunas: [8, 9], texto: "Caixas conferidas e embaladas no palete, prontas para sair até você." },
]
export const setorDaColuna = (coluna: number) => Math.max(0, SETORES.findIndex(s => s.colunas.includes(coluna)))

const W = 200            // largura de cada setor
const CHAO = 300         // linha do chão
const ROXO = "#7c4ee4", ROXO_E = "#4b2a9e", VERDE = "#16a46c", PELE = "#f2c6a0"

function Pessoa({ x, y, camisa, cabelo = "#3b2a20", vira = false, anim }: { x: number; y: number; camisa: string; cabelo?: string; vira?: boolean; anim?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${vira ? -1 : 1} 1)`}><g className={anim}>
      <ellipse cx={0} cy={0} rx={14} ry={4} fill="#000" opacity={0.12} />
      <rect x={-7} y={-26} width={6} height={24} rx={3} fill="#2c2a3a" /><rect x={1} y={-26} width={6} height={24} rx={3} fill="#2c2a3a" />
      <path d={`M-12 -28 Q-12 -52 0 -52 Q12 -52 12 -28 Z`} fill={camisa} />
      <rect x={-13} y={-50} width={6} height={20} rx={3} fill={camisa} className="gv-braco" />
      <circle cx={0} cy={-62} r={10} fill={PELE} />
      <path d="M-10 -63 Q-10 -74 0 -74 Q11 -74 10 -62 Q4 -68 -10 -63 Z" fill={cabelo} />
      <circle cx={4} cy={-62} r={1.3} fill="#2c2a3a" />
    </g></g>
  )
}

// Cada setor desenhado no seu espaço (0..200), com o chão em y=300
function Maquinas({ id, ativo }: { id: string; ativo: boolean }) {
  const a = (c: string) => ativo ? c : undefined
  switch (id) {
    case "plan": return (
      <g>
        <rect x={28} y={70} width={144} height={92} rx={8} fill="#fff" stroke="#e3dff0" strokeWidth={2} />
        {[0, 1, 2].map(c => <rect key={c} x={38 + c * 46} y={80} width={36} height={6} rx={3} fill="#d9d3ec" />)}
        {[[0, 0, "#ffd66b"], [0, 1, "#a8e6c8"], [1, 0, "#c7b6ff"], [1, 1, "#ffb3c7"], [2, 0, "#9fd3ff"]].map(([c, r, cor], i) =>
          <rect key={i} x={40 + (c as number) * 46} y={94 + (r as number) * 30} width={32} height={22} rx={4} fill={cor as string} className={i === 2 ? a("gv-postit") : undefined} />)}
        <rect x={40} y={226} width={120} height={10} rx={3} fill="#c9a072" /><rect x={48} y={236} width={6} height={64} fill="#9c7650" /><rect x={146} y={236} width={6} height={64} fill="#9c7650" />
        <rect x={70} y={206} width={44} height={20} rx={3} fill="#3a3648" /><rect x={74} y={209} width={36} height={14} rx={2} fill={ativo ? "#9fd3ff" : "#5a5670"} className={a("gv-tela")} />
        <rect x={64} y={226} width={56} height={3} rx={1.5} fill="#8d8aa0" />
        <Pessoa x={140} y={300} camisa={ROXO} anim={a("gv-respira")} vira />
      </g>
    )
    case "pre": return (
      <g>
        <rect x={14} y={214} width={110} height={10} rx={3} fill="#c9a072" /><rect x={22} y={224} width={6} height={76} fill="#9c7650" /><rect x={110} y={224} width={6} height={76} fill="#9c7650" />
        <rect x={30} y={150} width={78} height={56} rx={6} fill="#2c2a3a" /><rect x={35} y={155} width={68} height={44} rx={3} fill="#f7f5ff" />
        {/* planificação da caixa sendo desenhada */}
        <path d="M50 165 h20 v12 h12 v12 h-12 v12 h-20 v-12 h-12 v-12 h12 Z M50 177 h20 M50 189 h20" fill="none" stroke={ROXO} strokeWidth={1.6} strokeDasharray="160" className={a("gv-desenha")} />
        <rect x={64} y={206} width={10} height={8} fill="#2c2a3a" /><rect x={56} y={212} width={26} height={3} rx={1.5} fill="#2c2a3a" />
        <Pessoa x={70} y={300} camisa="#e07b1f" cabelo="#1d1d24" anim={a("gv-respira")} />
        {/* CTP: chapa saindo */}
        <rect x={132} y={200} width={58} height={100} rx={8} fill="#dfe3ec" stroke="#c4c9d6" strokeWidth={2} />
        <rect x={140} y={212} width={42} height={8} rx={3} fill="#3a3648" />
        <rect x={142} y={214} width={38} height={4} rx={2} fill="#9fe3c4" className={a("gv-pisca")} />
        <rect x={138} y={232} width={46} height={6} rx={2} fill="#b8bfcc" />
        <g className={a("gv-chapa")}><rect x={140} y={238} width={42} height={30} rx={2} fill="#c9d4e6" stroke="#9aa6bd" /><rect x={146} y={244} width={20} height={12} rx={1} fill="#7c8db0" opacity={0.6} /></g>
        <circle cx={176} cy={284} r={4} fill={VERDE} className={a("gv-pisca")} />
      </g>
    )
    case "fila": return (
      <g>
        {[0, 1].map(p => (
          <g key={p} transform={`translate(${22 + p * 86} 0)`}>
            <rect x={0} y={288} width={70} height={12} rx={2} fill="#b5895c" />
            {Array.from({ length: 8 }, (_, i) => <rect key={i} x={4 + (i % 2)} y={276 - i * 9} width={62} height={8} rx={1.5} fill={i % 2 ? "#ffffff" : "#f3f1f8"} stroke="#e1ddea" strokeWidth={1} />)}
            <rect x={14} y={196} width={42} height={18} rx={4} fill={p === 0 ? "#ffd66b" : "#e9e6f2"} />
            <text x={35} y={209} textAnchor="middle" fontSize={10} fontWeight={700} fill="#4a4658">{p === 0 ? "PRÓXIMO" : "AGUARDA"}</text>
          </g>
        ))}
        <Pessoa x={100} y={300} camisa="#c98a12" cabelo="#2a1a12" anim={a("gv-respira")} />
        <g transform="translate(100 168)">
          <circle r={16} fill="#fff" stroke="#e3dff0" strokeWidth={3} />
          <line x1={0} y1={0} x2={0} y2={-10} stroke="#3a3648" strokeWidth={2.5} strokeLinecap="round" className={a("gv-ponteiro")} />
          <line x1={0} y1={0} x2={7} y2={0} stroke="#3a3648" strokeWidth={2.5} strokeLinecap="round" />
        </g>
      </g>
    )
    case "imp": return (
      <g>
        {/* corpo da offset de 4 cores */}
        <rect x={8} y={176} width={184} height={124} rx={10} fill="url(#gv-metal)" stroke="#cdd2de" strokeWidth={2} />
        <rect x={8} y={176} width={184} height={16} rx={8} fill="#d6dbe6" />
        {["#00a3e0", "#e6007e", "#ffd400", "#2c2a3a"].map((cor, i) => (
          <g key={i} transform={`translate(${30 + i * 40} 0)`}>
            <rect x={-14} y={150} width={28} height={30} rx={5} fill={cor} />
            <circle cx={0} cy={228} r={13} fill="#b9c0cf" stroke="#9aa3b5" strokeWidth={2} />
            <g className={a("gv-gira")}><line x1={-11} y1={228} x2={11} y2={228} stroke="#7d8699" strokeWidth={2} /><line x1={0} y1={217} x2={0} y2={239} stroke="#7d8699" strokeWidth={2} /></g>
          </g>
        ))}
        <rect x={14} y={250} width={172} height={6} rx={3} fill="#9aa3b5" />
        {/* folhas atravessando */}
        {ativo && [0, 1, 2].map(i => <rect key={i} x={0} y={243} width={26} height={5} rx={1} fill="#fff" stroke="#c9cfdb" className="gv-folha" style={{ animationDelay: `${i * 0.9}s` }} />)}
        <rect x={136} y={268} width={36} height={24} rx={3} fill="#fff" stroke="#d9d4e8" />
        <rect x={138} y={262} width={32} height={6} rx={1} fill="url(#gv-cmyk)" />
        <Pessoa x={40} y={300} camisa="#1f6fd1" cabelo="#6b3e1d" anim={a("gv-respira")} />
      </g>
    )
    case "uv": return (
      <g>
        <rect x={20} y={214} width={160} height={86} rx={10} fill="url(#gv-metal)" stroke="#cdd2de" strokeWidth={2} />
        <path d="M54 214 L70 176 H130 L146 214 Z" fill="#3a3648" />
        <rect x={74} y={206} width={52} height={8} rx={4} fill="#b48cff" className={a("gv-uv")} />
        {ativo && <path d="M60 214 L140 214 L150 250 L50 250 Z" fill="#b48cff" opacity={0.25} className="gv-uv" />}
        <rect x={26} y={250} width={148} height={6} rx={3} fill="#9aa3b5" />
        {ativo && [0, 1].map(i => <rect key={i} x={20} y={243} width={30} height={6} rx={1} fill="#fff" stroke="#d3cbe8" className="gv-folha-uv" style={{ animationDelay: `${i * 1.3}s` }} />)}
        <circle cx={160} cy={232} r={5} fill={ativo ? "#b48cff" : "#9aa3b5"} className={a("gv-pisca")} />
        <Pessoa x={186} y={300} camisa="#16a46c" cabelo="#d9b44a" anim={a("gv-respira")} vira />
      </g>
    )
    case "acab": return (
      <g>
        {/* corte e vinco (prensa) */}
        <rect x={12} y={150} width={86} height={150} rx={8} fill="url(#gv-metal)" stroke="#cdd2de" strokeWidth={2} />
        <g className={a("gv-prensa")}><rect x={22} y={176} width={66} height={16} rx={3} fill="#5a5670" /><rect x={26} y={192} width={58} height={4} fill="#c9a072" /></g>
        <rect x={22} y={238} width={66} height={10} rx={2} fill="#fff" stroke="#d9d4e8" />
        <rect x={20} y={248} width={70} height={8} rx={2} fill="#7d8699" />
        {/* coladeira com esteira */}
        <rect x={102} y={250} width={94} height={18} rx={6} fill="#d6dbe6" />
        <rect x={104} y={252} width={90} height={6} rx={3} fill="#3a3648" className={a("gv-esteira")} strokeDasharray="6 6" stroke="#5a5670" />
        {ativo && [0, 1, 2].map(i => <g key={i} className="gv-caixinha" style={{ animationDelay: `${i * 1.1}s` }}><rect x={100} y={238} width={16} height={12} rx={2} fill="#c79ff5" stroke={ROXO} strokeWidth={1} /></g>)}
        <rect x={112} y={268} width={6} height={32} fill="#9aa3b5" /><rect x={182} y={268} width={6} height={32} fill="#9aa3b5" />
        <Pessoa x={150} y={300} camisa="#d4497b" cabelo="#5a3825" anim={a("gv-respira")} />
      </g>
    )
    case "exp": return (
      <g>
        <rect x={14} y={288} width={86} height={12} rx={2} fill="#b5895c" />
        {[[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [1, 2]].map(([c, r], i) => (
          <g key={i} transform={`translate(${18 + c * 27} ${262 - r * 26})`}><rect width={26} height={25} rx={2} fill="#d3a46e" stroke="#b8885a" /><rect x={10} width={6} height={25} fill={ROXO} opacity={0.8} /></g>
        ))}
        {/* van da ENYLA */}
        <g className={a("gv-van")}>
          <path d="M108 296 V236 Q108 228 116 228 H170 Q178 228 182 238 L194 262 V296 Z" fill="#fff" stroke="#d9d4e8" strokeWidth={2} />
          <path d="M172 236 L186 262 H172 Z" fill="#bfe3ff" />
          <rect x={116} y={254} width={50} height={14} rx={3} fill={ROXO} /><text x={141} y={265} textAnchor="middle" fontSize={9.5} fontWeight={800} fill="#fff" letterSpacing={1}>ENYLA</text>
          <g className={a("gv-roda")}><circle cx={128} cy={298} r={9} fill="#2c2a3a" /><circle cx={128} cy={298} r={3.5} fill="#cfd3dd" /></g>
          <g className={a("gv-roda")}><circle cx={178} cy={298} r={9} fill="#2c2a3a" /><circle cx={178} cy={298} r={3.5} fill="#cfd3dd" /></g>
        </g>
      </g>
    )
  }
  return null
}

export default function GraficaVirtual({ coluna, numero, quantidade }: { coluna: number; numero: string; quantidade?: number }) {
  const atual = setorDaColuna(coluna)
  const entregue = coluna >= 9
  const [aberto, setAberto] = useState(atual)
  const rolagem = useRef<HTMLDivElement>(null)
  // Centraliza o setor do pedido (e o escolhido) na tela
  useEffect(() => {
    const el = rolagem.current
    if (!el) return
    const svgW = el.scrollWidth
    const x = (aberto + 0.5) / SETORES.length * svgW - el.clientWidth / 2
    el.scrollTo({ left: Math.max(0, x), behavior: "smooth" })
  }, [aberto])
  const setor = SETORES[aberto]

  return (
    <div className="rounded-2xl overflow-hidden bg-white border border-[rgba(0,0,0,0.06)] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div ref={rolagem} className="overflow-x-auto overscroll-x-contain gv-rolagem" style={{ scrollbarWidth: "none" }}>
        <svg viewBox={`0 0 ${W * SETORES.length} 400`} className="block h-[300px] sm:h-[340px] w-auto max-w-none" role="img" aria-label={`Gráfica virtual: seu pedido está em ${SETORES[atual].nome}`}>
          <defs>
            <linearGradient id="gv-parede" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f6f3ff" /><stop offset="1" stopColor="#ebe6fb" /></linearGradient>
            <linearGradient id="gv-chao" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#d9d4e6" /><stop offset="1" stopColor="#c9c3da" /></linearGradient>
            <linearGradient id="gv-cmyk" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#00a3e0" /><stop offset=".33" stopColor="#e6007e" /><stop offset=".66" stopColor="#ffd400" /><stop offset="1" stopColor="#2c2a3a" /></linearGradient>
            <linearGradient id="gv-ceu" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8fd0f5" /><stop offset="1" stopColor="#d7efff" /></linearGradient>
            <linearGradient id="gv-metal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f3f5f9" /><stop offset="1" stopColor="#d6dbe6" /></linearGradient>
            <radialGradient id="gv-luz" cx="0.5" cy="0" r="0.9"><stop offset="0" stopColor="#fff7d6" stopOpacity="0.9" /><stop offset="1" stopColor="#fff7d6" stopOpacity="0" /></radialGradient>
          </defs>
          {/* prédio: parede, janelas, chão e a faixa amarela da fábrica */}
          <rect x={0} y={0} width={W * SETORES.length} height={CHAO} fill="url(#gv-parede)" />
          {/* painéis da parede e rodapé */}
          {Array.from({ length: 6 }, (_, i) => <rect key={`p${i}`} x={0} y={150 + i * 25} width={W * SETORES.length} height={1} fill="#e2dcf3" />)}
          <rect x={0} y={CHAO - 26} width={W * SETORES.length} height={26} fill="#e4def4" />
          {/* janelões com céu (luz entrando) */}
          {Array.from({ length: SETORES.length }, (_, i) => i === 0 ? null : (
            <g key={`j${i}`} transform={`translate(${i * W + 24} 82)`} opacity={0.95}>
              <rect width={152} height={56} rx={6} fill="#5b4f7a" />
              <rect x={3} y={3} width={146} height={50} rx={4} fill="url(#gv-ceu)" />
              {[1, 2, 3].map(k => <rect key={k} x={3 + k * 36.5} y={3} width={2} height={50} fill="#5b4f7a" />)}
              <rect x={3} y={27} width={146} height={2} fill="#5b4f7a" />
              <ellipse cx={30 + (i % 3) * 30} cy={18} rx={12} ry={4} fill="#fff" opacity={0.85} className="gv-nuvem" />
            </g>
          ))}
          {/* treliça do teto */}
          <rect x={0} y={0} width={W * SETORES.length} height={10} fill="#4a3f6b" />
          {Array.from({ length: SETORES.length * 4 }, (_, i) => <path key={`t${i}`} d={`M${i * 50} 10 L${i * 50 + 25} 30 L${i * 50 + 50} 10`} fill="none" stroke="#6a5e8f" strokeWidth={2} />)}
          <rect x={0} y={28} width={W * SETORES.length} height={3} fill="#6a5e8f" />
          <rect x={0} y={CHAO} width={W * SETORES.length} height={100} fill="url(#gv-chao)" />
          {Array.from({ length: SETORES.length * 7 }, (_, i) => <rect key={`l${i}`} x={i * 28 + (i % 2) * 6} y={CHAO + 54} width={1.5} height={46} fill="#bfb7d3" />)}
          <rect x={0} y={CHAO + 54} width={W * SETORES.length} height={1.5} fill="#bfb7d3" />
          <rect x={0} y={CHAO} width={W * SETORES.length} height={3} fill="#b8b0cc" />
          <rect x={0} y={352} width={W * SETORES.length} height={4} fill="#ffd400" opacity={0.75} />
          {/* esteira que liga tudo */}
          <rect x={10} y={318} width={W * SETORES.length - 20} height={14} rx={7} fill="#5a5670" />
          <rect x={14} y={321} width={W * SETORES.length - 28} height={8} rx={4} fill="none" stroke="#8d8aa0" strokeWidth={2} strokeDasharray="10 8" className="gv-esteira" />

          {SETORES.map((s, i) => {
            const x0 = i * W, feito = i < atual || entregue, ativo = i === atual && !entregue, futuro = i > atual
            return (
              <g key={s.id} transform={`translate(${x0} 0)`} onClick={() => setAberto(i)} style={{ cursor: "pointer" }}>
                {i > 0 && <rect x={-1} y={30} width={2} height={CHAO - 30} fill="#ddd6ef" />}
                {ativo && <rect x={0} y={0} width={W} height={CHAO} fill="url(#gv-luz)" className="gv-spot" />}
                {/* luminária */}
                <rect x={W / 2 - 1} y={0} width={2} height={18} fill="#b8b0cc" /><path d={`M${W / 2 - 16} 18 H${W / 2 + 16} L${W / 2 + 10} 28 H${W / 2 - 10} Z`} fill={ativo ? "#ffd66b" : "#d6cfe8"} />
                <ellipse cx={W / 2} cy={CHAO + 2} rx={86} ry={7} fill="#000" opacity={0.08} />
                <g opacity={futuro ? 0.42 : 1} style={{ filter: futuro ? "grayscale(0.7)" : undefined }}>
                  <Maquinas id={s.id} ativo={ativo || (entregue && s.id === "exp")} />
                </g>
                {/* placa do setor */}
                <g transform={`translate(${W / 2} 40)`}>
                  <rect x={-74} y={0} width={148} height={26} rx={13} fill={ativo ? ROXO : feito ? "#fff" : "#f4f2fa"} stroke={ativo ? ROXO : feito ? "#c9efdc" : "#e6e1f1"} strokeWidth={1.5} />
                  <circle cx={-60} cy={13} r={8} fill={feito ? VERDE : ativo ? "#fff" : "#d8d2e8"} />
                  {feito ? <path d="M-64 13 l3 3 l6 -6" stroke="#fff" strokeWidth={2} fill="none" strokeLinecap="round" />
                    : <text x={-60} y={17} textAnchor="middle" fontSize={10} fontWeight={800} fill={ativo ? ROXO : "#8d8aa0"}>{i + 1}</text>}
                  <text x={6} y={17} textAnchor="middle" fontSize={12} fontWeight={700} fill={ativo ? "#fff" : feito ? "#1d1a29" : "#9a97a5"}>{s.nome}</text>
                </g>
              </g>
            )
          })}

          {/* o pedido do cliente, no setor em que está */}
          {(() => {
            const cx = (entregue ? SETORES.length - 0.5 : atual + 0.5) * W
            return (
              <g transform={`translate(${cx} 0)`}>
                <g className={entregue ? undefined : "gv-pedido"}>
                  <ellipse cx={0} cy={318} rx={26} ry={4} fill="#000" opacity={0.15} />
                  <rect x={-24} y={286} width={48} height={32} rx={4} fill="#d3a46e" stroke="#b8885a" strokeWidth={1.5} />
                  <rect x={-24} y={296} width={48} height={9} fill={ROXO} />
                  <text x={0} y={303.5} textAnchor="middle" fontSize={7} fontWeight={800} fill="#fff" letterSpacing={0.6}>SEU PEDIDO</text>
                </g>
                {!entregue && <circle cx={0} cy={250} r={14} fill={ROXO} opacity={0.35} className="gv-pulso" />}
                <g className="gv-pino">
                  <path d="M0 278 C-4 268 -14 262 -14 250 A14 14 0 1 1 14 250 C14 262 4 268 0 278 Z" fill={entregue ? VERDE : ROXO} stroke="#fff" strokeWidth={2} />
                  {entregue ? <path d="M-6 250 l4 4 l8 -8" stroke="#fff" strokeWidth={2.6} fill="none" strokeLinecap="round" /> : <circle cx={0} cy={250} r={5} fill="#fff" />}
                </g>
                <g transform="translate(0 372)">
                  <rect x={-78} y={-11} width={156} height={22} rx={11} fill="#1d1a29" opacity={0.88} />
                  <text x={0} y={4} textAnchor="middle" fontSize={10.5} fontWeight={700} fill="#fff">{entregue ? "Entregue!" : `${numero}${quantidade ? ` · ${quantidade.toLocaleString("pt-BR")} un` : ""}`}</text>
                </g>
              </g>
            )
          })()}
        </svg>
      </div>

      {/* o que acontece no setor (toque para ver os outros) */}
      <div className="px-4 pt-3 pb-4 border-t border-[rgba(60,60,67,0.08)]">
        <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1" style={{ scrollbarWidth: "none" }}>
          {SETORES.map((s, i) => {
            const feito = i < atual || entregue, ativo = i === atual && !entregue
            return (
              <button key={s.id} onClick={() => setAberto(i)}
                className={`shrink-0 h-8 px-3 rounded-full text-[12px] font-semibold transition-all ${aberto === i ? "text-white" : ativo ? "text-[#7c4ee4] bg-[#7c4ee4]/10" : feito ? "text-[#16a46c] bg-[#16a46c]/10" : "text-[#8E8E93] bg-[rgba(116,116,128,0.08)]"}`}
                style={aberto === i ? { background: ativo ? ROXO : feito ? VERDE : "#8E8E93" } : undefined}>
                {feito ? "✓ " : ""}{s.nome}
              </button>
            )
          })}
        </div>
        <p key={aberto} className="text-[13.5px] leading-relaxed text-[#3a3648] gv-surge">
          <b className="text-[#1d1a29]">{setor.nome}{aberto === atual && !entregue ? " · seu pedido está aqui" : aberto < atual || entregue ? " · já passou por aqui" : " · ainda vai chegar"}.</b> {setor.texto}
        </p>
      </div>
    </div>
  )
}

// Botão "Ver na gráfica virtual" + a gráfica (escolha lembrada no aparelho do cliente; padrão: página sóbria)
export function GraficaVirtualOpcional({ coluna, numero, quantidade }: { coluna: number; numero: string; quantidade?: number }) {
  const [ver, setVer] = useState(false)
  useEffect(() => { try { setVer(localStorage.getItem("track:grafica") === "1") } catch { /* ok */ } }, [])
  const alternar = () => setVer(v => { try { localStorage.setItem("track:grafica", v ? "0" : "1") } catch { /* ok */ } return !v })
  if (coluna < 1 || coluna > 9) return null
  return (
    <div className="space-y-3">
      <button onClick={alternar}
        className="w-full flex items-center gap-3 rounded-2xl px-4 py-3 text-left bg-white border border-[rgba(0,0,0,0.06)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] active:scale-[0.99] transition">
        <span className="w-10 h-10 rounded-xl grid place-items-center shrink-0" style={{ background: "linear-gradient(135deg,#7c4ee4,#e6007e)" }}>
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M5 21V10l5 3V10l5 3V7l4 2v12" /></svg>
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[14px] font-semibold text-[#191625]">{ver ? "Gráfica virtual" : "Ver seu pedido na gráfica virtual"}</span>
          <span className="block text-[12px] text-[#8E8E93]">{ver ? "Toque para esconder" : "Veja em que máquina ele está agora"}</span>
        </span>
        <span className={`w-11 h-6 rounded-full p-0.5 transition-colors ${ver ? "bg-[#7c4ee4]" : "bg-[rgba(120,120,128,0.2)]"}`}>
          <span className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${ver ? "translate-x-5" : ""}`} />
        </span>
      </button>
      {ver && <div className="ds-entrada sm:relative sm:left-1/2 sm:-translate-x-1/2 sm:w-[min(1180px,calc(100vw-48px))]"><GraficaVirtual coluna={coluna} numero={numero} quantidade={quantidade} /></div>}
    </div>
  )
}
