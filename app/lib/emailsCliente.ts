// E-mails para o cliente nos momentos que viram "documento": pedido aprovado, sinal recebido, arte para aprovar,
// arte aprovada e pedido enviado. Servem de comprovante para ele e de registro para a ENYLA. Puro: só monta o e-mail.
import { moldura, paragrafo, botao, ficha, passos, type Email } from "./emailsEnyla"

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const un = (n: number) => `${n.toLocaleString("pt-BR")} un`
const dataHora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
const primeiro = (nome: string | null | undefined) => (nome ?? "").trim().split(/\s+/)[0] || ""
const ola = (nome: string | null | undefined) => primeiro(nome) ? `Oi, ${primeiro(nome)}!` : "Oi!"
const ASSINATURA = `<b style="color:#1d1a29;">Luiz Felipe · ENYLA Embalagens</b><br>Qualquer dúvida, é só responder pelo WhatsApp`
const RODAPE = "Você recebeu este e-mail porque informou o seu endereço no seu pedido com a ENYLA."

// Offset: o cliente aprovou a proposta na página
export function emailPedidoAprovado(a: {
  nome: string | null; numero: string; quantidade: number; preco: number; sinal: number; aprovadoPor: string; em: string
  descricao?: string | null; prazo?: string | null; linkPix: string; linkRastreio: string
}): Email {
  const corpo = [
    paragrafo(`${ola(a.nome)} Recebemos a aprovação do seu pedido. Este e-mail é o seu comprovante: guarde para consulta.`),
    ficha(`Pedido ${a.numero}`, [
      ["Aprovado por", a.aprovadoPor],
      ["Em", dataHora(a.em)],
      ...(a.descricao ? [["Embalagem", a.descricao] as [string, string]] : []),
      ["Quantidade", un(a.quantidade)],
      ["Valor do pedido", brl(a.preco)],
      ["Sinal para começar", brl(a.sinal)],
      ...(a.prazo ? [["Prazo", a.prazo] as [string, string]] : []),
    ], brl(a.preco)),
    passos([
      ["Sinal", `Com o sinal de ${brl(a.sinal)}, o seu pedido entra na produção.`],
      ["Arte e produção", "A gente prepara a arte, você aprova e a gráfica produz."],
      ["Entrega", "Você acompanha cada etapa pelo link do pedido."],
    ]),
    botao("Pagar o sinal", a.linkPix),
    paragrafo(`<a href="${a.linkRastreio}">Acompanhar o pedido</a>`),
  ].join("")
  return {
    assunto: `Pedido ${a.numero} aprovado · ENYLA`,
    html: moldura({ preheader: `Comprovante do pedido ${a.numero}: ${un(a.quantidade)}, ${brl(a.preco)}.`, titulo: "Pedido aprovado", corpo, rodapeExtra: RODAPE, assinatura: ASSINATURA }),
    texto: `${ola(a.nome)} Recebemos a aprovação do pedido ${a.numero}.\nAprovado por: ${a.aprovadoPor} em ${dataHora(a.em)}\nQuantidade: ${un(a.quantidade)}\nValor: ${brl(a.preco)}\nSinal: ${brl(a.sinal)}${a.prazo ? `\nPrazo: ${a.prazo}` : ""}\n\nPagar o sinal: ${a.linkPix}\nAcompanhar: ${a.linkRastreio}`,
  }
}

// Digital: o sinal caiu
export function emailSinalRecebido(a: { nome: string | null; id: string; quantidade: number; total: number; sinal: number; em: string; link: string; prazo?: string | null }): Email {
  const corpo = [
    paragrafo(`${ola(a.nome)} O seu sinal caiu e o pedido já está confirmado. Este e-mail é o seu comprovante.`),
    ficha(`Pedido ${a.id}`, [
      ["Quantidade", un(a.quantidade)],
      ["Valor do pedido", brl(a.total)],
      ["Sinal recebido", `${brl(a.sinal)} em ${dataHora(a.em)}`],
      ["Restante", `${brl(Math.max(0, a.total - a.sinal))} depois de você aprovar a arte`],
      ...(a.prazo ? [["Prazo", a.prazo] as [string, string]] : []),
    ], "Sinal recebido"),
    passos([
      ["Arte", "A designer cria a arte e ela chega para você aprovar pelo link do pedido."],
      ["Aprovação", "Você aprova ou pede ajuste. Com a arte aprovada, vai para a impressão."],
      ["Envio", "Pago o restante, as caixinhas são produzidas e enviadas."],
    ]),
    botao("Ver o meu pedido", a.link),
  ].join("")
  return {
    assunto: `Sinal recebido · pedido ${a.id} confirmado`,
    html: moldura({ preheader: `Recebemos o sinal de ${brl(a.sinal)}. Agora vem a arte.`, titulo: "Pedido confirmado", corpo, rodapeExtra: RODAPE, assinatura: ASSINATURA }),
    texto: `${ola(a.nome)} Recebemos o sinal de ${brl(a.sinal)} (${dataHora(a.em)}). Pedido ${a.id}: ${un(a.quantidade)}, total ${brl(a.total)}.\nVer o pedido: ${a.link}`,
  }
}

