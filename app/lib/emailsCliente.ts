// E-mails para o cliente nos momentos que viram "documento": pedido aprovado, sinal recebido, arte para aprovar,
// arte aprovada, material pronto e pedido enviado. Comprovante para ele, registro para a ENYLA.
// HTML de e-mail de verdade (tabelas, estilo inline, 600 px, sempre claro): Gmail, Outlook, Apple Mail, celular.
// Puro: só monta assunto, HTML e texto.
import type { Email } from "./emailsEnyla"

const SITE = "https://app.enyla.com.br"
const ROXO = "#7c4ee4", ROXO_CLARO = "#efe9fd", ESCURO = "#17142a", TEXTO = "#3d3a4b", CINZA = "#77748a", LINHA = "#ebe8f3", FUNDO = "#f5f3fa", VERDE = "#13a06f"
const F = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;"
const esc = (s: string) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]!))
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const un = (n: number) => `${n.toLocaleString("pt-BR")} caixas`
const dataHora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(",", " às")
const primeiro = (nome: string | null | undefined) => { const n = (nome ?? "").trim().split(/\s+/)[0] ?? ""; return n ? n[0].toUpperCase() + n.slice(1).toLowerCase() : "" }
const comNome = (nome: string | null | undefined, frase: string) => primeiro(nome) ? `${primeiro(nome)}, ${frase[0].toLowerCase()}${frase.slice(1)}` : frase
const whats = (numero?: string | null, texto?: string) => numero ? `https://wa.me/${numero.replace(/\D/g, "")}${texto ? `?text=${encodeURIComponent(texto)}` : ""}` : null

// ── Peças ────────────────────────────────────────────────────────────────────
// Linha do tempo: feitas (roxo cheio), a atual (anel roxo), as próximas (cinza)
function linhaDoTempo(etapas: string[], atual: number): string {
  const w = Math.floor(100 / etapas.length)
  const cel = (nome: string, i: number) => {
    const feita = i < atual, agora = i === atual
    const bola = feita
      ? `<div style="width:22px;height:22px;line-height:22px;border-radius:11px;background:${ROXO};color:#fff;${F}font-size:12px;font-weight:800;text-align:center;margin:0 auto;">&#10003;</div>`
      : agora
        ? `<div style="width:16px;height:16px;border-radius:11px;border:3px solid ${ROXO};background:#fff;margin:0 auto;"></div>`
        : `<div style="width:12px;height:12px;border-radius:6px;background:#d9d5e6;margin:5px auto;"></div>`
    return `<td width="${w}%" align="center" valign="top" style="padding:0 2px;">
      ${bola}
      <div style="${F}font-size:11.5px;line-height:1.3;margin-top:7px;color:${feita || agora ? ESCURO : CINZA};font-weight:${agora ? 800 : 600};">${esc(nome)}</div>
    </td>`
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 4px;">
    <tr>${etapas.map(cel).join("")}</tr></table>`
}
// Números grandes em grade (2 por linha)
function numeros(itens: [string, string, string?][]): string {
  const linhas: [string, string, string?][][] = []
  for (let i = 0; i < itens.length; i += 2) linhas.push(itens.slice(i, i + 2))
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 0;border:1px solid ${LINHA};border-radius:16px;">
    ${linhas.map((l, li) => `<tr>${l.map(([rot, val, obs], ci) => `<td width="50%" valign="top" style="padding:16px 18px;${li ? `border-top:1px solid ${LINHA};` : ""}${ci ? `border-left:1px solid ${LINHA};` : ""}">
      <div style="${F}font-size:11px;font-weight:700;letter-spacing:1.1px;text-transform:uppercase;color:${CINZA};">${esc(rot)}</div>
      <div style="${F}font-size:${val.replace(/<[^>]+>/g, "").length > 14 ? "15px;line-height:1.35" : "20px"};font-weight:800;color:${ESCURO};margin-top:5px;">${val}</div>
      ${obs ? `<div style="${F}font-size:12.5px;color:${CINZA};margin-top:3px;">${obs}</div>` : ""}
    </td>`).join("")}${l.length === 1 ? `<td width="50%" style="border-left:1px solid ${LINHA};${li ? `border-top:1px solid ${LINHA};` : ""}"></td>` : ""}</tr>`).join("")}
  </table>`
}
const texto = (t: string, extra = "") => `<p style="margin:0 0 14px;${F}font-size:16px;line-height:1.6;color:${TEXTO};${extra}">${t}</p>`
const nota = (t: string) => `<p style="margin:18px 0 0;${F}font-size:13.5px;line-height:1.55;color:${CINZA};">${t}</p>`
function botoes(principal: { texto: string; url: string }, whatsapp?: string | null): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 0;"><tr><td align="center" style="border-radius:14px;background:${ROXO};">
      <a href="${esc(principal.url)}" style="display:block;padding:16px 20px;${F}font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:14px;text-align:center;">${esc(principal.texto)}</a>
    </td></tr></table>
    ${whatsapp ? `<p style="margin:14px 0 0;text-align:center;${F}font-size:14px;"><a href="${esc(whatsapp)}" style="color:${ROXO};font-weight:700;text-decoration:none;">Falar comigo no WhatsApp</a></p>` : ""}`
}
function imagemArte(url?: string | null): string {
  if (!url || !/\.(png|jpe?g|webp|gif)(\?|$)/i.test(url)) return ""
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 0;"><tr><td align="center" style="background:${FUNDO};border-radius:16px;padding:16px;">
    <a href="${esc(url)}"><img src="${esc(url)}" alt="Prévia da arte" width="500" style="display:block;width:100%;max-width:500px;height:auto;border:0;border-radius:10px;"></a>
  </td></tr></table>`
}

