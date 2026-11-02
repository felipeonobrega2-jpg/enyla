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
import { EnviarWhatsapp } from "@/app/components/EnviarWhatsapp"
import { PainelToken } from "@/app/components/MetaAdsView"
import { FilaMensagens } from "@/app/components/FilaMensagens"
import WhatsAppView, { ConexaoWhats, Compositor, ClienteDaConversa, SeloOrigem, OrigemDaConversa, FunilConversas } from "@/app/components/WhatsAppView"

const tela = new URLSearchParams(location.search).get("tela") ?? "caixa"
// Abas do Financeiro: "financeiro-receber" abre a aba "receber"
if (tela.startsWith("financeiro-")) sessionStorage.setItem("fin:tab", tela.slice(11))

// O celular busca /api/data e /api/aprovacao/link: responde com os dados fictícios
const orig = window.fetch
window.fetch = async (url: RequestInfo | URL, o?: RequestInit) => {
  const u = String(url)
  if (u.startsWith("/api/data")) return new Response(JSON.stringify({ ...dados, config, clientes: [], propostasCustom: [] }))
  if (u.startsWith("/api/aprovacao/link")) return new Response(JSON.stringify({ url: "https://exemplo/aprovar/X?t=abc" }))
  if (u.startsWith("/api/cliente/link")) return new Response(JSON.stringify({ url: "https://exemplo/c/abc" }))
  if (u.startsWith("/api/whatsapp/rapidas")) return new Response(JSON.stringify([
    { id: "1", atalho: "/m1", quando_usar: "Primeiro contato", corpo: "Olá, {{nome}}! Aqui é da Enyla Embalagens. Você está buscando embalagens para qual produto?", ativa: true, ordem: 1 },
    { id: "2", atalho: "/pix", quando_usar: "Cobrar sinal", corpo: "Oi {{nome}}! Segue sua página com o Pix: {{pagina_cliente}}", ativa: true, ordem: 2 },
    { id: "3", atalho: "/m4", quando_usar: "Lead frio", corpo: "Olá {{nome}}! Passando pra saber se ainda tem interesse nas embalagens.", ativa: false, ordem: 4 },
  ]))
  if (u.startsWith("/api/whatsapp/conversas")) {
    const h = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString()
    const c = (jid: string, nome: string, msg: string, rec: number, env: number | null, extra = {}) => ({ jid, nome, ultima_msg: msg, ultima_at: h(Math.min(rec, env ?? 99)), nao_lidas: 0, foto_url: null, ultima_recebida_at: h(rec), ultima_enviada_at: env == null ? null : h(env), ...extra })
    return new Response(JSON.stringify([
      c("1@lid", "Camilo", "Quanto fica 2 mil caixinhas de 100ml?", 0.01, 0.2, { nao_lidas: 2, campanha: JSON.stringify({ canal: "anuncio" }) }),
      c("2@lid", "Raniere Péricles", "Fechou, manda o pix", 0.05, 0.1, { nao_lidas: 1 }),
      c("3@lid", "Bia Doces", "Vou ver com meu sócio", 1.2, 1),
      c("4@lid", "Hassan", "Bora, bora", 2, 1.5),
      c("5@lid", "Ana Cosméticos", "Perfeito, pode seguir", 3, 2.5, { campanha: JSON.stringify({ canal: "site" }) }),
      c("6@lid", "Juliana", "ok", 4, 3.5),
    ]))
  }
  if (u.startsWith("/api/whatsapp/mensagens/")) {
    const h = (m: number) => new Date(Date.now() - m * 60_000).toISOString()
    const m = (id: string, eu: boolean, corpo: string, min: number) => ({ id, jid: "1@lid", from_me: eu, corpo, tipo: "text", media_url: null, ts: h(min), kanban_card_id: null, status: eu ? "lida" : null })
    return new Response(JSON.stringify([
      m("a", false, "Olá, Gostaria se saber mais sobre as caixinhas.", 400), m("b", true, "Olá, tudo bem? Aqui é o Felipe, Gerente Comercial da Jerograf 👋 Vou cuidar pessoalmente do seu pedido.", 395),
      m("c", true, "Você já tá vendendo seu produto ou tá lançando agora? E que volume você precisa?", 394),
      m("d", false, "Já vendo, perfume árabe 100ml", 30), m("e", false, "Quanto fica 2 mil caixinhas de 100ml?", 15),
    ]))
  }
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
    case "metatoken": return pagina(<div className="space-y-4">
      <PainelToken status={{ hasToken: true, valido: false, erro: "O token já venceu.", canAutoRefresh: false }} expirou novo="" setNovo={() => {}} salvando={false} onSalvar={() => {}} msg={null} />
      <PainelToken status={{ hasToken: true, valido: true, daysLeft: 5, canAutoRefresh: false }} expirou={false} novo="" setNovo={() => {}} salvando={false} onSalvar={() => {}} msg={null} />
      <PainelToken status={{ hasToken: true, valido: true, permanente: true, tipo: "SYSTEM_USER", canAutoRefresh: false }} expirou={false} novo="" setNovo={() => {}} salvando={false} onSalvar={() => {}} msg="ok:Token permanente salvo. Não vai mais vencer." />
    </div>)
    case "whats": return pagina(<ConexaoWhats onAtualizar={() => {}} status={{ segredoConfigurado: true, totalConversas: 0,
      evolution: { configurado: true, alcancavel: true, autorizado: true, conectado: false, estado: "close", webhookOk: false, webhookDestino: "evolution-api-production.up.railway.app/webhook", host: "evo.enyla.com.br" } }} />)
    case "compositor": return <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#efeae2" }}><div style={{ flex: 1 }} /><Compositor jid="x" contato="Raniere" cliente="Raniere Péricles" onOtimista={() => {}} onResultado={() => {}} /></div>
    case "wacliente": {
      const resumo = new Map([["raniere pericles", { pedidos: 5, vendido: 27561, deve: 9540 }]])
      return pagina(<div className="space-y-8 bg-white p-6 rounded-xl">
        <ClienteDaConversa cliente={{ nome: "Raniere Péricles", manual: false }} resumo={resumo} clientes={["Raniere Péricles", "Ana"]} onVincular={() => {}} onAbrir={() => {}} />
        <ClienteDaConversa cliente={null} resumo={resumo} clientes={["Raniere Péricles", "Ana"]} onVincular={() => {}} />
        <div className="flex gap-2 items-center"><span className="text-[13px] font-semibold">Camilo</span><SeloOrigem campanha={JSON.stringify({ canal: "anuncio", campanhaNome: "(JEROGRAF) - TESTAR NOVAMENTE Campanha" })} /><SeloOrigem campanha={JSON.stringify({ canal: "site" })} /></div>
        <OrigemDaConversa campanha={JSON.stringify({ canal: "anuncio", campanhaNome: "(JEROGRAF) - TESTAR NOVAMENTE Campanha", provavel: true })} />
      </div>)
    }
    case "funil": case "funil-espiar": {
      const hj = new Date("2026-11-02T12:00:00Z"), h = (d: number) => new Date(hj.getTime() - d * 86_400_000).toISOString()
      const anuncio = JSON.stringify({ canal: "anuncio", campanhaNome: "TESTAR NOVAMENTE" }), site = JSON.stringify({ canal: "site" })
      const cv = (jid: string, nome: string, msg: string, rec: number, env: number | null, campanha?: string, extra = {}) =>
        ({ jid, nome, ultima_msg: msg, ultima_at: h(Math.min(rec, env ?? 99)), nao_lidas: 0, foto_url: null, campanha, ultima_recebida_at: h(rec), ultima_enviada_at: env == null ? null : h(env), ...extra })
      const conversas = [
        cv("1@lid", "Camilo", "Olá, Gostaria se saber mais sobre as caixinhas.", 0.1, null, anuncio),
        cv("2@lid", "Bia Doces", "Quanto fica 500?", 0.3, 1, site),
        cv("3@lid", "Marcos", "[audioMessage]", 2, 1.5, anuncio),
        cv("4@lid", "Juliana", "Vou ver com meu sócio", 5, 4, anuncio),
        cv("5@lid", "Ana Cosméticos", "Perfeito, pode seguir", 1, 0.5, undefined),
        cv("6@lid", "Carla Velas", "Recebi a proposta", 0.2, 1, anuncio),
        cv("7@lid", "Pedro", "ok", 20, 19, site),
        cv("8@lid", "Rafa", "Fechado então", 3, 2, anuncio, { status_lead: "negociando", ultima_classificacao_at: h(2), etiquetas: ["Atacado"] }),
        cv("9@lid", "Lúcia", "Mandei a arte", 1, 0.5, site, { etiquetas: ["Amostra enviada", "VIP"] }),
      ]
      const nomes = ["Ana Cosméticos", "Carla Velas"]
      return <div style={{ height: "100vh" }}><FunilConversas hoje={hj} conversas={conversas} onAbrir={() => {}} onMover={() => {}} onFechar={() => {}}
        etiquetasDef={[{ nome: "Atacado", cor: "#2f7cf6" }, { nome: "VIP", cor: "#c57800" }, { nome: "Amostra enviada", cor: "#009351" }]}
        clienteDe={c => nomes.includes(c.nome) ? { nome: c.nome } : null}
        cardsDe={c => dados.kanban.filter(k => k.nomeCliente === c.nome)} /></div>
    }
    case "fila": case "fila-m": {
      const h = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString()
      const cv = (jid: string, nome: string, rec: number, env: number, extra = {}) => ({ jid, nome, ultima_recebida_at: h(rec), ultima_enviada_at: h(env), ...extra })
      const kanban = [...dados.kanban, { ...dados.kanban[0], id: "kx", numero: "ORC-2026-301", nomeCliente: "Maria Perfumes", coluna: 5, dataFechamento: h(5).slice(0, 10), dataEntregaReal: undefined },
        { ...dados.kanban[0], id: "ky", numero: "ORC-2026-298", nomeCliente: "Ana Cosméticos", coluna: 8, dataFechamento: h(9).slice(0, 10), dataEntregaReal: undefined }]
      return <div style={{ height: "100vh" }}><FilaMensagens kanban={kanban} lancamentos={lancs} onAvisado={() => {}} onDispensar={() => {}} onAbrirConversa={() => {}}
        conversas={[cv("1@lid", "Juliana", 5, 4), cv("2@lid", "rafael souza", 10, 8), cv("3@lid", "Bia Doces", 6, 3.5), cv("4@lid", "Maria Perfumes", 6, 5)]} /></div>
    }
    case "whatsview": case "whatsview-espiar": return <div style={{ height: "100vh" }}><WhatsAppView onCriarCard={() => {}} kanban={dados.kanban} lancamentos={lancs} /></div>
    case "enviar": return <div style={{ height: "100vh" }}><EnviarWhatsapp envio={{ cliente: "Raniere Péricles", texto: "Olá! Tudo bem? Passando para saber se conseguiu ver a proposta ORC-2026-233. Ficou alguma dúvida sobre quantidade ou acabamento? Posso te ajudar a escolher." }} linkWhatsapp="https://wa.me/" onFechar={() => {}} /></div>
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
