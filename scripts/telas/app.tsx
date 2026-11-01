// Telas principais com dados fictícios, para conferência visual (npm run telas).
import React from "react"
import { createRoot } from "react-dom/client"
import { CaixaView } from "@/app/components/CaixaView"
import { ConfigView } from "@/app/components/ConfigView"
import { CalibragemView } from "@/app/components/CalibragemView"
import { RotasProducao } from "@/app/components/RotasProducao"
import { ThemeProvider } from "@/app/components/ThemeProvider"
import AprovarClient from "@/app/aprovar/[numero]/AprovarClient"
import MobilePage from "@/app/mobile/page"
import { calcular } from "@/app/calculos"
import { normalizarProducao } from "@/app/lib/producao"
import { montarPedidos } from "@/app/lib/negocio"
import { ModalDetalhe } from "@/app/components/ModalDetalhe"
import { FinanceiroView } from "@/app/components/FinanceiroView"
import { RelatoriosView } from "@/app/components/RelatoriosView"
import { IdeiasView } from "@/app/components/IdeiasView"
import PortalClient from "@/app/c/[token]/PortalClient"
import { ClientePerfilModal } from "@/app/components/ClientePerfilModal"
import { dados, config } from "./dados"
import { origemDoCliente } from "@/app/lib/coleta"
import { PrecoQueFecha } from "@/app/components/PrecoQueFecha"
import { ModalLancamento } from "@/app/components/FinanceiroView"

const tela = new URLSearchParams(location.search).get("tela") ?? "caixa"
// Abas do Financeiro: "financeiro-receber" abre a aba "receber"
if (tela.startsWith("financeiro-")) sessionStorage.setItem("fin:tab", tela.slice(11))

// O celular busca /api/data e /api/aprovacao/link: responde com os dados fictícios
const orig = window.fetch
window.fetch = async (url: RequestInfo | URL, o?: RequestInit) => {
  const u = String(url)
  if (u.startsWith("/api/data")) return new Response(JSON.stringify({ ...dados, config, clientes: [], propostasCustom: [] }))
  if (u.startsWith("/api/aprovacao/link")) return new Response(JSON.stringify({ url: "https://exemplo/aprovar/X?t=abc" }))
  if (u.startsWith("/api/")) return new Response("{}", { status: 404 })
  return orig(url, o)
}