// Moldura do cliente: branca e limpa, logo à esquerda e o número do pedido à direita
function moldura(a: { preheader: string; etiqueta: string; cor?: string; titulo: string; corpo: string; numero: string }): string {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><title>${esc(a.titulo)}</title>
<style>:root{color-scheme:light only}body{margin:0;padding:0;background:${FUNDO}}@media (max-width:620px){.pad{padding-left:22px!important;padding-right:22px!important}.titulo{font-size:25px!important}}</style>
</head><body style="margin:0;padding:0;background:${FUNDO};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${FUNDO};">${esc(a.preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${FUNDO};"><tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:22px;">
  <tr><td class="pad" style="padding:26px 36px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td valign="middle"><img src="${SITE}/brand/enyla-wordmark-dark.png" alt="ENYLA" height="22" style="display:block;height:22px;width:auto;border:0;"></td>
      <td valign="middle" align="right"><span style="display:inline-block;${F}font-size:12px;font-weight:700;color:${ROXO};background:${ROXO_CLARO};border-radius:999px;padding:6px 12px;">${esc(a.numero)}</span></td>
    </tr></table>
  </td></tr>
  <tr><td class="pad" style="padding:30px 36px 34px;">
    <div style="${F}font-size:12px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase;color:${a.cor ?? ROXO};margin-bottom:10px;">${esc(a.etiqueta)}</div>
    <h1 class="titulo" style="margin:0 0 16px;${F}font-size:28px;line-height:1.2;font-weight:800;color:${ESCURO};letter-spacing:-0.3px;">${esc(a.titulo)}</h1>
    ${a.corpo}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:30px 0 0;border-top:1px solid ${LINHA};"><tr><td style="padding-top:20px;">
      <div style="${F}font-size:15px;font-weight:800;color:${ESCURO};">Luiz Felipe</div>
      <div style="${F}font-size:13px;color:${CINZA};margin-top:2px;">ENYLA Embalagens · cuido do seu pedido do começo ao fim</div>
    </td></tr></table>
  </td></tr>
</table>
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;"><tr><td style="padding:20px 24px 0;text-align:center;${F}font-size:12px;line-height:1.6;color:#a19eb0;">
  Você recebeu este e-mail porque deixou o seu endereço no pedido ${esc(a.numero)} com a ENYLA.<br>
  <a href="https://instagram.com/enyla.embalagens" style="color:#a19eb0;">@enyla.embalagens</a> · <a href="https://enyla.com.br" style="color:#a19eb0;">enyla.com.br</a>
</td></tr></table>
</td></tr></table></body></html>`
}

const ETAPAS_DIGITAL = ["Pedido", "Arte", "Produção", "Pronto", "Enviado"]
const ETAPAS_OFFSET = ["Aprovado", "Sinal", "Produção", "Expedição", "Entregue"]

// ── Offset: o cliente aprovou a proposta na página ───────────────────────────
export function emailPedidoAprovado(a: {
  nome: string | null; numero: string; quantidade: number; preco: number; sinal: number; aprovadoPor: string; em: string
  descricao?: string | null; prazo?: string | null; linkPix: string; linkRastreio: string; whatsapp?: string | null
}): Email {
  const corpo = [
    texto(`Recebi a sua aprovação. Este e-mail fica como comprovante: aprovado por <b>${esc(a.aprovadoPor)}</b> em ${dataHora(a.em)}.`),
    texto(`Para começar a produção falta só o sinal de <b>${brl(a.sinal)}</b>. Assim que ele cair, a sua embalagem entra na fila.`),
    linhaDoTempo(ETAPAS_OFFSET, 1),
    numeros([
      ["Pedido", brl(a.preco), un(a.quantidade)],
      ["Sinal para começar", brl(a.sinal), "o restante na entrega"],
      ...(a.descricao ? [["Embalagem", esc(a.descricao)] as [string, string]] : []),
      ...(a.prazo ? [["Prazo", esc(a.prazo)] as [string, string]] : []),
    ]),
    botoes({ texto: `Pagar o sinal de ${brl(a.sinal)}`, url: a.linkPix }, whats(a.whatsapp, `Oi! É sobre o pedido ${a.numero}.`)),
    nota(`Acompanhe cada etapa da produção pelo <a href="${esc(a.linkRastreio)}" style="color:${ROXO};font-weight:700;">link do seu pedido</a>.`),
  ].join("")
  return {
    assunto: `${primeiro(a.nome) ? `${primeiro(a.nome)}, pedido` : "Pedido"} ${a.numero} aprovado`,
    html: moldura({ preheader: `Comprovante: ${un(a.quantidade)}, ${brl(a.preco)}. Falta o sinal de ${brl(a.sinal)} para começar.`, etiqueta: "Pedido aprovado", titulo: comNome(a.nome, "Seu pedido foi aprovado"), corpo, numero: a.numero }),
    texto: `${comNome(a.nome, "Seu pedido foi aprovado")}.\n\nPedido ${a.numero}: ${un(a.quantidade)}, ${brl(a.preco)}.\nAprovado por ${a.aprovadoPor} em ${dataHora(a.em)}.\nSinal para começar: ${brl(a.sinal)}${a.prazo ? `\nPrazo: ${a.prazo}` : ""}\n\nPagar o sinal: ${a.linkPix}\nAcompanhar: ${a.linkRastreio}\n\nLuiz Felipe · ENYLA Embalagens`,
  }
}

// ── Digital ──────────────────────────────────────────────────────────────────
export function emailSinalRecebido(a: { nome: string | null; id: string; quantidade: number; total: number; sinal: number; em: string; link: string; prazo?: string | null; whatsapp?: string | null }): Email {
  const corpo = [
    texto(`O seu sinal de <b>${brl(a.sinal)}</b> caiu e o pedido está confirmado. Guarde este e-mail como comprovante.`),
    texto("Agora a designer cria a arte com o que você mandou. A primeira versão chega para você aprovar pelo link do pedido e por aqui."),
    linhaDoTempo(ETAPAS_DIGITAL, 1),
    numeros([
      ["Sinal recebido", brl(a.sinal), dataHora(a.em)],
      ["Pedido", brl(a.total), un(a.quantidade)],
      ["Restante", brl(Math.max(0, a.total - a.sinal)), "quando as caixinhas ficarem prontas"],
      ...(a.prazo ? [["Prazo de produção", esc(a.prazo), "depois da arte aprovada"] as [string, string, string]] : []),
    ]),
    botoes({ texto: "Acompanhar o meu pedido", url: a.link }, whats(a.whatsapp, `Oi! É sobre o pedido ${a.id}.`)),
  ].join("")
  return {
    assunto: `${primeiro(a.nome) ? `${primeiro(a.nome)}, seu` : "Seu"} pedido ${a.id} está confirmado`,
    html: moldura({ preheader: `Sinal de ${brl(a.sinal)} recebido. Agora vem a arte.`, etiqueta: "Pedido confirmado", cor: VERDE, titulo: comNome(a.nome, "Recebi o seu sinal"), corpo, numero: a.id }),
    texto: `${comNome(a.nome, "Recebi o seu sinal")}: ${brl(a.sinal)} em ${dataHora(a.em)}.\nPedido ${a.id}: ${un(a.quantidade)}, ${brl(a.total)}. Restante quando ficar pronto.\n\nAcompanhar: ${a.link}\n\nLuiz Felipe · ENYLA Embalagens`,
  }
}

export function emailArteParaAprovar(a: { nome: string | null; id: string; versao: number; link: string; arteUrl?: string | null; whatsapp?: string | null }): Email {
  const ajuste = a.versao > 1
  const corpo = [
    texto(ajuste ? `Fiz os ajustes que você pediu. Esta é a <b>versão ${a.versao}</b> da sua arte.` : "A primeira versão da sua arte está pronta."),
    imagemArte(a.arteUrl),
    texto("Confira com calma o nome, os textos, as cores e a posição. Está tudo certo? É só aprovar. Quer mudar algo? Peça o ajuste na mesma página.", "margin-top:22px;"),
    linhaDoTempo(ETAPAS_DIGITAL, 1),
    botoes({ texto: "Ver e aprovar a arte", url: a.link }, whats(a.whatsapp, `Oi! Sobre a arte do pedido ${a.id}:`)),
    nota("Depois de aprovada, a arte vai para a impressão exatamente como está. Por isso vale conferir cada detalhe."),
  ].join("")
  return {
    assunto: ajuste ? `Arte ajustada do pedido ${a.id}: versão ${a.versao}` : `${primeiro(a.nome) ? `${primeiro(a.nome)}, sua` : "Sua"} arte está pronta para aprovar`,
    html: moldura({ preheader: ajuste ? "Os ajustes estão feitos. Confira e aprove pelo link." : "Confira a arte das suas caixinhas e aprove pelo link.", etiqueta: ajuste ? `Arte · versão ${a.versao}` : "Arte para aprovar", titulo: comNome(a.nome, ajuste ? "Os ajustes estão prontos" : "Sua arte ficou pronta"), corpo, numero: a.id }),
    texto: `${comNome(a.nome, ajuste ? "Os ajustes estão prontos" : "Sua arte ficou pronta")}. Veja e aprove: ${a.link}\n\nLuiz Felipe · ENYLA Embalagens`,
  }
}

export function emailArteAprovada(a: { nome: string | null; id: string; em: string; versao: number; link: string; arteUrl?: string | null; prazo?: string | null; whatsapp?: string | null }): Email {
  const corpo = [
    texto(`Arte aprovada e já mandei para a produção. Este e-mail é o registro da sua aprovação: <b>versão ${a.versao}</b>, em ${dataHora(a.em)}.`),
    imagemArte(a.arteUrl),
    linhaDoTempo(ETAPAS_DIGITAL, 2),
    texto(`${a.prazo ? `O prazo de produção é de <b>${esc(a.prazo)}</b>. ` : ""}Quando as caixinhas ficarem prontas, eu te aviso e você paga o restante para o envio.`, "margin-top:22px;"),
    botoes({ texto: "Acompanhar o meu pedido", url: a.link }, whats(a.whatsapp, `Oi! É sobre o pedido ${a.id}.`)),
  ].join("")
  return {
    assunto: `Arte aprovada: pedido ${a.id} em produção`,
    html: moldura({ preheader: `Registro da aprovação em ${dataHora(a.em)}. Suas caixinhas entraram na produção.`, etiqueta: "Em produção", titulo: comNome(a.nome, "Arte aprovada"), corpo, numero: a.id }),
    texto: `${comNome(a.nome, "Arte aprovada")} em ${dataHora(a.em)} (versão ${a.versao}). Suas caixinhas entraram na produção; quando ficarem prontas, eu te aviso para o restante.\n\nAcompanhar: ${a.link}\n\nLuiz Felipe · ENYLA Embalagens`,
  }
}

export function emailMaterialPronto(a: { nome: string | null; id: string; quantidade: number; restante: number; frete?: number | null; link: string; temEndereco: boolean; whatsapp?: string | null }): Email {
  const corpo = [
    texto(`As suas <b>${un(a.quantidade).replace(" caixas", " caixinhas")}</b> ficaram prontas. Falta só o restante para eu despachar.`),
    linhaDoTempo(ETAPAS_DIGITAL, 3),
    numeros([
      ["Restante", brl(a.restante), a.frete ? `já com o frete de ${brl(a.frete)}` : "pelo Pix ou cartão"],
      ["Envio", "assim que cair", a.temEndereco ? "para o endereço que você deixou" : "deixe o endereço na página"],
    ]),
    botoes({ texto: `Pagar o restante de ${brl(a.restante)}`, url: a.link }, whats(a.whatsapp, `Oi! É sobre o pedido ${a.id}.`)),
  ].join("")
  return {
    assunto: `${primeiro(a.nome) ? `${primeiro(a.nome)}, suas` : "Suas"} caixinhas ficaram prontas`,
    html: moldura({ preheader: `Falta só o restante de ${brl(a.restante)} para o envio.`, etiqueta: "Pronto para envio", cor: VERDE, titulo: comNome(a.nome, "Suas caixinhas ficaram prontas"), corpo, numero: a.id }),
    texto: `${comNome(a.nome, "Suas caixinhas ficaram prontas")}! Falta o restante de ${brl(a.restante)}${a.frete ? " (com o frete)" : ""} para o envio: ${a.link}\n\nLuiz Felipe · ENYLA Embalagens`,
  }
}

// ── Offset e digital: saiu para entrega ──────────────────────────────────────
export function emailPedidoEnviado(a: { nome: string | null; numero: string; quantidade?: number | null; link: string; digital?: boolean; whatsapp?: string | null }): Email {
  const corpo = [
    texto(`O seu pedido${a.quantidade ? ` de <b>${un(a.quantidade)}</b>` : ""} saiu para entrega. Pelo link abaixo você acompanha até chegar.`),
    linhaDoTempo(a.digital ? ETAPAS_DIGITAL : ETAPAS_OFFSET, a.digital ? 4 : 3),
    botoes({ texto: "Acompanhar a entrega", url: a.link }, whats(a.whatsapp, `Oi! É sobre a entrega do pedido ${a.numero}.`)),
    nota("Quando receber, confira as caixas. Qualquer detalhe, me chame no WhatsApp que eu resolvo."),
  ].join("")
  return {
    assunto: `${primeiro(a.nome) ? `${primeiro(a.nome)}, seu` : "Seu"} pedido ${a.numero} saiu para entrega`,
    html: moldura({ preheader: "Acompanhe a entrega pelo link.", etiqueta: "A caminho", cor: VERDE, titulo: comNome(a.nome, "Seu pedido está a caminho"), corpo, numero: a.numero }),
    texto: `${comNome(a.nome, "Seu pedido está a caminho")}. Acompanhe: ${a.link}\n\nLuiz Felipe · ENYLA Embalagens`,
  }
}

