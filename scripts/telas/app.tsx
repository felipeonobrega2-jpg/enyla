import { pendencias } from "../../app/lib/pendenciasDono"
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
import { EntregasView } from "@/app/components/EntregasView"
import { AvisoWhatsapp } from "@/app/components/AvisoWhatsapp"
import { PedidosUnificadoView } from "@/app/components/PedidosUnificadoView"
import AgenteLeadsCard from "@/app/components/AgenteLeadsCard"
import ContatosProtegidosCard from "@/app/components/ContatosProtegidosCard"
import ReativacaoCard from "@/app/components/ReativacaoCard"
import { HojeCard } from "@/app/components/HojeCard"
import { gerarHtmlOrcamentoCliente } from "@/app/pdf"
import { folhasDoHtml, htmlParaPdf } from "@/app/lib/pdfArquivo"
import { EnviarProposta } from "@/app/components/EnviarProposta"
import MarketingRelatorio from "@/app/components/MarketingRelatorio"
import { ParceriasView } from "@/app/components/ParceriasView"
import { ModalVenda } from "@/app/components/parceiros/ModalVenda"
import DigitalClient from "@/app/d/[id]/DigitalClient"
import GastosView from "@/app/components/GastosView"
import DigitalPainelView from "@/app/components/DigitalPainelView"
import ChapasView from "@/app/cartuxo/components/ChapasView"
import CustosView from "@/app/cartuxo/components/CustosView"
import FacasView from "@/app/cartuxo/components/FacasView"
import PedidosSiteView from "@/app/cartuxo/components/PedidosSiteView"
import SeletorArea from "@/app/cartuxo/components/SeletorArea"
import { alocar } from "@/app/cartuxo/lib/chapas"
import { montarGastos, ultimosDias } from "@/app/lib/gastos"
import { OrcamentoDigitalView } from "@/app/components/OrcamentoDigitalView"
import WhatsAppView, { ConexaoWhats, Compositor, ClienteDaConversa, SeloOrigem, OrigemDaConversa, FunilConversas, ConversaLateral } from "@/app/components/WhatsAppView"

const tela = new URLSearchParams(location.search).get("tela") ?? "caixa"
// Telas "-escuro": mesmo conteúdo no tema escuro
const escuro = tela.endsWith("-escuro")
if (escuro) document.documentElement.classList.add("dark")
// Abas do Financeiro: "financeiro-receber" abre a aba "receber"
if (tela.startsWith("financeiro-")) sessionStorage.setItem("fin:tab", tela.slice(11).replace(/-conta$/, ""))

