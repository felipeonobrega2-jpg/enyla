// E-mails da ENYLA (com a cara da marca): HTML de e-mail de verdade (tabelas, estilo inline, 600 px, sempre claro),
// que funciona no Gmail, Outlook e Apple Mail, no celular e no computador. Puro: só monta assunto, HTML e texto.

export type Email = { assunto: string; html: string; texto: string }

const ROXO = "#7c4ee4", ESCURO = "#1d1a29", CINZA = "#6b6878", FUNDO = "#f4f2fa", VERDE = "#13a06f"
const SITE = "https://app.enyla.com.br"
const esc = (s: string) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]!))

// Moldura: topo roxo com o logo, cartão branco, rodapé da marca
export function moldura(a: { preheader: string; titulo: string; corpo: string; rodapeExtra?: string }): string {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only">
<title>${esc(a.titulo)}</title>
<style>
  :root { color-scheme: light only; }
  body { margin:0; padding:0; background:${FUNDO}; }
  a { color:${ROXO}; }
  @media (max-width:620px) { .pad { padding-left:20px !important; padding-right:20px !important; } .titulo { font-size:24px !important; } .col { display:block !important; width:100% !important; } }
</style></head>
<body style="margin:0;padding:0;background:${FUNDO};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${FUNDO};">${esc(a.preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${FUNDO};">
<tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
    <tr><td style="background:#2a1a5e;background-image:linear-gradient(150deg,#1a0e40 0%,#4a2aa8 60%,${ROXO} 100%);border-radius:20px 20px 0 0;padding:28px 32px 26px;" class="pad">
      <img src="${SITE}/brand/enyla-wordmark-light.png" alt="ENYLA" height="26" style="display:block;height:26px;width:auto;border:0;">
    </td></tr>
    <tr><td style="background:#ffffff;padding:32px 32px 8px;" class="pad">
      <h1 class="titulo" style="margin:0 0 12px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:27px;line-height:1.2;font-weight:800;color:${ESCURO};letter-spacing:-0.4px;">${a.titulo}</h1>
      ${a.corpo}
    </td></tr>
    <tr><td style="background:#ffffff;border-radius:0 0 20px 20px;padding:8px 32px 30px;" class="pad">
      <p style="margin:18px 0 0;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:${CINZA};">Um abraço,<br><b style="color:${ESCURO};">Felipe · ENYLA Embalagens</b><br>Gerente de contas dos parceiros</p>
    </td></tr>
    <tr><td style="padding:22px 24px 6px;text-align:center;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#9a97a5;">
      ${a.rodapeExtra ? `${a.rodapeExtra}<br>` : ""}
      <b style="color:${CINZA};">ENYLA Embalagens</b> · embalagens personalizadas para marcas de todo o Brasil<br>
      <a href="https://instagram.com/enyla.embalagens" style="color:#9a97a5;">@enyla.embalagens</a> · <a href="https://enyla.com.br" style="color:#9a97a5;">enyla.com.br</a>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`
}

const F = "font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;"
export const paragrafo = (t: string) => `<p style="margin:0 0 14px;${F}font-size:15.5px;line-height:1.6;color:#3a3648;">${t}</p>`
export const botao = (texto: string, url: string, cor = ROXO) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 6px;"><tr><td style="border-radius:14px;background:${cor};">
    <a href="${esc(url)}" style="display:inline-block;padding:15px 26px;${F}font-size:15.5px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:14px;">${texto}</a>
  </td></tr></table>`
// Cartão de linhas "rótulo · valor"
export const ficha = (titulo: string, linhas: [string, string][], destaque?: string) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0 6px;background:#f8f7fc;border-radius:16px;">
    <tr><td style="padding:18px 20px 6px;${F}font-size:12px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:${ROXO};">${esc(titulo)}</td></tr>
    ${destaque ? `<tr><td style="padding:2px 20px 8px;${F}font-size:22px;font-weight:800;color:${ESCURO};">${destaque}</td></tr>` : ""}
    ${linhas.map(([r, v], i) => `<tr><td style="padding:9px 20px;${i ? "border-top:1px solid #ece9f4;" : ""}">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td class="col" style="${F}font-size:13.5px;color:${CINZA};width:42%;vertical-align:top;padding-right:10px;">${esc(r)}</td>
        <td class="col" style="${F}font-size:14.5px;font-weight:600;color:${ESCURO};vertical-align:top;">${v}</td>
      </tr></table></td></tr>`).join("")}
    <tr><td style="height:10px;line-height:10px;font-size:0;">&nbsp;</td></tr>
  </table>`
// Lista com ✓ (ex.: serviços cadastrados)
export const lista = (titulo: string, itens: string[]) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0 6px;background:#f8f7fc;border-radius:16px;">
    <tr><td style="padding:18px 20px 8px;${F}font-size:12px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:${ROXO};">${esc(titulo)}</td></tr>
    ${itens.map(t => `<tr><td style="padding:5px 20px;${F}font-size:15px;font-weight:600;color:${ESCURO};"><span style="display:inline-block;width:20px;height:20px;border-radius:6px;background:${ROXO};color:#fff;font-size:12px;line-height:20px;text-align:center;margin-right:10px;vertical-align:-3px;">✓</span>${esc(t)}</td></tr>`).join("")}
    <tr><td style="height:12px;line-height:12px;font-size:0;">&nbsp;</td></tr>
  </table>`

// Passos numerados (o que acontece agora)
export const passos = (itens: [string, string][]) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0 4px;">
    ${itens.map(([t, s], i) => `<tr><td style="padding:8px 0;vertical-align:top;width:40px;">
      <div style="width:30px;height:30px;border-radius:10px;background:${i === itens.length - 1 ? VERDE : ROXO};color:#fff;${F}font-size:14px;font-weight:800;line-height:30px;text-align:center;">${i + 1}</div>
    </td><td style="padding:8px 0;vertical-align:top;">
      <p style="margin:0;${F}font-size:15px;font-weight:700;color:${ESCURO};">${t}</p>
      <p style="margin:2px 0 0;${F}font-size:14px;line-height:1.5;color:${CINZA};">${s}</p>
    </td></tr>`).join("")}
  </table>`

const waLink = (numero: string | null, texto: string) => numero ? `https://wa.me/${numero}?text=${encodeURIComponent(texto)}` : SITE + "/parceiros"

// ── Parceiros ────────────────────────────────────────────────────────────────

export function emailCadastroRecebido(a: { primeiroNome: string; empresa: string; servicos: string[]; whatsappGerente: string | null }): Email {
  const corpo = [
    paragrafo(`Oi, ${esc(a.primeiroNome)}! Recebemos o cadastro da <b>${esc(a.empresa)}</b> na rede de parceiros da ENYLA. Obrigado pelo tempo.`),
    lista("Serviços cadastrados", a.servicos.slice(0, 14)),
    `<p style="margin:22px 0 4px;${F}font-size:16px;font-weight:800;color:${ESCURO};">E agora?</p>`,
    passos([
      ["Conferimos o seu cadastro", "Olhamos serviços, máquina e prazos. Se faltar algo, a gente fala com você no WhatsApp."],
      ["Você recebe os pedidos", "Arquivo, medida, quantidade e prazo chegam pelo WhatsApp e aqui no seu e-mail."],
      ["Entrega e recebe", "Pagamento como combinado. Quem entrega no prazo e com qualidade recebe mais pedidos."],
    ]),
    botao("Falar com o Felipe no WhatsApp", waLink(a.whatsappGerente, `Oi, Felipe! Sou da ${a.empresa}, acabei de me cadastrar como parceiro.`), "#25a35a"),
  ].join("")
  return {
    assunto: `Recebemos seu cadastro, ${a.primeiroNome}! · Parceiros ENYLA`,
    html: moldura({ preheader: "Seu cadastro na rede de parceiros ENYLA chegou. Veja o que acontece agora.", titulo: "Cadastro recebido!", corpo, rodapeExtra: "Você recebeu este e-mail porque se cadastrou em Parceiros ENYLA." }),
    texto: `Oi, ${a.primeiroNome}! Recebemos o cadastro da ${a.empresa} na rede de parceiros da ENYLA.\n\nServiços: ${a.servicos.join(", ")}\n\nE agora? 1) Conferimos o seu cadastro. 2) Você recebe os pedidos pelo WhatsApp e por e-mail. 3) Entrega e recebe como combinado.\n\nFelipe · ENYLA Embalagens`,
  }
}

export function emailParceiroAprovado(a: { primeiroNome: string; empresa: string; whatsappGerente: string | null }): Email {
  const corpo = [
    paragrafo(`Oi, ${esc(a.primeiroNome)}! A <b>${esc(a.empresa)}</b> agora faz parte da rede de parceiros da ENYLA.`),
    paragrafo(`A partir de agora, quando um pedido combinar com o que vocês fazem, ele chega pelo WhatsApp e também aqui no seu e-mail, com tudo o que precisa: arquivo, medida, quantidade e prazo.`),
    ficha("Como a parceria funciona", [
      ["Pedidos", "Pelo WhatsApp e por e-mail"],
      ["Pagamento", "Valor e forma combinados antes de começar"],
      ["Prioridade", "Quem entrega no prazo e com qualidade recebe mais"],
      ["Gerente de contas", "Felipe"],
    ]),
    botao("Salvar o contato do Felipe", waLink(a.whatsappGerente, `Oi, Felipe! Aqui é da ${a.empresa}. Contato salvo, conte com a gente!`)),
  ].join("")
  return {
    assunto: `Bem-vindo à rede de parceiros ENYLA, ${a.primeiroNome}!`,
    html: moldura({ preheader: `A ${a.empresa} agora é parceira da ENYLA. Os pedidos vão começar a chegar.`, titulo: "Bem-vindo à rede de parceiros", corpo }),
    texto: `Oi, ${a.primeiroNome}! A ${a.empresa} agora faz parte da rede de parceiros da ENYLA. Os pedidos chegam pelo WhatsApp e por e-mail, com arquivo, medida, quantidade e prazo. Pagamento combinado antes de começar.\n\nFelipe · ENYLA Embalagens`,
  }
}

export type DadosPedidoParceiro = {
  numero: string; servicos: string[]; quantidade: number | null; medida: string | null; material: string | null
  cores?: string | null; acabamentos?: string[] | null; obs?: string | null; prazo: string | null; enviadoEm: string
  arquivos?: { nome: string; url: string }[]
}
const dataBR = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/")

export function emailNovoPedido(a: { primeiroNome: string | null; empresa: string; pedido: DadosPedidoParceiro; whatsappGerente: string | null }): Email {
  const p = a.pedido
  const linhas: [string, string][] = [
    ["Pedido", `<b>${esc(p.numero)}</b>`],
    ["O que fazer", esc(p.servicos.join(" + ") || "—")],
    ...(p.quantidade ? [["Quantidade", `${p.quantidade.toLocaleString("pt-BR")} unidades`] as [string, string]] : []),
    ...(p.medida ? [["Medida", esc(p.medida)] as [string, string]] : []),
    ...(p.material ? [["Material", esc(p.material)] as [string, string]] : []),
    ...(p.cores ? [["Cores", esc(p.cores)] as [string, string]] : []),
    ...(p.acabamentos?.length ? [["Acabamentos", esc(p.acabamentos.join(", "))] as [string, string]] : []),
    ["Material enviado em", dataBR(p.enviadoEm)],
    ...(p.prazo ? [["Previsão de entrega", `<span style="color:${VERDE};">${dataBR(p.prazo)}</span>`] as [string, string]] : []),
  ]
  const arquivos = (p.arquivos ?? []).length ? ficha("Arquivos do pedido", (p.arquivos ?? []).slice(0, 8).map(f => {
    const [tipo, ...resto] = f.nome.split(" · ")
    return [resto.length ? tipo : "Arquivo", `<a href="${esc(f.url)}" style="color:${ROXO};font-weight:600;">${esc(resto.length ? resto.join(" · ") : f.nome)}</a>`] as [string, string]
  })) : ""
  const corpo = [
    paragrafo(`Oi${a.primeiroNome ? `, ${esc(a.primeiroNome)}` : ""}! Tem pedido novo da ENYLA para a <b>${esc(a.empresa)}</b>.`),
    ficha("Novo pedido", linhas),
    arquivos,
    p.obs ? paragrafo(`<b>Observações:</b> ${esc(p.obs)}`) : "",
    paragrafo(`Qualquer dúvida sobre o pedido, é só responder no WhatsApp. Quando estiver pronto, avisa a gente por lá.`),
    botao("Confirmar no WhatsApp", waLink(a.whatsappGerente, `Oi, Felipe! Recebi o pedido ${p.numero} (${p.servicos.join(" + ")}).`)),
  ].join("")
  return {
    assunto: `Novo pedido ${p.numero} · ${p.servicos.join(" + ")}${p.prazo ? ` · entrega ${dataBR(p.prazo)}` : ""}`,
    html: moldura({ preheader: `${p.servicos.join(" + ")}${p.quantidade ? ` · ${p.quantidade.toLocaleString("pt-BR")} un` : ""}${p.prazo ? ` · entrega ${dataBR(p.prazo)}` : ""}`, titulo: "Pedido novo para você", corpo }),
    texto: `Pedido novo da ENYLA para a ${a.empresa}.\n\n${linhas.map(([r, v]) => `${r}: ${v.replace(/<[^>]+>/g, "")}`).join("\n")}${p.obs ? `\nObservações: ${p.obs}` : ""}\n\nFelipe · ENYLA Embalagens`,
  }
}