function Telas() {
  const [cfg, setCfg] = React.useState(config)
  const [lancs, setLancs] = React.useState(dados.lancamentos)
  const [form, setForm] = React.useState(dados.historico[0].form)
  const pagina = (filho: React.ReactNode) => <div style={{ padding: 24, background: "#f5f5f7", minHeight: "100vh" }}><div className="max-w-[1320px] mx-auto">{filho}</div></div>
  switch (tela) {
    case "caixa": return pagina(<CaixaView kanban={dados.kanban} lancamentos={lancs} historico={dados.historico} config={cfg} onUpdateConfig={setCfg} onAddLancamento={l => setLancs(p => [l, ...p])} />)
    case "config": return <ThemeProvider><div style={{ height: "100vh" }}><ConfigView config={cfg} onSave={setCfg} onExportar={() => {}} onImportar={() => {}} clientes={["Cliente Relacionamento", "Outro Cliente"]} /></div></ThemeProvider>
    case "lancamento": return <ModalLancamento inicial={{ tipo: "despesa", descricao: "Impressão + Papel", valor: 3100 }} kanban={dados.kanban} onSave={() => {}} onClose={() => {}} />
    case "calibragem": return pagina(<CalibragemView kanban={dados.kanban} lancamentos={lancs} historico={dados.historico} config={cfg} onAtualizarConfig={setCfg} onDividir={() => {}} />)
    case "rotas": {
      const r = calcular(form, cfg)
      return pagina(r ? <RotasProducao calculo={r} form={form} producao={normalizarProducao(cfg.producao)} multiplicadorPadrao={cfg.multiplicadores.semFaca || 2}
        comFaca={form.comFaca} onOpcoes={o => setForm(f => ({ ...f, rota: o }))} onRegistrarFaca={() => {}} /> : <p>sem rota</p>)
    }
    case "aprovar": return <AprovarClient numero="ORC-2026-001" token="x" proposta={{
      nomeCliente: "Cliente Teste", sinalPct: cfg.sinalPct ?? 50, validaAte: "2099-12-31", vencida: false, jaAprovado: false,
      especificacoes: ["Caixa cartucho", "Dimensões: 15 × 20 × 8 cm (L × A × P)", "Material: Cartão 300g", "Verniz UV Total"],
      opcoes: [{ quantidade: 1000, preco: 3890, unitario: 3.89 }, { quantidade: 3000, preco: 6540, unitario: 2.18 }],
      caixa: { largura: 5.2, altura: 19, profundidade: 5.2, material: "Cartão 300g", verniz: true }, entregaSeAprovarHoje: "2026-11-24",
    }} />
    case "mobile": return <MobilePage />
    case "portal": {
      const hoje = new Date()
      const br = (n: number) => { const d = new Date(hoje); d.setDate(d.getDate() - n); return d.toLocaleDateString("pt-BR") + ", 10:00:00" }
      const etapas: Record<string, { coluna: number; dataHora: string; tipo: string }[]> = {
        "ANA-001": [1, 2, 3, 4, 5, 6, 7, 8, 9].map((c, i) => ({ coluna: c, dataHora: br(20 - i * 2), tipo: "coluna" })),
        "ORC-002": [1, 2, 3, 4, 5, 6, 7].map((c, i) => ({ coluna: c, dataHora: br(10 - i), tipo: "coluna" })),
        "ORC-003": [1, 2, 3, 4, 5].map((c, i) => ({ coluna: c, dataHora: br(5 - i), tipo: "coluna" })),
      }
      const pedidos = montarPedidos(dados.kanban, lancs).filter(p => ["Ana Cosméticos", "Bruno Perfumes", "Cliente Relacionamento", "Davi Chás"].includes(p.nomeCliente))
      return <PortalClient token="exemplo" dados={{ nome: "Ana Cosméticos", pedidos: pedidos.map(p => ({
        key: p.key, numero: p.numero, coluna: p.coluna, dataFechamento: p.dataFechamento ?? null, dataEntregaPrevista: p.dataEntregaPrevista ?? null, dataEntregaReal: p.coluna === 9 ? new Date(hoje.getTime() - 2 * 86_400_000).toLocaleDateString("sv-SE") : p.dataEntregaReal ?? null,
        venda: p.venda, recebido: p.venda - p.aReceber, aReceber: p.aReceber, quantidade: p.quantidade, nota: null,
        itens: p.cards.map(c => ({ numero: c.numero, dimensoes: c.dimensoes, material: c.materialNome, quantidade: c.quantidade })),
        etapas: etapas[p.numero] ?? [],
        arquivos: p.numero === "ORC-002" ? [
          { id: "f1", nome: "impressao.jpg", url: "../../../public/icon-512.png", tipo: "foto", quando: hoje.toISOString() },
          { id: "f2", nome: "arte-final.pdf", url: "#", tipo: "arte", quando: hoje.toISOString() },
        ] : [],
      })) }} />
    }
    case "perfil":
      return <ClientePerfilModal nome="Ana Cosméticos" cadastro={{ id: "x", nome: "Ana Cosméticos", telefone: "11999990000", criadoEm: "" }}
        itens={[]} propostas={[]} kanban={dados.kanban} lancamentos={lancs} onClose={() => {}} onReplicar={() => {}} onWhatsApp={() => {}} onSave={() => {}}
        origem={origemDoCliente("Ana Cosméticos", cfg.origensClientes, [])}
        onSalvarOrigem={o => setCfg({ ...cfg, origensClientes: o ? { "ana cosmeticos": o } : {} })} />
    case "ideias": return <div style={{ height: "100vh" }}><IdeiasView config={cfg} onSalvar={setCfg} /></div>
    case "precofecha": {
      const calc = calcular(dados.historico[3].form, cfg)!
      const base = dados.kanban[0]
      const mk = (i: number) => ({
        card: { ...base, id: `x${i}`, numero: `X-${i}`, nomeCliente: i % 3 ? `Novo ${i}` : "Ana Cosméticos" },
        desfecho: (i % 5 === 0 ? "ganho" : i % 7 === 0 ? "recusado" : "semResposta") as "ganho" | "recusado" | "semResposta",
        faixaQtd: (["1a3k", "3a6k", "6k+"] as const)[i % 3], markup: 1.7 + (i % 6) * 0.2, faixaMarkup: null, recorrente: i % 3 === 0, unitario: 1,
      })
      const linhas = Array.from({ length: 40 }, (_, i) => mk(i)).map(l => ({ ...l, desfecho: l.recorrente && l.desfecho !== "ganho" ? (l.card.numero.endsWith("3") ? "recusado" as const : "ganho" as const) : l.desfecho }))
      return <div style={{ padding: 24, background: "#f2f2f7", minHeight: "100vh" }}><PrecoQueFecha linhas={linhas} calculo={calc} comFaca={false} nomeCliente="Ana Cosméticos" kanban={dados.kanban} /></div>
    }
    case "relatorios": return <div style={{ height: "100vh" }}><RelatoriosView kanban={dados.kanban} lancamentos={lancs} clientes={[]} onAbrirCliente={() => {}}
      origensClientes={{ "ana cosmeticos": { canal: "indicacao", detalhe: "Bruno" }, "bruno perfumes": { canal: "instagram" } }} /></div>
    case "detalhe": {
      const c = dados.kanban.find(k => k.id === "c1")!
      return <ModalDetalhe data={{ tipo: "kanban", card: c }} parcFator={1.2} onClose={() => {}} lancamentos={lancs}
        pedido={montarPedidos(dados.kanban, lancs).find(p => p.cards.some(k => k.id === c.id))}
        onSaveDelivery={() => {}} onSaveDeliveryReal={() => {}} onSaveCloseDate={() => {}} onRegistrarSobra={() => {}} onEmitirOS={() => {}}
        onSaveCardExtras={() => {}} onSaveProjecao={() => {}} onSavePrazos={() => {}} onMoveEtapa={() => {}} onSavePreco={() => {}} />
    }
    case "detalhe-orcamento": {
      const h = { ...dados.historico[3], calculo: calcular(dados.historico[3].form, cfg)!, data: "01/11/2026, 10:00:00" }
      return <ModalDetalhe data={{ tipo: "historico", item: h }} parcFator={1.2} onClose={() => {}} onEditarHistorico={() => {}} onPersonalizarHistorico={() => {}} />
    }
    default:
      if (tela.startsWith("financeiro-")) return <div style={{ height: "100vh" }}><FinanceiroView lancamentos={lancs} kanban={dados.kanban} negocios={[]} lotes={[]} config={cfg} historico={dados.historico}
        onAdd={l => setLancs(p => [l, ...p])} onUpdate={() => {}} onDelete={() => {}} onUpdateConfig={setCfg} onRegistrarSobra={() => {}} /></div>
      return <p>tela desconhecida: {tela}</p>
  }
}

createRoot(document.getElementById("root")!).render(<Telas />)