// Microfones: simula um Mac com o iPhone por perto (Continuidade)
if (tela === "compositor-mic" && navigator.mediaDevices) navigator.mediaDevices.enumerateDevices = async () => [
  { kind: "audioinput", deviceId: "mac", label: "Microfone (MacBook Air)", groupId: "1" },
  { kind: "audioinput", deviceId: "iph", label: "Microfone do iPhone de Felipe", groupId: "2" },
] as MediaDeviceInfo[]

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
      c("5511977776666@s.whatsapp.net", "Raniere Péricles", "Bom dia, chegou?", 0.02, 0.5),
    ]))
  }
  if (u.startsWith("/api/pendencias")) {
    return new Response(JSON.stringify({ pendencias: pendencias({ env: { asaas: false, pluggy: true, lalamoveProducao: false, cronSecret: false }, pluggyItens: 1, metaSaldo: 0.49, metaDiasRestantes: 0, metaTokenExpira: "2026-12-31T00:00:00Z", metaTokenTipo: "usuario", iaRecargaEm: new Date().toISOString(), iaDiasRestantes: 11, designer: false, villa: false, videos: 0, feitos: {} }) }))
  }
  if (u.startsWith("/api/midia")) return new Response(JSON.stringify({ midia: [
    { id: "m1", url: "#", mime: "video/mp4", nome: "v1.mp4", descricao: "Caixa rígida preta sendo montada", tipo: "video", em: "2026-11-07", usos: 4, ativo: true },
    { id: "m2", url: "#", mime: "image/jpeg", nome: "f1.jpg", descricao: "Caixinhas 50 ml prontas, laminação fosca", tipo: "foto", em: "2026-11-07", usos: 0, ativo: false },
  ] }))
  if (u.startsWith("/api/d/") && /DIG-(ARTE|PROD|DZ)/.test(u)) {
    const arte = u.includes("ARTE"), prod = u.includes("PROD"), dz = u.includes("DZ")
    const img = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#191625"/><rect x="200" y="60" width="200" height="280" fill="#2a2440" stroke="#c9a96e" stroke-width="3"/><text x="300" y="210" fill="#c9a96e" font-family="Georgia" font-size="28" text-anchor="middle">Essência Rara</text></svg>')
    return new Response(JSON.stringify({ id: "DIG-0003", nome: "Ana Exemplo", ml: 50, produto: "perfume", medidas: { a: 10, l: 5, p: 5 }, padrao: true, folha: "A4",
      quantidade: 100, total: 619.95, sinal: 309.98, status: prod ? "producao" : "arte", sinalPagoEm: new Date().toISOString(),
      briefing: { marca: "Essência Rara", cores: "preto e dourado", referencias: "Nome grande na frente, linha fina dourada", laminacao: "fosca", arquivos: [{ nome: "logo-essencia.png", url: "#" }] },
      opcoes: [{ quantidade: 100, total: 619.95, unit: 6.2 }],
      arte: { url: img, nome: "arte-v2.svg", em: new Date().toISOString() }, aprovar: arte, arteAprovadaEm: prod ? new Date().toISOString() : null, arteEnviadaEm: dz ? null : new Date().toISOString(),
      ajustes: dz ? [{ texto: "Trocar o dourado por um tom mais claro e aumentar o nome", em: new Date().toISOString() }] : [],
      restante: prod ? 334.96 : null, frete: prod ? 25 : null, restantePagoEm: null, entrega: null, designer: dz }))
  }
  if (u.startsWith("/api/d/") && u.includes("ASAAS")) return new Response(JSON.stringify({ id: "DIG-0004", nome: "Ana Exemplo", ml: 50, produto: "perfume", medidas: { a: 10, l: 5, p: 5 }, padrao: true, folha: "A4",
    quantidade: 100, total: 619.95, sinal: 309.98, status: "aguardando_sinal", sinalPagoEm: null, briefing: { marca: "", cores: "", referencias: "", laminacao: "fosca", arquivos: [] },
    opcoes: [{ quantidade: 50, total: 419.95, unit: 8.4 }, { quantidade: 100, total: 619.95, unit: 6.2 }], arte: null, aprovar: false, arteAprovadaEm: null, arteEnviadaEm: null, ajustes: [], restante: null, frete: null, restantePagoEm: null, entrega: null, designer: false,
    asaas: true, documento: null, cobranca: null }))
  if (u.startsWith("/api/d/")) {
    const pago = u.includes("PAGO")
    return new Response(JSON.stringify({ id: pago ? "DIG-0002" : "DIG-0001", nome: "Ana Exemplo", ml: 50, produto: "perfume", medidas: { a: 10, l: 5, p: 5 }, padrao: true, folha: "A4",
      quantidade: 100, total: 619.95, sinal: 309.98, status: pago ? "sinal_pago" : "aguardando_sinal", sinalPagoEm: pago ? new Date().toISOString() : null,
      briefing: { marca: pago ? "Essência Rara" : "", cores: "", referencias: "", arquivos: pago ? [{ nome: "logo-essencia.png", url: "#" }] : [] },
      opcoes: [{ quantidade: 20, total: 339.94, unit: 17 }, { quantidade: 50, total: 419.95, unit: 8.4 }, { quantidade: 100, total: 619.95, unit: 6.2 }] }))
  }
  if (u.startsWith("/api/whatsapp/agente")) return new Response(JSON.stringify({ auto: { ligado: true, pequenoParceiro: false, horario: { dias: [1, 2, 3, 4, 5], inicio: "08:00", fim: "20:00" } }, log: [
    { em: new Date().toISOString(), jid: "1@lid", nome: "Camilo", perfil: "pequeno", enviou: true, texto: "Pô, essa quantidade a gente não roda porque é offset…", motivo: "100 unidades no total" },
    { em: new Date().toISOString(), jid: "2@lid", nome: "Marcio", perfil: "icp", enviou: false, texto: "Show! Vou preparar o seu orçamento.", motivo: "precisa de você (decisao_sua)" },
    { em: new Date().toISOString(), jid: "3@lid", nome: "Bia", perfil: "indefinido", enviou: true, passo: "F1", texto: "Oi! Conseguiu ver a quantidade?", motivo: "F1: sem resposta" },
  ], taxas: [{ passo: "Resposta", enviados: 42, responderam: 29 }, { passo: "F1", enviados: 18, responderam: 6 }, { passo: "F2", enviados: 9, responderam: 2 }, { passo: "F3", enviados: 5, responderam: 1 }] }))
  if (u.startsWith("/api/whatsapp/destino")) return new Response(JSON.stringify(u.includes("Sem%20Conversa") ? { jid: null } : { jid: "1@lid", nome: "Perfumaria Modelo", como: "conversa" }))
  if (u.startsWith("/api/aprovacao/link")) return new Response(JSON.stringify({ url: "https://app.enyla.com.br/aprovar/ORC-2026-999?t=exemplo" }))
  if (u.startsWith("/api/whatsapp/proximo-passo")) return new Response(JSON.stringify({ passo: { tipo: "lembrar", em: new Date().toISOString(), ate: "2026-11-12T12:00:00Z", nota: "vai mandar a arte" } }))
  if (u.startsWith("/api/cartuxo/pedidos")) {
    const h = (d: number) => new Date(Date.now() - d * 3_600_000).toISOString()
    const cli = (nome: string) => ({ nome, email: "contato@exemplo.com", telefone: "11999990000", documento: "12.345.678/0001-90" })
    const item = (nome: string, medida: string, qtd: number, total: number, marca: string | null, freteIncluso = false) => ({ nome, medida, qtd, acab: "Laminação fosca", prazo: "Produção normal", marca, freteIncluso, total })
    return new Response(JSON.stringify({ pedidos: [
      { id: "1", numero: "CX-261108-K7P2", status: "pago", forma: "pix", criadoEm: h(3), total: 1289.9, pago: 1289.9, cliente: cli("Perfumaria Modelo"), cidade: "São Paulo/SP", metodo: "Pix", itens: [item("Caixa para perfume 100 ml", "6,5 × 6,5 × 13 cm", 1000, 1289.9, "Noir 1987")],
        acompanhamento: { briefing: { marca: "Noir 1987", cores: "", texto: "", arquivos: [], em: h(2) }, artes: { 0: { versoes: [{ url: "/brand/enyla-wordmark-dark.png", nome: "arte.png", em: h(1) }], enviadaEm: h(1), ajustes: [] } } } },
      { id: "2", numero: "CX-261107-B2QX", status: "pago", forma: "cartao", criadoEm: h(30), total: 2479.9, pago: 2479.9, cliente: cli("Essências do Brás"), cidade: "São Paulo/SP", metodo: "Cartão de crédito", itens: [item("Caixa para perfume 100 ml", "6,5 × 6,5 × 13 cm", 2000, 2479.9, "Oud Real")],
        acompanhamento: { briefing: { marca: "Oud Real", cores: "preto e dourado", texto: "Nome grande na frente, 100 ml embaixo. Lateral com as notas: oud, âmbar e baunilha.", arquivos: [{ url: "/brand/enyla-wordmark-dark.png", nome: "logo-oud-real.png", em: h(28) }, { url: "x.pdf", nome: "referencia.pdf", em: h(28) }], em: h(28) },
          artes: { 0: { versoes: [{ url: "/brand/enyla-wordmark-dark.png", nome: "arte-v1.png", em: h(20) }], enviadaEm: h(20), ajustes: [{ texto: "Aumentar o logo e trocar o dourado por um mais claro", em: h(6) }] } } } },
      { id: "3", numero: "CX-261106-M4TA", status: "pago", forma: "pix", criadoEm: h(55), total: 1079.9, pago: 1079.9, cliente: cli("Bella Pele"), cidade: "Curitiba/PR", metodo: "Pix", itens: [item("Caixa para sérum 30 ml", "4 × 4 × 11 cm", 1000, 1079.9, "Pure Skin", true)] },
      { id: "4", numero: "CX-261108-Z9WE", status: "aguardando_pagamento", forma: "pix", criadoEm: h(1), total: 839.9, pago: 0, cliente: cli("Clínica Vitta"), cidade: "Barueri/SP", metodo: null, itens: [item("Caixa para caneta aplicadora", "4 × 3 × 17,5 cm", 1000, 839.9, null)] },
      { id: "5", numero: "CX-261106-H3RT", status: "aguardando_pagamento", forma: "cartao", criadoEm: h(50), total: 2479.9, pago: 0, cliente: cli("Aroma Nobre"), cidade: "Recife/PE", metodo: null, recusado: true, itens: [item("Caixa para perfume 100 ml", "6,5 × 6,5 × 13 cm", 2000, 2479.9, "Nobre")] },
      { id: "6", numero: "CX-261107-P0QA", status: "aguardando_pagamento", forma: "pix", criadoEm: h(20), total: 1079.9, pago: 0, cliente: cli("Pele de Seda"), cidade: "Goiânia/GO", metodo: null, itens: [item("Caixa para sérum 30 ml", "4 × 4 × 11 cm", 1000, 1079.9, null)] },
    ], recuperacao: { "5": { toques: [h(48)] }, "6": { toques: [h(19)] }, "2": { toques: [h(29)] } } }))
  }
  if (u.startsWith("/api/cartuxo/custos")) {
    const R = (campo: string, valor: number, fonte: string, detalhe: string) => ({ campo, valor, fonte, detalhe })
    return new Response(JSON.stringify({ custos: null, salvoEm: null, avisos: ["Nenhum fornecedor da ENYLA tem tabela de laminação cadastrada. O valor da laminação ainda é estimado: confirme com quem lamina."], referencias: [
      R("papelPorFolha", 0.85, "Configuração da ENYLA", "Cartão 300g: R$ 170 o cento de 66×96 (meia folha = 66×48)"), R("impressao", 350, "Configuração da ENYLA", "Jerograf: valor fixo por chapa"),
      R("perdaPct", 10, "Configuração da ENYLA", "folhas a mais nos orçamentos"), R("impostoPct", 6, "Configuração da ENYLA", "imposto sobre o preço"),
      R("corteAcerto", 50, "Configuração da ENYLA", "Rodrigo Corte e Vinco: R$ 50 de acerto + R$ 50 o milheiro"), R("corteMilheiro", 50, "Configuração da ENYLA", "Rodrigo Corte e Vinco"),
      R("arte", 70, "Configuração da ENYLA", "Ludmila Designer, por trabalho"), R("papelPorFolha", 0.72, "Pago em 11 lotes da ENYLA", "mediana de R$ 0,72 por folha, já com a perda"),
      R("laminacaoPorFolha", 0.18, "Pago em 13 lotes da ENYLA", "verniz: mediana de R$ 0,18 por folha. Laminação costuma custar mais que verniz"),
      R("corteMilheiro", 94.96, "Pago em 10 lotes da ENYLA", "mediana de R$ 95 por mil folhas, acerto incluído"), R("colagemPorMil", 47.66, "Pago em 12 lotes da ENYLA", "mediana de R$ 48 por mil caixas"),
      R("logistica", 49.58, "Pago em 16 lotes da ENYLA", "mediana de R$ 50 por lote (Lalamove, motoboy, carro)"),
    ] }))
  }
  if (u.startsWith("/api/cartuxo/facas")) {
    const P = (slug: string, codigo: string, nome: string, categoria: string, tipo: string, f: number, l: number, a: number) => ({ slug, codigo, nome, categoria, uso: "", tipo, frente_mm: f, lateral_mm: l, altura_mm: a, foto: `/fotos/${slug}-1.webp` })
    const produtos = [
      P("caixa-perfume-50ml", "CX-101", "Caixa para perfume 50 ml", "perfumaria", "simples", 55, 55, 110),
      P("caixa-perfume-100ml", "CX-102", "Caixa para perfume 100 ml", "perfumaria", "simples", 65, 65, 130),
      P("caixa-perfume-30ml", "CX-103", "Caixa para perfume 30 ml", "perfumaria", "simples", 40, 40, 100),
      P("caixa-body-splash", "CX-104", "Caixa para body splash 200 ml", "perfumaria", "fundo-automatico", 60, 60, 200),
      P("caixa-serum-conta-gotas", "CX-107", "Caixa para sérum 30 ml", "cosmeticos", "simples", 40, 40, 110),
      P("caixa-caneta-aplicadora", "CX-111", "Caixa para caneta aplicadora", "saude-e-bem-estar", "simples", 40, 30, 175),
    ]
    const F = (id: string, codigo: string, nome: string, tipo: string, f: number, l: number, a: number, lugares: number | null, produto_slug: string | null, tem_faca = true, no_site = true) =>
      ({ id, codigo, nome, tipo, frente_mm: f, lateral_mm: l, altura_mm: a, lugares, planificacao: null, produto_slug, tem_faca, no_site, obs: "", atualizada_em: new Date().toISOString() })
    return new Response(JSON.stringify({ produtos, erroSite: "", facas: [
      F("1", "F-012", "Caixa perfume 100 ml", "simples", 66, 66, 128, 4, "caixa-perfume-100ml"),
      F("2", "F-007", "Caixa perfume 50 ml", "simples", 56, 54, 112, 6, "caixa-perfume-50ml"),
      F("3", "SEM-CX-104", "Caixa body splash 200 ml", "fundo-automatico", 60, 60, 200, null, "caixa-body-splash", false, false),
      F("4", "F-031", "Similar decant 10 ml", "simples", 25, 25, 90, 18, null),
    ] }))
  }
  if (u.startsWith("/api/cartuxo/chapas")) {
    const d = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()
    const ch = (prazoId = "economico", acabId = "laminacao-fosca", porChapa = 4, rodada = 1340) => ({ prazoId, acabId, porChapa, formato: "66x48", rodada, colagemPorMil: 75, arte: 70, frete: 0 })
    const it = (n: number, cliente: string, slug: string, nome: string, qtd: number, total: number, dias: number, c = ch(), marca?: string) =>
      ({ pedidoId: "p" + n, pedido: `CX-261108-${n}A`, itemIdx: 0, pagoEm: d(dias), cliente, telefone: "11999990000", slug, nome, qtd, total, forma: "pix", chapa: c, marca })
    const r = alocar([], [
      it(1, "Perfumaria Modelo", "caixa-perfume-100ml", "Caixa para perfume 100 ml", 1000, 1289.9, 9, ch(), "Noir 1987"),
      it(2, "Essências do Brás", "caixa-perfume-100ml", "Caixa para perfume 100 ml", 2000, 2299.9, 6, ch(), "Oud Real"),
      it(3, "Bella Pele", "caixa-serum-conta-gotas", "Caixa para sérum 30 ml", 1000, 989.9, 4, ch("economico", "laminacao-fosca", 6, 1340), "Pure Skin"),
      it(4, "Clínica Vitta", "caixa-caneta-aplicadora", "Caixa para caneta aplicadora", 1000, 839.9, 1, ch("padrao", "laminacao-brilho", 8, 1340)),
      it(5, "Atelier Lumi", "caixa-perfume-100ml", "Caixa para perfume 100 ml", 1000, 1289.9, 2, ch("economico", "laminacao-brilho"), "Lumi"),
    ], d(10))
    r.chapas[0].ocupacao.forEach(o => { o.arteAprovadaEm = d(8) })
    r.chapas[1].ocupacao[0].arteAprovadaEm = d(3)
    return new Response(JSON.stringify({ chapas: r.chapas, semDados: 0 }))
  }
  if (u.startsWith("/api/digital")) {
    const h = (m: number) => new Date(Date.now() - m * 60_000).toISOString()
    const extra = { linkDesigner: "https://app.enyla.com.br/d/DIG-0001?t=x&dz=y", arteAtual: null, versoes: 0, arteEnviadaEm: null, arteAprovadaEm: null, ajustes: [], designerAvisadoEm: null, villaEnviadoEm: null, frete: null, restante: null, restantePagoEm: null, entrega: null, acertadoEm: null }
    const base = { ...extra, ml: 30, medidas: { a: 10, l: 4, p: 4 }, padrao: true, folha: "A4", custo: 399.95, arte: 70, margem: 150, statusEm: null, link: "https://app.enyla.com.br/d/DIG-0001?t=x", vence: new Date(Date.now() + 10 * 86_400_000).toISOString() }
    return new Response(JSON.stringify({ pedidos: [
      { ...base, id: "DIG-0011", jid: "1@lid", nome: "Perfumaria Exemplo", em: h(50), quantidade: 100, total: 619.95, sinal: 309.98, status: "aguardando_sinal", sinalPagoEm: null, vistoEm: null, ultimaVista: null, vistas: 0, lembretes: [], briefing: null, opcoes: [{ quantidade: 100, total: 719.95, unit: 7.2 }, { quantidade: 200, total: 1220, unit: 6.1 }, { quantidade: 300, total: 1419.85, unit: 4.73 }, { quantidade: 500, total: 1970, unit: 3.94 }] },
      { ...base, id: "DIG-0010", jid: "2@lid", nome: "Aromas Modelo", em: h(60 * 30), quantidade: 50, total: 469.95, sinal: 234.97, status: "aguardando_sinal", sinalPagoEm: null, vistoEm: h(60 * 29), ultimaVista: h(60 * 5), vistas: 3, lembretes: [{ nivel: 1, em: h(60 * 27) }, { nivel: 2, em: h(60 * 6) }], briefing: { marca: "Aromas Modelo", cores: "", referencias: "", arquivos: 0 } },
      { ...base, ...extra, id: "DIG-0009", jid: "3@lid", nome: "Body Splash Fictícia", em: h(60 * 50), quantidade: 100, total: 619.95, sinal: 309.98, status: "arte", sinalPagoEm: h(60 * 20), vistoEm: h(60 * 49), ultimaVista: h(60 * 20), vistas: 2, lembretes: [{ nivel: 1, em: h(60 * 47) }], briefing: { marca: "Fictícia Body", cores: "branco e dourado", referencias: "Caixa limpa, nome da marca na frente e numeração das fragrâncias", laminacao: "fosca", arquivos: 2 },
        arteAtual: { url: "/brand/enyla-wordmark-dark.png", nome: "arte.png", em: h(90) }, versoes: 2, arteEnviadaEm: h(80), ajustes: [{ texto: "Aumentar o nome da marca", em: h(60 * 5) }], designerAvisadoEm: h(60 * 19) },
      { ...base, ...extra, id: "DIG-0007", jid: "4@lid", nome: "Óleos Modelo", em: h(60 * 90), quantidade: 50, total: 469.95, sinal: 234.97, custo: 249.95, status: "producao", sinalPagoEm: h(60 * 80), vistoEm: h(60 * 89), ultimaVista: h(60 * 20), vistas: 4, lembretes: [], briefing: { marca: "Óleos Modelo", cores: "verde", referencias: "", laminacao: "brilho", arquivos: 1 },
        arteAtual: { url: "/brand/enyla-wordmark-dark.png", nome: "arte.png", em: h(60 * 30) }, versoes: 1, arteEnviadaEm: h(60 * 30), arteAprovadaEm: h(60 * 26), villaEnviadoEm: h(60 * 26), restante: 259.96, frete: 25, entrega: { cep: "59000000", endereco: "Rua Exemplo, 100, Centro, Natal/RN" } },
    ], contatos: { designer: "5584999990000", designerNome: "Designer Exemplo" }, acerto: { ids: ["DIG-0007"], total: 249.95 } }))
  }
  if (u.startsWith("/api/gastos")) {
    const d14 = ultimosDias(14)
    const ia = Object.fromEntries(d14.map((d, i) => [d, { usd: 1.6 + (i % 4) * 0.35, chamadas: 120 + i * 3 }]))
    const meta = Object.fromEntries(d14.map((d, i) => [d, i >= 12 ? (i === 13 ? 0 : 0) : 95 + (i % 5) * 18]))
    const g = montarGastos({ agora: new Date(), alertaDias: 3,
      ia: { dias: ia, recarga: { valor: 40, em: new Date(Date.now() - 5 * 86_400_000).toISOString() }, cotacao: 5.42 },
      meta: { saldo: 0.49, dias: meta, em: new Date().toISOString() },
      pedidos: [
        { status: "sinal_pago", margem: 150, arte: 70, total: 619.95, sinalPagoEm: new Date().toISOString(), em: new Date().toISOString() },
        { status: "producao", margem: 150, arte: 70, total: 339.94, sinalPagoEm: new Date(Date.now() - 2 * 86_400_000).toISOString(), em: new Date().toISOString() },
        { status: "sinal_pago", margem: 150, arte: 70, total: 569.95, sinalPagoEm: new Date(Date.now() - 4 * 86_400_000).toISOString(), em: new Date().toISOString() },
      ] })
    return new Response(JSON.stringify({ ...g, alertaDias: 3 }))
  }
  if (u.startsWith("/api/abertura")) {
    return new Response(JSON.stringify({ minimo: 60,
      a: "Oi, tudo bem? aqui é o Luiz Felipe, da Jerograf / ENYLA👋 Você já tá vendendo seu produto ou tá lançando agora? E que volume você precisa?",
      teste: { ligado: true, b: "Oi, tudo bem? Aqui é o Luiz Felipe, da Jerograf / ENYLA 👋 Quantas caixinhas você precisa, mais ou menos? Umas 500, 1.000, 5.000 ou mais?", inicio: new Date(Date.now() - 3 * 86_400_000).toISOString() },
      medida: { em: new Date(Date.now() - 2 * 3_600_000).toISOString(), A: { leads: 41, responderam: 27, volume: 15, mql: 9 }, B: { leads: 38, responderam: 27, volume: 21, mql: 10 } },
    }))
  }
  if (u.startsWith("/api/hoje")) {
    const h = (m: number) => new Date(Date.now() - m * 60_000).toISOString()
    return new Response(JSON.stringify({
      gastos: { totalDia: 140, alertas: [{ tipo: "meta", nivel: "perigo", texto: "Anúncios da Meta: saldo para menos de 1 dia (R$ 0,49). Recarregue para a operação não parar." }] },
      responder: [
        { jid: "9@lid", nome: "Essências Exemplo", mensagem: "Oi! Ainda quero sim, dá pra atualizar pra 5 mil?", desde: h(40), rotulo: "Retomada", retomada: true, lista: "responder" },
        { jid: "1@lid", nome: "Perfumaria Modelo", mensagem: "Preciso de 3 mil caixinhas de 50ml com hot stamping", desde: h(190), rotulo: "ICP", retomada: false, lista: "responder", cliente: null, dados: { produto: "caixinha", volume_ml: 50, caixa_cm: null, frasco_cm: null, quantidade: 3000, tem_arte: true, resumo: "" } },
        { jid: "2@lid", nome: "Aroma Teste", mensagem: "Vocês fazem frasco também?", desde: h(75), rotulo: "Oportunidade", retomada: false, lista: "responder" },
        { jid: "3@lid", nome: "Cosméticos Fictícia", mensagem: "Umas 1.500, por aí", desde: h(12), rotulo: "Lead médio", retomada: false, lista: "responder" },
      ],
      orcar: [
        { jid: "10@lid", nome: "Cosméticos Modelo", mensagem: "Me faz a cotação para as duas qualidades por gentileza", desde: h(60 * 9), rotulo: "ICP", retomada: false, lista: "orcar", cliente: null, dados: { produto: "caixa", volume_ml: null, caixa_cm: { frente: 4, lateral: 4, altura: 8 }, frasco_cm: null, quantidade: 10000, tem_arte: true, resumo: "10 e 20 mil caixas 8x4x4, verniz localizado" } },
      ],
      retomar: [
        { jid: "7@lid", nome: "Embalagens Fictícias", mensagem: "Vou ver com meu sócio e te falo", desde: h(60 * 24 * 4), rotulo: "ICP", retomada: false, lista: "retomar", cliente: null, dados: { produto: "caixinha", volume_ml: 100, caixa_cm: null, frasco_cm: null, quantidade: 5000, tem_arte: true, resumo: "" } },
        { jid: "8@lid", nome: "Aromas Exemplo", mensagem: "Te mando a arte até sexta", desde: h(60 * 24 * 5), rotulo: "Lead médio", retomada: false, lista: "retomar", nota: "vai mandar a arte", cliente: null, dados: null },
      ],
      meta: { resumo: { total: 28, orcados: 20, noPrazo: 11, atrasados: 8, prontos: 5, padrao: 2, falta: 1, comEle: 16, semPressa: 2 }, travados: [
        { jid: "21@lid", nome: "Fragrâncias Exemplo", mensagem: "Seria a de 6x3x10", desde: h(60 * 36), rotulo: "Lead médio", retomada: false, lista: "orcar", cliente: null, estado: "pronto", falta: [], padraoMl: null, horas: 36, dados: { produto: "perfume", volume_ml: 50, caixa_cm: { frente: 6, lateral: 3, altura: 10 }, frasco_cm: null, quantidade: 1000, tem_arte: true, resumo: "" } },
        { jid: "22@lid", nome: "Perfumes Teste", mensagem: "Quero 1.000 caixinhas pro de 100ml", desde: h(60 * 20), rotulo: "Lead médio", retomada: false, lista: "orcar", cliente: null, estado: "padrao", falta: [], padraoMl: 100, horas: 20, dados: { produto: "perfume", volume_ml: 100, caixa_cm: null, frasco_cm: null, quantidade: 1000, tem_arte: null, resumo: "" } },
        { jid: "23@lid", nome: "Óleos Fictícios", mensagem: "Vou medir e te mando", desde: h(60 * 70), rotulo: "ICP", retomada: false, lista: "orcar", cliente: null, estado: "falta", falta: ["medida"], padraoMl: null, horas: 70, dados: { produto: "óleo capilar", volume_ml: null, caixa_cm: null, frasco_cm: null, quantidade: 2000, tem_arte: null, resumo: "" } },
      ] },
      outrosEsperando: 17,
      anuncio: { leads: 41, mql: 5, semClassificar: 29, descartados: 7 },
      marketing: { dia: "2026-11-04", acao: "Leve os 12 MQL para orçamento hoje e mantenha a verba até ver se o custo por MQL se sustenta.", custoMql: 12.91 },
      reativacao: { ligado: false, porDia: 4, hoje: 0, fila: 30 }, digital: { ligado: true, ativos: 12, paraOrcar: 3, esperando: 2, aguardandoSinal: 4, pagos: 2 },
    }))
  }
  if (u.startsWith("/api/marketing")) {
    const L = (o: Record<string, unknown>) => ({ id: "c1", nome: "Caixinhas para perfume (teste)", gasto: 0, impressoes: 0, cliques: 0, conversasMeta: 0, leads: 0, mql: 0, descartados: 0, semClassificar: 0, orcamentos: 0, pedidos: 0, faturamento: 0, ...o })
    return new Response(JSON.stringify({ relatorios: [{ dia: "2026-11-04", geradoEm: new Date().toISOString(),
      dia1: [L({ gasto: 155, cliques: 378, conversasMeta: 101, leads: 98, mql: 12, descartados: 12, semClassificar: 74 })],
      semana: [L({ gasto: 160, cliques: 397, conversasMeta: 106, leads: 100, mql: 12, descartados: 12, semClassificar: 76, orcamentos: 3, pedidos: 1, faturamento: 4250 }), L({ id: "c2", nome: "Remarketing (teste)", gasto: 42, cliques: 61, conversasMeta: 9, leads: 8, mql: 1, descartados: 4, semClassificar: 3 })],
      semanaAnterior: [L({ gasto: 82.7, cliques: 182, conversasMeta: 54, leads: 30, mql: 2, descartados: 3, semClassificar: 25 })],
      leitura: { resumo: "O dia 04/11 concentrou quase toda a semana: R$ 155, 98 leads e 12 MQL, R$ 12,91 por MQL, contra R$ 41,35 na semana anterior.", destaques: ["74 dos 98 leads ainda sem classificar: o custo por MQL real só fica claro depois da triagem.", "Amostra de um dia só: cedo para cravar que a campanha melhorou."], acao: "Leve os 12 MQL para orçamento hoje e mantenha a verba até ver se o custo por MQL se sustenta." },
    }, { dia: "2026-11-03", geradoEm: new Date().toISOString(), dia1: [], semana: [], semanaAnterior: [], leitura: null }] }))
  }
  if (u.startsWith("/api/whatsapp/reativacao")) {
    if (o?.method === "POST" && String(o.body).includes("preparar")) return new Response(JSON.stringify({ ok: true, texto: "Oi! Tudo certo por aí? Como foram as vendas com aquelas 8 mil caixinhas? Já tá na hora de repor ou pensar num lote novo?", trava: null, motivo: "Já comprou 8 mil" }))
    return new Response(JSON.stringify({ auto: { ligado: true, porDia: 4 }, hoje: 1, fila: [
      { jid: "1@lid", nome: "Perfumaria Modelo", motivo: "Cliente que já comprou", paradoDias: 47, ultimaMsg: "Fechado, obrigado!", ultimaDeQuem: "cliente", prioridade: 1 },
      { jid: "2@lid", nome: "Aroma Exemplo", motivo: "Orçamento perdido 5 mil+", paradoDias: 30, ultimaMsg: "Segue o orçamento das 5.000 caixinhas", ultimaDeQuem: "voce", prioridade: 2 },
      { jid: "3@lid", nome: "Fragrâncias Teste", motivo: "Orçamento perdido", paradoDias: 79, ultimaMsg: "Vou ver com meu sócio", ultimaDeQuem: "cliente", prioridade: 4 },
    ], registro: [
      { em: new Date().toISOString(), jid: "9@lid", nome: "Bia Essências", perfil: "icp", enviou: false, texto: "", passo: "Respondeu", motivo: "Respondeu à retomada: voltou para MQL, é com você" },
      { em: new Date(Date.now() - 3600_000).toISOString(), jid: "9@lid", nome: "Bia Essências", perfil: "icp", enviou: true, texto: "Oi Bia!", passo: "Reativação", motivo: "Retomada de bom negócio parado" },
    ] }))
  }
  if (u.startsWith("/api/whatsapp/contatos")) return new Response(JSON.stringify({ total: 84, comTelefone: 66, lista: [
    { jid: "1@lid", nome: "Perfumaria Exemplo", telefone: null, motivos: ["MQL", "ICP"], etiquetas: [], ultima: null },
    { jid: "2@lid", nome: "Carlos (Diretor)", telefone: null, motivos: ["Cliente: Carlos Teste"], etiquetas: [], ultima: null },
    { jid: "3@s.whatsapp.net", nome: "Ana Cosméticos", telefone: "5511999990000", motivos: ["MQL"], etiquetas: [], ultima: null },
  ] }))
  if (u.startsWith("/api/banco/sugerir")) return new Response(JSON.stringify({ feitas: 0, restantes: 0 }))
  if (u.startsWith("/api/banco/aprendizado")) return new Response(JSON.stringify({
    regras: [{ chave: "papelaria bras", tipo: "saida", acao: "lancar", categoria: "materiais", descricao: "Papel", vezes: 3 }, { chave: "ifood", tipo: "saida", acao: "ignorar", vezes: 2 }],
    licoes: [{ id: "l1", texto: "Uber é deslocamento para fornecedor", em: "2026-11-04" }],
    exemplos: [{ contraparte: "POSTO SHELL", descricao: "COMPRA", tipo: "saida", ia: "Combustível · Despesas gerais", voce: "ignorar", em: "2026-11-04T10:00:00Z" }],
  }))
  if (u.startsWith("/api/banco/transacoes")) {
    const t = (id: string, p: Record<string, unknown>) => ({ id, conta_id: "c1", conta_nome: "Santander · 2005886-0", data: "2026-11-03", valor: 100, tipo: "saida", descricao: "PIX ENVIADO", contraparte_nome: null, contraparte_doc: null, categoria_pluggy: null, estado: "pendente", lancamento_ids: [], historico: [], ...p })
    return new Response(JSON.stringify({ configurada: true, tabela: true, erro: null, pendentes: 5,
      status: { em: new Date().toISOString(), novas: 5, contas: [{ id: "c1", nome: "Santander · 2005886-0", saldo: 12840.55 }, { id: "c2", nome: "Inter · 1234", saldo: 3120.1 }] },
      transacoes: [
        t("a", { tipo: "entrada", valor: 650, contraparte_nome: "ANA COSMETICOS LTDA", descricao: "PIX RECEBIDO", sugestao: { acao: "atualizar", lancamentoId: "x", campos: { status: "pago" }, motivo: "" } }),
        t("b", { valor: 2000, contraparte_nome: "JEROGRAF GRAFICA E EDITORA", contraparte_doc: "03999896000152", sugestao: { acao: "criar", origem: "conta", motivo: "pagamento da conta Jerograf: abate o saldo devedor (não é custo novo)", lancamentos: [{ descricao: "Pagamento da conta — Jerograf", valor: 2000, tipo: "receita" }] } }),
        t("c", { valor: 1350, contraparte_nome: "PAPELARIA BRAS LTDA", sugestao: { acao: "criar", origem: "ia", motivo: "IA: papel cartão para o lote do Maurício (valor e fornecedor de papel)", lancamentos: [{ descricao: "Papel", categoria: "materiais", valor: 900, loteNumero: "MAU-007" }, { descricao: "Impressão", categoria: "fornecedor", valor: 450, loteNumero: "MAU-007" }] } }),
        t("d", { valor: 89.9, contraparte_nome: "IFOOD", descricao: "COMPRA CARTAO DEBITO", sugestao: { acao: "ignorar", motivo: "IA: gasto pessoal (alimentação)" } }),
        t("e", { valor: 37.5, descricao: "TARIFA PACOTE SERVICOS", sugestao: { acao: "revisar", motivo: "sem pista: confira" } }),
      ] }))
  }
  if (u.startsWith("/api/whatsapp/pendentes")) {
    const h = (m: number) => new Date(Date.now() - m * 60_000).toISOString()
    return new Response(JSON.stringify([
      { jid: "1@lid", nome: "Camilo", ultima_msg: "Quanto fica 2 mil caixinhas de 100ml? Preciso pra semana que vem", ultima_at: h(2), ultima_recebida_at: h(2), nao_lidas: 2 },
      { jid: "2@lid", nome: "Raniere Péricles", ultima_msg: "Fechou, manda o pix", ultima_at: h(25), ultima_recebida_at: h(25), nao_lidas: 1 },
      { jid: "3@lid", nome: "Bia Doces", ultima_msg: "[audioMessage]", ultima_at: h(180), ultima_recebida_at: h(180), nao_lidas: 0 },
    ]))
  }
  if (u.startsWith("/api/frete/servicos")) return new Response(JSON.stringify({ configurada: true, ambiente: "sandbox", cidade: "São Paulo", servicos: [
    { key: "LALAGO", nome: "Moto", periodo: null, carga: "até 20 kg", medidas: "0.4 × 0.4 × 0.4 m", adicionais: [] },
    { key: "MOTORCYCLE", nome: "Moto com baú", periodo: null, carga: "até 25 kg", medidas: "0.5 × 0.4 × 0.5 m", adicionais: [] },
    { key: "CAR", nome: "Carro", periodo: null, carga: "até 200 kg", medidas: "1 × 0.8 × 0.7 m", adicionais: [{ key: "DOOR_TO_DOOR_DRIVER", nome: "Motorista ajuda na carga e descarga", grupo: "Ajuda", max: 1 }] },
    { key: "UV_FIORINO", nome: "Utilitário (Fiorino)", periodo: null, carga: "até 600 kg", medidas: "1.8 × 1.2 × 1.1 m", adicionais: [{ key: "DOOR_TO_DOOR_DRIVER", nome: "Motorista ajuda na carga e descarga", grupo: "Ajuda", max: 1 }, { key: "DOOR_TO_DOOR_1DRIVER_1HELPER", nome: "Motorista + ajudante (carga e descarga)", grupo: "Ajuda", max: 1 }, { key: "ROUND_TRIP", nome: "Ida e volta", grupo: null, max: 1 }] },
    { key: "VAN", nome: "Van", periodo: null, carga: "até 1.500 kg", medidas: "3 × 1.6 × 1.5 m", adicionais: [] },
    { key: "CAR_4H", nome: "Carro por 4h", periodo: 4, carga: "", medidas: "", adicionais: [] },
  ] }))
  if (u.startsWith("/api/frete/cotar")) {
    const b = JSON.parse(String(o?.body ?? "{}")); const base: Record<string, number> = { LALAGO: 22.9, MOTORCYCLE: 27.5, CAR: 38.9, UV_FIORINO: 64.4, VAN: 112, CAR_4H: 180 }
    const v = (base[b.servico] ?? 50) * (b.prioridade ? 1.15 : 1)
    return new Response(JSON.stringify({ quotationId: "q" + b.servico, expiraEm: new Date(Date.now() + 272_000).toISOString(), valor: Math.round(v * 100) / 100, valorSemPrioridade: base[b.servico], distanciaKm: 7.4, paradas: ["s1", "s2"] }))
  }
  if (u.startsWith("/api/frete/resumo")) return new Response(JSON.stringify({ carteira: { saldo: 86.4, moeda: "BRL", em: new Date(Date.now() - 3 * 3600_000).toISOString() }, medias: { amostras: 0 } }))
  if (u.startsWith("/api/frete/rota")) {
    const pts = decodeURIComponent(u.split("pts=")[1] ?? "").split(";").map(x => x.split(",").map(Number))
    const linha: number[][] = []
    for (let k = 1; k < pts.length; k++) for (let t = 0; t <= 20; t++) { const f = t / 20; linha.push([pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * f + Math.sin(f * 6) * 0.003, pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * f]) }
    return new Response(JSON.stringify({ linha, km: 7.4, minutos: 23 }))
  }
  if (u.startsWith("/api/frete/lista")) return new Response(JSON.stringify([
    { order_id: "1", status: "PICKED_UP", valor: 38.9, cobrar_cliente: false, share_link: "https://share.lalamove.com/x", criado_em: new Date().toISOString(), descricao: "Fornecedor Papel → Gráfica", pedido_numero: "ORC-003", cliente: "Cliente Relacionamento",
      paradas: [{ nome: "Fornecedor Papel", texto: "Rua Oriente, 500 · Brás", lat: -23.5379, lng: -46.6172 }, { nome: "Gráfica", texto: "Rua Correia de Andrade, 50", lat: -23.5427, lng: -46.6199 }],
      motorista: { nome: "Guilherme", placa: "FPL-6J51", lat: -23.5401, lng: -46.6185 }, ambiente: "sandbox" },
    { order_id: "2", status: "COMPLETED", valor: 52.4, cobrar_cliente: true, criado_em: new Date(Date.now() - 86400000).toISOString(), descricao: "Gráfica → Ana Cosméticos", pedido_numero: "ANA-001", cliente: "Ana Cosméticos", paradas: null, motorista: null, ambiente: "sandbox" }]))
  if (u.startsWith("/api/frete/pedido")) return new Response(JSON.stringify([
    { order_id: "1", status: "PICKED_UP", valor: 38.9, cobrar_cliente: false, share_link: "https://share.lalamove.com/x", motorista: { nome: "Guilherme", placa: "FPL-6J51" }, ambiente: "sandbox" },
    { order_id: "2", status: "COMPLETED", valor: 52.4, cobrar_cliente: true, share_link: null, motorista: null, ambiente: "sandbox" }]))
  if (u.startsWith("/api/whatsapp/atender")) return new Response(JSON.stringify({
    resposta: "Show! Pra 2 mil caixinhas de 100ml fica bem em conta 🙌🏻\n\nMe passa as medidas do seu frasco (altura, largura e profundidade) que eu já te mando o orçamento?",
    etapa: "levantando_dados", alerta: "preco", motivo_alerta: "Pediu preço; falta a medida do frasco para orçar.", sugere_video: true,
    dados: { produto: "perfume árabe 100ml", volume_ml: 100, caixa_cm: null, frasco_cm: null, quantidade: 2000, tem_arte: null, resumo: "Perfume árabe 100ml, 2.000 un" },
    ultimaId: "e",
  }))
  if (u.startsWith("/api/whatsapp/mensagens/")) {
    const h = (m: number) => new Date(Date.now() - m * 60_000).toISOString()
    const m = (id: string, eu: boolean, corpo: string, min: number) => ({ id, jid: "1@lid", from_me: eu, corpo, tipo: "text", media_url: null, ts: h(min), kanban_card_id: null, status: eu ? "lida" : null })
    return new Response(JSON.stringify([
      m("a", false, "Olá, Gostaria se saber mais sobre as caixinhas.", 400), m("b", true, "Olá, tudo bem? Aqui é o Felipe, Gerente Comercial da Jerograf 👋 Vou cuidar pessoalmente do seu pedido.", 395),
      m("c", true, "Você já tá vendendo seu produto ou tá lançando agora? E que volume você precisa?", 394),
      m("d", false, "Já vendo, perfume árabe 100ml", 30), { ...m("au", false, "Preciso pra semana que vem, consegue?", 20), tipo: "audio" }, m("e", false, "Quanto fica 2 mil caixinhas de 100ml?", 15),
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
    case "config-agentes": case "config-sistema": case "abertura": try { sessionStorage.setItem("config:aba", tela === "abertura" ? "agentes" : tela.slice(7)) } catch {} // falls through
    case "config": return <ThemeProvider><div style={{ height: "100vh" }}><ConfigView config={cfg} onSave={setCfg} onExportar={() => {}} onImportar={() => {}} clientes={["Cliente Relacionamento", "Outro Cliente"]} /></div></ThemeProvider>
    case "lancamento": return <ModalLancamento inicial={{ tipo: "despesa", descricao: "Impressão + Papel", valor: 3100 }} kanban={dados.kanban} onSave={() => {}} onClose={() => {}} />
    case "parceiros": case "parceiros-modal": {
      const parc = [{ id: "p1", nome: "Jeferson Vidros", categoria: "Vidros", comissaoDefault: 3, criadoEm: "" }, { id: "p2", nome: "Marcelino", categoria: "Impressão", comissaoDefault: 0, criadoEm: "" }, { id: "p3", nome: "Denis Essências", categoria: "Essências", comissaoDefault: 0, criadoEm: "" }]
      const negs = [
        { id: "n1", parceiroId: "p1", parceiroNome: "Jeferson Vidros", descricao: "Frasco", produto: "Frasco", nomeCliente: "Raniere Péricles", tipo: "comissao" as const, valorVenda: 8286, comissaoPerc: 3, comissaoValor: 248.58, dataOrcamento: "2026-10-20", status: "pago" as const, criadoEm: "" },
        { id: "n2", parceiroId: "p3", parceiroNome: "Denis Essências", descricao: "Essência importada 6 fragrâncias", produto: "Essência", nomeCliente: "Camilo", quantidade: 6, tipo: "ganho" as const, valorVenda: 1620, valorCusto: 1380, comissaoPerc: 17.4, comissaoValor: 240, dataOrcamento: "2026-11-04", status: "pendente" as const, criadoEm: "" },
        { id: "n3", parceiroId: "p2", parceiroNome: "Marcelino", descricao: "Sacola", produto: "Sacola", nomeCliente: "BellaLiz", tipo: "ganho" as const, valorVenda: 400, valorCusto: 280, comissaoPerc: 42.9, comissaoValor: 120, dataOrcamento: "2026-11-02", status: "pago" as const, criadoEm: "" },
      ]
      return <div style={{ height: "100vh" }}>
        <ParceriasView parceiros={parc} negocios={negs} kanban={dados.kanban} lancamentos={[]} clientes={[]} lotes={[]} itensRevenda={<div />} onAbrirCliente={() => {}}
          onAddParceiro={() => {}} onUpdateParceiro={() => {}} onDeleteParceiro={() => {}} onAddNegocio={() => {}} onUpdateNegocio={() => {}} onDeleteNegocio={() => {}} />
        {tela === "parceiros-modal" && <ModalVenda inicial={negs[1]} parceiros={parc} clientes={["Camilo"]} onSalvar={() => {}} onNovoParceiro={() => {}} onFechar={() => {}} />}
      </div>
    }
    case "pdfcliente": return <FolhasPdf />
    case "enviarproposta": case "enviarproposta-sem": {
      const form = { ...dados.historico[0].form, nomeCliente: tela === "enviarproposta" ? "Perfumaria Modelo" : "Sem Conversa" }
      const calculo = calcular(form, config)!
      return <div style={{ height: "100vh", background: "#f5f5f7" }}><EnviarProposta cliente={form.nomeCliente} numero="ORC-2026-999"
        gerarHtml={async () => gerarHtmlOrcamentoCliente({ form, calculo, data: "05/11/2026, 10:00:00", numero: "ORC-2026-999" })}
        mensagem={l => `Oi, Perfumaria! Segue a proposta ORC-2026-999 da sua embalagem.\n\n3.000 unidades · R$ 8.476,64 à vista (R$ 2,83/un)\n\nPara ver a caixa em 3D e aprovar: ${l}\n\nQualquer dúvida, é só me chamar.`}
        onFechar={() => {}} /></div>
    }
    case "pedidodigital": case "pedidodigital-pago": return <DigitalClient id={tela.endsWith("pago") ? "DIG-PAGO" : "DIG-0001"} t="x" />
    case "pedidodigital-asaas": return <DigitalClient id="DIG-ASAAS" t="x" />
    case "pedidodigital-arte": return <DigitalClient id="DIG-ARTE" t="x" />
    case "pedidodigital-prod": return <DigitalClient id="DIG-PROD" t="x" />
    case "pedidodigital-designer": return <DigitalClient id="DIG-DZ" t="x" dz="y" />
    case "digital": return <div style={{ height: "100vh", display: "flex", background: "#f5f5f7" }}><OrcamentoDigitalView regra={{ arte: 70, margem: 150 }} onRegra={() => {}} onVerKanban={() => {}} onSalvar={d => ({ ...d, id: "x", numero: "DIG-001", cardId: "c" })} /></div>
    case "conversalateral": case "conversalateral-busca": case "conversalateral-m": return <div style={{ height: "100vh", background: "#f5f5f7" }}>
      <aside className="w-72 h-full bg-white border-r p-4"><p className="text-[12px] font-semibold">Cliente</p><div className="mt-2 h-9 rounded-xl border px-3 flex items-center text-[13px]">Perfumaria Modelo</div></aside>
      <ConversaLateral jid="1@lid" nome="Perfumaria Modelo" onFechar={() => {}} onAbrir={() => {}}
        dados={{ produto: "perfume árabe 100ml", volume_ml: 100, caixa_cm: { frente: 6, lateral: 3, altura: 10.5 }, frasco_cm: null, quantidade: 2000, tem_arte: true, resumo: "Perfume árabe 100ml, 2 mil caixas, verniz localizado no logo; precisa para a semana que vem." }} />
    </div>
    case "gastos": case "gastos-m": return pagina(<GastosView />)
    case "chapas": case "chapas-m": case "chapas-aberta": return pagina(<ChapasView />)
    case "custos": case "custos-m": case "custos-mudado": return pagina(<CustosView />)
    case "facas": case "facas-m": case "facas-aberta": case "facas-nova": case "facas-lista": return pagina(<FacasView />)
    case "cx-pedidos": case "cx-pedidos-aberto": case "cx-arte-aberto": case "cx-arte-m": case "cx-parados": case "cx-parado-aberto": case "cx-parado-m": return pagina(<PedidosSiteView onVerChapas={() => {}} />)
    case "cx-app": return <div style={{ display: "flex", minHeight: "100vh", background: "#f5f5f7" }}>
      <aside style={{ width: 220, background: "#17151f", padding: 8 }}>
        <div className="px-2 pt-3 pb-4"><img src="../../../public/brand/enyla-wordmark-light.png" style={{ height: 20 }} /></div>
        <SeletorArea cartuxo onTrocar={() => {}} />
        <p className="px-2.5 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Cartuxo</p>
        <div className="px-2.5 py-2 rounded-lg bg-white/[0.08] text-[13px] text-white">Pedidos do site</div>
        <div className="px-2.5 py-2 text-[13px] text-zinc-400">Chapas</div>
      </aside>
      <div style={{ flex: 1 }}>{pagina(<PedidosSiteView onVerChapas={() => {}} />)}</div>
    </div>
    case "digitalpainel": case "digitalpainel-m": case "digitalpainel-aberto": case "digitalpainel-qtd": case "digitalpainel-prod": case "digitalpainel-acerto": return pagina(<DigitalPainelView onAbrirConversa={() => {}} />)
    case "hoje": case "hoje-m": case "hoje-passo": return pagina(<div className="max-w-[1200px]"><HojeCard onAbrirConversa={() => {}} onNavegar={() => {}} onOrcar={() => {}} /></div>)
    case "hoje-conversa": case "hoje-conversa-m": return <>{pagina(<div className="max-w-[1200px]"><HojeCard onAbrirConversa={() => {}} onNavegar={() => {}} onOrcar={() => {}} /></div>)}
      <ConversaLateral jid="1@lid" nome="Perfumaria Modelo" responder onFechar={() => {}} onAbrir={() => {}} onOrcamento={() => {}}
        dados={{ produto: "caixinha", volume_ml: 50, caixa_cm: null, frasco_cm: null, quantidade: 3000, tem_arte: true, resumo: "3 mil caixinhas de 50 ml com hot stamping" }} /></>
    case "marketing": case "marketing-m": return pagina(<div className="max-w-[1100px]"><MarketingRelatorio /></div>)
    case "reativacao": return pagina(<div className="max-w-[860px]"><ReativacaoCard /></div>)
    case "contatos": return pagina(<div className="max-w-[860px]"><ContatosProtegidosCard /></div>)
    case "agente": return pagina(<div className="max-w-[860px]"><AgenteLeadsCard onFiltro={() => {}} /></div>)
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
    case "pedidos": case "pedidos-escuro": case "pedidos-aberto": case "pedidos-aberto-escuro": case "pedidos-quadro-escuro": case "pedidos-visao-escuro":
      return <div style={{ minHeight: "100vh", padding: 24 }} className={escuro ? "" : "bg-[#f5f5f7]"}><PedidosUnificadoView isDark={escuro} kanban={dados.kanban} historico={dados.historico as never}
        lancamentos={lancs} lotes={[]} onChamarFrete={() => {}} onMove={() => {}} onDelete={() => {}} onSetMotivo={() => {}} onFechamento={() => {}} onNovoLancamento={() => {}} onDetalhes={() => {}} /></div>
    case "entregas": case "entregas-escuro": case "entregas-corrida": return <div style={{ height: "100vh" }}><EntregasView isDark={escuro} kanban={dados.kanban} lancamentos={lancs} clientes={[]}
      onLancamentos={() => {}} onRemoverLancamentos={() => {}} onSalvarLocais={() => {}}
      config={{ ...cfg, locaisRetirada: [{ id: "g", nome: "Gráfica", contato: "Alanno", telefone: "11999990000", endereco: { texto: "Rua Correia de Andrade, 50 · Brás · São Paulo - SP", lat: -23.5427, lng: -46.6199 } }],
        enderecosClientes: { "ana cosmeticos": { texto: "Avenida Paulista, 1000 · Bela Vista · São Paulo - SP · 01310-100", lat: -23.5648, lng: -46.6519, recebedor: "Ana", telefone: "11988887777" } } }}
      prefill={{ pedido: { loteId: "l1", numero: "ANA-001", cliente: "Ana Cosméticos" } }} /></div>
    case "compositor-mic": return <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#efeae2" }}><div style={{ flex: 1 }} /><Compositor jid="x" contato="Camilo" onOtimista={() => {}} onResultado={() => {}} /></div>
    case "aviso": case "aviso-escuro": return <div style={{ height: "100vh", background: "var(--bg-page)" }}><AvisoWhatsapp onAbrir={() => {}} /></div>
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

// PDF do cliente como arquivo: as folhas que vão no .pdf, lado a lado com o HTML da impressão
function FolhasPdf() {
  const [folhas, setFolhas] = React.useState<{ imagem: string; altura: number }[] | null>(null)
  const html = React.useMemo(() => {
    const form = { ...dados.historico[0].form, nomeCliente: "Perfumaria Modelo", obsCliente: "Arte enviada pelo cliente." }
    return gerarHtmlOrcamentoCliente({ form, calculo: calcular(form, config)!, data: "05/11/2026, 10:00:00", numero: "ORC-2026-999" })
  }, [])
  React.useEffect(() => {
    folhasDoHtml(html).then(setFolhas)
    // o arquivo de verdade, para o teste conferir que é um PDF válido
    htmlParaPdf(html, "teste.pdf").then(f => { const r = new FileReader(); r.onload = () => { (window as unknown as { __pdf: string }).__pdf = String(r.result).split(",")[1] }; r.readAsDataURL(f) })
  }, [html])
  return <div style={{ display: "flex", gap: 24, padding: 24, background: "#ccc", alignItems: "flex-start" }}>
    <div id="pronto" data-folhas={folhas?.length ?? 0} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {(folhas ?? []).map((f, i) => <img key={i} src={f.imagem} style={{ width: 718, background: "#fff", boxShadow: "0 2px 8px rgba(0,0,0,.2)" }} alt="" />)}
    </div>
  </div>
}