// Digital: arte pronta para aprovar
export function emailArteParaAprovar(a: { nome: string | null; id: string; versao: number; link: string }): Email {
  const corpo = [
    paragrafo(`${ola(a.nome)} A arte das suas caixinhas está pronta${a.versao > 1 ? ` (versão ${a.versao}, com os ajustes que você pediu)` : ""}.`),
    paragrafo("Confira com calma: nome, textos, cores e posição. Se estiver tudo certo, é só aprovar. Se quiser mudar algo, peça o ajuste pela mesma página."),
    botao("Ver e aprovar a arte", a.link),
    paragrafo(`<span style="color:#6b6878;font-size:13.5px;">Depois de aprovada, a arte vai para a impressão como está. Por isso vale conferir cada detalhe.</span>`),
  ].join("")
  return {
    assunto: `Sua arte está pronta para aprovar · pedido ${a.id}`,
    html: moldura({ preheader: "Confira a arte das suas caixinhas e aprove pelo link.", titulo: "Arte pronta", corpo, rodapeExtra: RODAPE, assinatura: ASSINATURA }),
    texto: `${ola(a.nome)} A arte do pedido ${a.id} está pronta para aprovar: ${a.link}`,
  }
}

// Digital: arte aprovada (registro de quando e o quê)
export function emailArteAprovada(a: { nome: string | null; id: string; em: string; versao: number; link: string; restante?: number | null }): Email {
  const corpo = [
    paragrafo(`${ola(a.nome)} Arte aprovada! Este e-mail é o registro da sua aprovação.`),
    ficha(`Pedido ${a.id}`, [
      ["Arte aprovada", `versão ${a.versao}`],
      ["Em", dataHora(a.em)],
      ...(a.restante ? [["Restante para produzir", brl(a.restante)] as [string, string]] : []),
    ], "Aprovada"),
    paragrafo(a.restante ? "Com o restante pago, as suas caixinhas entram na impressão." : "As suas caixinhas entram na impressão."),
    botao("Ver o meu pedido", a.link),
  ].join("")
  return {
    assunto: `Arte aprovada · pedido ${a.id}`,
    html: moldura({ preheader: `Registro da aprovação da arte em ${dataHora(a.em)}.`, titulo: "Arte aprovada", corpo, rodapeExtra: RODAPE, assinatura: ASSINATURA }),
    texto: `${ola(a.nome)} Arte do pedido ${a.id} aprovada em ${dataHora(a.em)} (versão ${a.versao}). Ver o pedido: ${a.link}`,
  }
}

// Offset e digital: o pedido saiu para entrega
export function emailPedidoEnviado(a: { nome: string | null; numero: string; quantidade?: number | null; link: string }): Email {
  const corpo = [
    paragrafo(`${ola(a.nome)} O seu pedido ${a.numero}${a.quantidade ? ` (${un(a.quantidade)})` : ""} saiu para entrega.`),
    paragrafo("Pelo link abaixo você acompanha até chegar."),
    botao("Acompanhar a entrega", a.link),
    paragrafo(`<span style="color:#6b6878;font-size:13.5px;">Quando receber, confira as caixas. Qualquer coisa, fale com a gente pelo WhatsApp.</span>`),
  ].join("")
  return {
    assunto: `Seu pedido ${a.numero} saiu para entrega`,
    html: moldura({ preheader: "Acompanhe a entrega pelo link.", titulo: "Pedido a caminho", corpo, rodapeExtra: RODAPE, assinatura: ASSINATURA }),
    texto: `${ola(a.nome)} O pedido ${a.numero} saiu para entrega. Acompanhe: ${a.link}`,
  }
}
