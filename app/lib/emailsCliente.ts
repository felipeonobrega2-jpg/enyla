// E-mails para o cliente nos momentos que viram "documento": pedido aprovado, sinal recebido, arte para aprovar,
// arte aprovada, material pronto e pedido enviado. Tom da empresa ("nós"), formato de e-mail transacional:
// resumo em forma de recibo, etapas do pedido, um botão, ajuda e rodapé com os dados da empresa.
// HTML de e-mail de verdade (tabelas, estilo inline, 600 px, sempre claro). Puro: só monta assunto, HTML e texto.
import type { Email } from "./emailsEnyla"

const SITE = "https://app.enyla.com.br"
const ROXO = "#6d45d9", ESCURO = "#14121f", TEXTO = "#3f3c4d", CINZA = "#7a7789", CLARO = "#a4a1b2", LINHA = "#e8e6ef", FUNDO = "#f3f2f7", VERDE = "#0f8a5f"
const F = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;"
const EMPRESA = "Jerograf Embalagens Personalizadas · CNPJ 03.999.896/0001-52"
const ENDERECO = "Estrada Velha de Itapevi, 3614 · Barueri – SP"
const esc = (s: string) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]!))
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const un = (n: number) => `${n.toLocaleString("pt-BR")} unidades`
const dataHora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(",", " às")
const primeiro = (nome: string | null | undefined) => { const n = (nome ?? "").trim().split(/\s+/)[0] ?? ""; return n ? n[0].toUpperCase() + n.slice(1).toLowerCase() : "" }
const ola = (nome: string | null | undefined) => primeiro(nome) ? `Olá, ${primeiro(nome)}.` : "Olá."
const fone = (n?: string | null) => { const d = (n ?? "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, ""); return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : null }
const linkWhats = (n?: string | null, t?: string) => n ? `https://wa.me/${n.replace(/\D/g, "")}${t ? `?text=${encodeURIComponent(t)}` : ""}` : null

// ── Peças ────────────────────────────────────────────────────────────────────
const p = (t: string, extra = "") => `<p style="margin:0 0 16px;${F}font-size:15px;line-height:1.65;color:${TEXTO};${extra}">${t}</p>`
const secao = (t: string) => `<div style="${F}font-size:12px;font-weight:700;letter-spacing:.9px;text-transform:uppercase;color:${CINZA};margin:30px 0 10px;">${esc(t)}</div>`

// Etapas: barras finas (feitas e a atual em roxo), o nome da etapa atual em destaque
function etapas(nomes: string[], atual: number): string {
  const w = Math.floor(100 / nomes.length)
  return `${secao("Andamento do pedido")}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    ${nomes.map((n, i) => `<td width="${w}%" valign="top" style="padding:0 ${i === nomes.length - 1 ? 0 : 4}px 0 0;">
      <div style="height:4px;line-height:4px;font-size:0;border-radius:2px;background:${i <= atual ? ROXO : LINHA};">&nbsp;</div>
      <div style="${F}font-size:11.5px;line-height:1.3;margin-top:8px;color:${i === atual ? ESCURO : i < atual ? TEXTO : CLARO};font-weight:${i === atual ? 700 : 500};">${esc(n)}</div>
    </td>`).join("")}
  </tr></table>`
}

// Resumo em forma de recibo: rótulo à esquerda, valor à direita; a última linha pode ser o total
type Linha = { rotulo: string; valor: string; obs?: string; cor?: string; total?: boolean }
function resumo(titulo: string, linhas: Linha[]): string {
  return `${secao(titulo)}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${LINHA};">
    ${linhas.map(l => `<tr>
      <td valign="top" style="padding:13px 12px 13px 0;border-bottom:1px solid ${LINHA};${F}font-size:14px;color:${l.total ? ESCURO : TEXTO};font-weight:${l.total ? 700 : 400};">
        ${esc(l.rotulo)}${l.obs ? `<div style="${F}font-size:12.5px;color:${CINZA};font-weight:400;margin-top:2px;">${l.obs}</div>` : ""}
      </td>
      <td valign="top" align="right" style="padding:13px 0;border-bottom:1px solid ${LINHA};${F}font-size:14px;white-space:nowrap;color:${l.cor ?? ESCURO};font-weight:${l.total ? 800 : 600};">${l.valor}</td>
    </tr>`).join("")}
  </table>`
}
function botao(texto: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 4px;"><tr><td style="border-radius:8px;background:${ROXO};">
    <a href="${esc(url)}" style="display:inline-block;padding:14px 28px;${F}font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${esc(texto)}</a>
  </td></tr></table>`
}
function arte(url?: string | null): string {
  if (!url || !/\.(png|jpe?g|webp|gif)(\?|$)/i.test(url)) return ""
  return `${secao("Prévia da arte")}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="background:${FUNDO};border:1px solid ${LINHA};border-radius:8px;padding:14px;">
    <a href="${esc(url)}"><img src="${esc(url)}" alt="Prévia da arte" width="500" style="display:block;width:100%;max-width:500px;height:auto;border:0;"></a>
  </td></tr></table>`
}
function ajuda(numero: string, whatsapp?: string | null): string {
  const f = fone(whatsapp), l = linkWhats(whatsapp, `Olá! Gostaria de falar sobre o pedido ${numero}.`)
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:32px 0 0;background:${FUNDO};border-radius:8px;"><tr><td style="padding:18px 20px;">
    <div style="${F}font-size:14px;font-weight:700;color:${ESCURO};">Precisa de ajuda?</div>
    <div style="${F}font-size:13.5px;line-height:1.6;color:${TEXTO};margin-top:4px;">${l && f
      ? `Fale com a nossa equipe pelo WhatsApp <a href="${esc(l)}" style="color:${ROXO};font-weight:600;text-decoration:none;">${f}</a>, informando o pedido <b>${esc(numero)}</b>.`
      : `Fale com a nossa equipe pelo WhatsApp da conversa, informando o pedido <b>${esc(numero)}</b>.`}</div>
  </td></tr></table>`
}

function moldura(a: { preheader: string; titulo: string; numero: string; corpo: string }): string {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><title>${esc(a.titulo)}</title>
<style>:root{color-scheme:light only}body{margin:0;padding:0;background:${FUNDO}}@media (max-width:620px){.pad{padding-left:24px!important;padding-right:24px!important}.h1{font-size:22px!important}}</style>
</head><body style="margin:0;padding:0;background:${FUNDO};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${FUNDO};">${esc(a.preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${FUNDO};"><tr><td align="center" style="padding:32px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid ${LINHA};border-radius:12px;">
  <tr><td class="pad" style="padding:24px 40px;border-bottom:1px solid ${LINHA};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td valign="middle"><img src="${SITE}/brand/enyla-wordmark-dark.png" alt="ENYLA Embalagens" height="20" style="display:block;height:20px;width:auto;border:0;"></td>
      <td valign="middle" align="right" style="${F}font-size:12.5px;color:${CINZA};">Pedido <b style="color:${ESCURO};">${esc(a.numero)}</b></td>
    </tr></table>
  </td></tr>
  <tr><td class="pad" style="padding:36px 40px 40px;">
    <h1 class="h1" style="margin:0 0 20px;${F}font-size:24px;line-height:1.25;font-weight:700;color:${ESCURO};letter-spacing:-0.2px;">${esc(a.titulo)}</h1>
    ${a.corpo}
    <p style="margin:32px 0 0;${F}font-size:14px;line-height:1.6;color:${TEXTO};">Atenciosamente,<br><b style="color:${ESCURO};">Equipe ENYLA Embalagens</b></p>
  </td></tr>
</table>
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;"><tr><td style="padding:22px 24px 0;text-align:center;${F}font-size:11.5px;line-height:1.7;color:${CLARO};">
  ENYLA Embalagens · ${EMPRESA}<br>${ENDERECO}<br>
  <a href="https://enyla.com.br" style="color:${CLARO};">enyla.com.br</a> · <a href="https://instagram.com/enyla.embalagens" style="color:${CLARO};">@enyla.embalagens</a><br>
  Este é um e-mail automático sobre o pedido ${esc(a.numero)}.
</td></tr></table>
</td></tr></table></body></html>`
}
const assinaturaTexto = "\n\nAtenciosamente,\nEquipe ENYLA Embalagens"

const ETAPAS_DIGITAL = ["Pedido", "Arte", "Produção", "Pronto", "Enviado"]
const ETAPAS_OFFSET = ["Aprovado", "Sinal", "Produção", "Expedição", "Entregue"]

// ── Offset: o cliente aprovou a proposta ─────────────────────────────────────
export function emailPedidoAprovado(a: {
  nome: string | null; numero: string; quantidade: number; preco: number; sinal: number; aprovadoPor: string; em: string
  descricao?: string | null; prazo?: string | null; linkPix: string; linkRastreio: string; whatsapp?: string | null
}): Email {
  const corpo = [
    p(ola(a.nome)),
    p(`Recebemos a aprovação do seu pedido. Para iniciarmos a produção, falta apenas o pagamento do sinal de <b>${brl(a.sinal)}</b>.`),
    p("Guarde este e-mail: ele é o comprovante da sua aprovação."),
    botao("Pagar o sinal", a.linkPix),
    etapas(ETAPAS_OFFSET, 1),
    resumo("Resumo do pedido", [
      { rotulo: "Embalagem personalizada", valor: un(a.quantidade), obs: a.descricao ? esc(a.descricao) : undefined },
      ...(a.prazo ? [{ rotulo: "Prazo de entrega", valor: esc(a.prazo) }] : []),
      { rotulo: "Aprovado por", valor: esc(a.aprovadoPor), obs: dataHora(a.em) },
      { rotulo: "Sinal para iniciar", valor: brl(a.sinal) },
      { rotulo: "Restante", valor: brl(Math.max(0, a.preco - a.sinal)), obs: "na entrega" },
      { rotulo: "Total do pedido", valor: brl(a.preco), total: true },
    ]),
    p(`Você pode acompanhar cada etapa da produção pela <a href="${esc(a.linkRastreio)}" style="color:${ROXO};font-weight:600;">página do seu pedido</a>.`, "margin-top:24px;"),
    ajuda(a.numero, a.whatsapp),
  ].join("")
  return {
    assunto: `Pedido ${a.numero} aprovado`,
    html: moldura({ preheader: `Recebemos a sua aprovação. Falta o sinal de ${brl(a.sinal)} para iniciarmos a produção.`, titulo: "Pedido aprovado", numero: a.numero, corpo }),
    texto: `${ola(a.nome)}\n\nRecebemos a aprovação do pedido ${a.numero} (${un(a.quantidade)}, total ${brl(a.preco)}), feita por ${a.aprovadoPor} em ${dataHora(a.em)}.\nPara iniciarmos a produção, falta o sinal de ${brl(a.sinal)}: ${a.linkPix}\n\nAcompanhe o pedido: ${a.linkRastreio}${assinaturaTexto}`,
  }
}

// ── Digital ──────────────────────────────────────────────────────────────────
const produtoDigital = (q: number): Linha => ({ rotulo: "Caixinhas personalizadas", valor: un(q), obs: "impressão digital, arte inclusa" })

export function emailSinalRecebido(a: { nome: string | null; id: string; quantidade: number; total: number; sinal: number; em: string; link: string; prazo?: string | null; whatsapp?: string | null }): Email {
  const corpo = [
    p(ola(a.nome)),
    p(`Confirmamos o recebimento do sinal de <b>${brl(a.sinal)}</b>. O seu pedido está confirmado.`),
    p("Nossa equipe de design já vai começar a sua arte com as informações que você enviou. Assim que a primeira versão estiver pronta, enviaremos para a sua aprovação."),
    botao("Acompanhar o pedido", a.link),
    etapas(ETAPAS_DIGITAL, 1),
    resumo("Resumo do pedido", [
      produtoDigital(a.quantidade),
      ...(a.prazo ? [{ rotulo: "Prazo de produção", valor: esc(a.prazo), obs: "após a aprovação da arte" }] : []),
      { rotulo: "Sinal pago", valor: brl(a.sinal), obs: dataHora(a.em), cor: VERDE },
      { rotulo: "Restante", valor: brl(Math.max(0, a.total - a.sinal)), obs: "quando o pedido estiver pronto, antes do envio" },
      { rotulo: "Total do pedido", valor: brl(a.total), total: true },
    ]),
    ajuda(a.id, a.whatsapp),
  ].join("")
  return {
    assunto: `Pedido ${a.id} confirmado`,
    html: moldura({ preheader: `Recebemos o sinal de ${brl(a.sinal)}. A próxima etapa é a arte.`, titulo: "Pedido confirmado", numero: a.id, corpo }),
    texto: `${ola(a.nome)}\n\nConfirmamos o recebimento do sinal de ${brl(a.sinal)} (${dataHora(a.em)}). O pedido ${a.id} (${un(a.quantidade)}, total ${brl(a.total)}) está confirmado. O restante é pago quando o pedido estiver pronto, antes do envio.\n\nAcompanhe: ${a.link}${assinaturaTexto}`,
  }
}

export function emailArteParaAprovar(a: { nome: string | null; id: string; versao: number; link: string; arteUrl?: string | null; whatsapp?: string | null }): Email {
  const ajuste = a.versao > 1
  const corpo = [
    p(ola(a.nome)),
    p(ajuste ? `Fizemos os ajustes solicitados. A <b>versão ${a.versao}</b> da sua arte está disponível para aprovação.` : "A primeira versão da sua arte está pronta e disponível para aprovação."),
    p("Pedimos que confira com atenção os textos, as cores e a posição dos elementos. Se estiver tudo certo, basta aprovar. Caso precise de alguma alteração, solicite o ajuste na mesma página."),
    botao("Revisar e aprovar a arte", a.link),
    arte(a.arteUrl),
    p("Importante: após a aprovação, a arte segue para a impressão exatamente como foi aprovada.", `margin-top:24px;font-size:13.5px;color:${CINZA};`),
    etapas(ETAPAS_DIGITAL, 1),
    ajuda(a.id, a.whatsapp),
  ].join("")
  return {
    assunto: ajuste ? `Pedido ${a.id}: versão ${a.versao} da arte para aprovação` : `Pedido ${a.id}: sua arte está pronta para aprovação`,
    html: moldura({ preheader: ajuste ? "Os ajustes foram feitos. Revise e aprove a nova versão." : "Revise a arte das suas caixinhas e aprove pela página do pedido.", titulo: ajuste ? "Nova versão da arte" : "Sua arte está pronta", numero: a.id, corpo }),
    texto: `${ola(a.nome)}\n\n${ajuste ? `Fizemos os ajustes solicitados. A versão ${a.versao} da arte do pedido ${a.id} está disponível para aprovação.` : `A arte do pedido ${a.id} está pronta para aprovação.`}\nRevise e aprove: ${a.link}${assinaturaTexto}`,
  }
}

export function emailArteAprovada(a: { nome: string | null; id: string; em: string; versao: number; link: string; arteUrl?: string | null; prazo?: string | null; whatsapp?: string | null }): Email {
  const corpo = [
    p(ola(a.nome)),
    p(`Confirmamos a aprovação da arte (versão ${a.versao}) em ${dataHora(a.em)}. O seu pedido seguiu para a produção.`),
    p(`${a.prazo ? `O prazo de produção é de <b>${esc(a.prazo)}</b>. ` : ""}Quando o pedido estiver pronto, avisaremos você para o pagamento do restante e o envio.`),
    botao("Acompanhar o pedido", a.link),
    arte(a.arteUrl),
    etapas(ETAPAS_DIGITAL, 2),
    ajuda(a.id, a.whatsapp),
  ].join("")
  return {
    assunto: `Pedido ${a.id}: arte aprovada e em produção`,
    html: moldura({ preheader: `Arte aprovada em ${dataHora(a.em)}. O seu pedido está em produção.`, titulo: "Arte aprovada", numero: a.id, corpo }),
    texto: `${ola(a.nome)}\n\nConfirmamos a aprovação da arte do pedido ${a.id} (versão ${a.versao}) em ${dataHora(a.em)}. O pedido está em produção; avisaremos quando estiver pronto para o pagamento do restante e o envio.\n\nAcompanhe: ${a.link}${assinaturaTexto}`,
  }
}

export function emailMaterialPronto(a: { nome: string | null; id: string; quantidade: number; restante: number; frete?: number | null; link: string; temEndereco: boolean; whatsapp?: string | null }): Email {
  const corpo = [
    p(ola(a.nome)),
    p(`O seu pedido está pronto. Para realizarmos o envio, falta apenas o pagamento do restante de <b>${brl(a.restante)}</b>.`),
    a.temEndereco ? "" : p("Na mesma página, informe também o endereço de entrega."),
    botao("Pagar o restante", a.link),
    etapas(ETAPAS_DIGITAL, 3),
    resumo("Resumo do pagamento", [
      produtoDigital(a.quantidade),
      ...(a.frete ? [{ rotulo: "Restante do pedido", valor: brl(a.restante - a.frete) }, { rotulo: "Frete", valor: brl(a.frete) }] : []),
      { rotulo: "Total a pagar", valor: brl(a.restante), obs: "Pix ou cartão", total: true },
    ]),
    p("O envio é feito assim que o pagamento for confirmado.", "margin-top:24px;"),
    ajuda(a.id, a.whatsapp),
  ].join("")
  return {
    assunto: `Pedido ${a.id} pronto para envio`,
    html: moldura({ preheader: `O seu pedido está pronto. Falta o restante de ${brl(a.restante)} para o envio.`, titulo: "Seu pedido está pronto", numero: a.id, corpo }),
    texto: `${ola(a.nome)}\n\nO pedido ${a.id} está pronto. Para o envio, falta o pagamento do restante de ${brl(a.restante)}${a.frete ? " (com frete)" : ""}: ${a.link}${assinaturaTexto}`,
  }
}

// ── Offset e digital: saiu para entrega ──────────────────────────────────────
export function emailPedidoEnviado(a: { nome: string | null; numero: string; quantidade?: number | null; link: string; digital?: boolean; whatsapp?: string | null }): Email {
  const corpo = [
    p(ola(a.nome)),
    p(`O seu pedido${a.quantidade ? ` (${un(a.quantidade)})` : ""} saiu para entrega. Você pode acompanhar o andamento pela página do pedido.`),
    botao("Acompanhar a entrega", a.link),
    etapas(a.digital ? ETAPAS_DIGITAL : ETAPAS_OFFSET, a.digital ? 4 : 3),
    p("Ao receber, recomendamos conferir as caixas. Se notar qualquer divergência, fale com a nossa equipe.", "margin-top:24px;"),
    ajuda(a.numero, a.whatsapp),
  ].join("")
  return {
    assunto: `Pedido ${a.numero} enviado`,
    html: moldura({ preheader: "O seu pedido saiu para entrega. Acompanhe pela página do pedido.", titulo: "Pedido enviado", numero: a.numero, corpo }),
    texto: `${ola(a.nome)}\n\nO pedido ${a.numero} saiu para entrega. Acompanhe: ${a.link}${assinaturaTexto}`,
  }
}
