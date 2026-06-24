import { FormData, Calculo, PropostaCustom } from "./types"

type HistoricoItem = { form: FormData; calculo: Calculo; data: string; numero?: string }

const LOGO_ENYLA_B64 = "data:image/png;base64,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"

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}
function num(v: number, d = 0) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d })
}

export function gerarHtmlOrcamento(item: HistoricoItem): string {
  const { form, calculo, data } = item
  const { dieline, melhorFormato, layoutChapa, tabela, sweetSpotIdealQtd, sweetSpotMinimoQtd, numChapas, custoImpressaoFixo } = calculo

  const sweetIdeal = tabela.find(l => l.quantidade === sweetSpotIdealQtd) ?? tabela[tabela.length - 1]
  const sweetMin   = tabela.find(l => l.quantidade === sweetSpotMinimoQtd) ?? tabela[0]
  const precoKey   = form.comFaca ? "precoComFaca" : "precoSemFaca"
  const unitKey    = form.comFaca ? "unitarioComFaca" : "unitarioSemFaca"
  const margKey    = form.comFaca ? "margemComFaca" : "margemSemFaca"

  const linhasHtml = tabela.map(l => {
    const isIdeal = l.quantidade === sweetSpotIdealQtd
    const isMin   = l.quantidade === sweetSpotMinimoQtd && !isIdeal
    const margem  = form.comFaca ? l.margemComFaca : l.margemSemFaca
    const margemCor = margem >= 48 ? "#16a34a" : margem >= 35 ? "#d97706" : "#dc2626"
    const bg = isIdeal ? "#eff6ff" : isMin ? "#fffbeb" : "transparent"
    return `
      <tr style="background:${bg}">
        <td style="font-weight:${isIdeal || isMin ? "700" : "400"}">
          ${num(l.quantidade)}
          ${isIdeal ? ' <span style="background:#2563eb;color:#fff;font-size:9px;padding:1px 5px;border-radius:9999px;font-weight:700">IDEAL</span>' : ""}
          ${isMin   ? ' <span style="background:#f59e0b;color:#fff;font-size:9px;padding:1px 5px;border-radius:9999px;font-weight:700">MÍN</span>'  : ""}
        </td>
        <td>${num(l.folhasPacote)}</td>
        <td>${brl(l.custoPapel)}</td>
        <td>${brl(l.custoImpressao)}</td>
        <td>${brl(l.custoCorte)}</td>
        ${form.incluirVerniz ? `<td>${brl(l.custoVerniz)}</td>` : ""}
        <td>${brl(l.custoColagem)}</td>
        <td>${brl(l.custoArte)}</td>
        <td>${brl(l.custoTotalSemFaca)}</td>
        <td style="font-weight:700;color:#1d4ed8">${brl(l.precoSemFaca)}</td>
        ${form.comFaca ? `<td>${brl(l.custoTotalComFaca)}</td><td style="font-weight:700;color:#1d4ed8">${brl(l.precoComFaca)}</td>` : ""}
        <td>${brl(l.unitarioSemFaca)}</td>
        ${form.comFaca ? `<td>${brl(l.unitarioComFaca)}</td>` : ""}
        <td style="color:${margemCor};font-weight:600">${num(margem, 1)}%</td>
        <td style="color:#64748b">${brl(l.parcela12xSemFaca)}</td>
        ${form.comFaca ? `<td style="color:#64748b">${brl(l.parcela12xComFaca)}</td>` : ""}
      </tr>`
  }).join("")

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Orçamento — ${form.nomeCliente || "Cliente"} — ${data}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:system-ui,-apple-system,sans-serif;font-size:12px;color:#1e293b;background:#fff;padding:28px 32px}
    h1{font-size:22px;font-weight:800;color:#0f172a}
    h2{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;font-weight:700;margin:22px 0 8px}
    .logo{font-size:15px;font-weight:900;color:#1e3a8a;letter-spacing:-.02em;margin-bottom:16px}
    .logo span{color:#64748b;font-weight:400;margin-left:6px;font-size:11px}
    .client-block{border-bottom:2px solid #1e3a8a;padding-bottom:14px;margin-bottom:4px}
    .kpis{display:flex;flex-wrap:wrap;gap:10px}
    .kpi{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;min-width:100px}
    .kpi-label{font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;font-weight:700}
    .kpi-value{font-size:15px;font-weight:800;color:#0f172a;margin-top:2px}
    .kpi-sub{font-size:9px;color:#94a3b8;margin-top:1px}
    table{width:100%;border-collapse:collapse;font-size:10.5px}
    th{background:#f8fafc;padding:5px 7px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:#64748b;font-weight:700;border-bottom:1px solid #e2e8f0;white-space:nowrap}
    td{padding:5px 7px;border-bottom:1px solid #f1f5f9;white-space:nowrap}
    .rec-box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;margin-top:8px}
    .rec-box p{font-size:11.5px;color:#475569;line-height:1.6}
    .footer{margin-top:28px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:10px;color:#94a3b8}
    @media print{
      body{padding:16px 20px}
      @page{margin:1cm}
    }
  </style>
</head>
<body>

  <div class="logo"><img src="${LOGO_ENYLA_B64}" alt="Enyla" style="height:20px;display:block;margin-bottom:4px" /><span style="display:block;font-size:11px;color:#64748b;font-weight:400">Orçamentista de Embalagens</span></div>

  <div class="client-block">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">
      <h1>${form.nomeCliente || "Orçamento sem nome"}</h1>
      ${item.numero ? `<span style="font-size:12px;font-weight:700;color:#1e3a8a;background:#eff6ff;border:1px solid #bfdbfe;padding:4px 10px;border-radius:6px;white-space:nowrap">${item.numero}</span>` : ""}
    </div>
    <p style="color:#64748b;font-size:11px;margin-top:3px">Gerado em ${data}</p>
  </div>

  <h2>Dimensões da Caixa</h2>
  <div class="kpis">
    <div class="kpi"><div class="kpi-label">Largura</div><div class="kpi-value">${form.frente} cm</div></div>
    <div class="kpi"><div class="kpi-label">Altura</div><div class="kpi-value">${form.alturaBox} cm</div></div>
    <div class="kpi"><div class="kpi-label">Profundidade</div><div class="kpi-value">${form.lateral} cm</div></div>
    <div class="kpi"><div class="kpi-label">Aba de Colagem</div><div class="kpi-value">${form.abaColagem} cm</div></div>
    ${form.materialNome ? `<div class="kpi"><div class="kpi-label">Material</div><div class="kpi-value" style="font-size:13px">${form.materialNome}</div></div>` : ""}
    <div class="kpi"><div class="kpi-label">Verniz UV</div><div class="kpi-value">${form.incluirVerniz ? "Sim" : "Não"}</div></div>
    <div class="kpi"><div class="kpi-label">Faca</div><div class="kpi-value">${form.comFaca ? brl(form.valorFaca) : "Sem faca"}</div></div>
    <div class="kpi"><div class="kpi-label">SKUs / Artes</div><div class="kpi-value">${form.numSKUs} / ${form.numArtes}</div></div>
  </div>

  <h2>Dieline — Faca Aberta</h2>
  <div class="kpis">
    <div class="kpi"><div class="kpi-label">Largura aberta</div><div class="kpi-value">${(dieline.largura / 10).toFixed(1)} cm</div><div class="kpi-sub">2×frente + 2×lateral + cola</div></div>
    <div class="kpi"><div class="kpi-label">Altura aberta</div><div class="kpi-value">${(dieline.altura / 10).toFixed(1)} cm</div><div class="kpi-sub">caixa + aba sup + aba inf</div></div>
    <div class="kpi"><div class="kpi-label">Aba colagem</div><div class="kpi-value">${(dieline.abaColagem / 10).toFixed(1)} cm</div></div>
    <div class="kpi"><div class="kpi-label">Aba superior</div><div class="kpi-value">${(dieline.abaSuperior / 10).toFixed(1)} cm</div><div class="kpi-sub">tuck flap</div></div>
    <div class="kpi"><div class="kpi-label">Aba inferior</div><div class="kpi-value">${(dieline.abaInferior / 10).toFixed(1)} cm</div><div class="kpi-sub">fundo</div></div>
  </div>

  <h2>Formato e Produção</h2>
  <div class="kpis">
    <div class="kpi"><div class="kpi-label">Melhor formato</div><div class="kpi-value">${melhorFormato.formatoNome}</div><div class="kpi-sub">${melhorFormato.orientacao}</div></div>
    <div class="kpi"><div class="kpi-label">Peças/folha</div><div class="kpi-value">${num(melhorFormato.pecasPorFolha)}</div></div>
    <div class="kpi"><div class="kpi-label">Peças/chapa</div><div class="kpi-value">${num(layoutChapa.pecasPorChapa)}</div></div>
    <div class="kpi"><div class="kpi-label">Aproveitamento</div><div class="kpi-value">${num(melhorFormato.aproveitamentoPct, 1)}%</div></div>
    <div class="kpi"><div class="kpi-label">Chapas</div><div class="kpi-value">${num(numChapas)}</div></div>
    <div class="kpi"><div class="kpi-label">Custo impressão</div><div class="kpi-value">${brl(custoImpressaoFixo)}</div><div class="kpi-sub">fixo</div></div>
  </div>

  <h2>Tabela de Orçamento</h2>
  <table>
    <thead>
      <tr>
        <th>Qtd</th>
        <th>Folhas</th>
        <th>Papel</th>
        <th>Impressão</th>
        <th>Corte</th>
        ${form.incluirVerniz ? "<th>Verniz</th>" : ""}
        <th>Colagem</th>
        <th>Arte</th>
        <th>Custo s/faca</th>
        <th>Preço s/faca</th>
        ${form.comFaca ? "<th>Custo c/faca</th><th>Preço c/faca</th>" : ""}
        <th>Unit. s/f</th>
        ${form.comFaca ? "<th>Unit. c/f</th>" : ""}
        <th>Margem</th>
        <th>12× s/faca</th>
        ${form.comFaca ? "<th>12× c/faca</th>" : ""}
      </tr>
    </thead>
    <tbody>${linhasHtml}</tbody>
  </table>

  <h2>Análise Estratégica</h2>
  <div class="kpis">
    <div class="kpi" style="border-color:#bfdbfe;background:#eff6ff">
      <div class="kpi-label" style="color:#3b82f6">Para o cliente</div>
      <div class="kpi-value">${brl(sweetIdeal[precoKey as keyof typeof sweetIdeal] as number)}</div>
      <div class="kpi-sub">${num(sweetIdeal.quantidade)} un · ${brl(sweetIdeal[unitKey as keyof typeof sweetIdeal] as number)}/un · margem ${num(sweetIdeal[margKey as keyof typeof sweetIdeal] as number, 1)}%</div>
    </div>
    <div class="kpi" style="border-color:#fde68a;background:#fffbeb">
      <div class="kpi-label" style="color:#d97706">Mínimo aceitável</div>
      <div class="kpi-value">${brl(sweetMin[precoKey as keyof typeof sweetMin] as number)}</div>
      <div class="kpi-sub">${num(sweetMin.quantidade)} un · ${brl(sweetMin[unitKey as keyof typeof sweetMin] as number)}/un · margem ${num(sweetMin[margKey as keyof typeof sweetMin] as number, 1)}%</div>
    </div>
  </div>

  <div class="rec-box" style="margin-top:12px">
    <p>
      ${form.nomeCliente ? `<strong>${form.nomeCliente}:</strong> ` : ""}
      Apresente <strong>${num(sweetIdeal.quantidade)} unidades</strong> como ponto ideal —
      ${brl(sweetIdeal[precoKey as keyof typeof sweetIdeal] as number)} com margem de
      <strong>${num(sweetIdeal[margKey as keyof typeof sweetIdeal] as number, 1)}%</strong>.
      Se houver resistência, use <strong>${num(sweetMin.quantidade)} un</strong> como mínimo aceitável.
      ${form.comFaca ? " A faca é investimento único — amortizada já na segunda tiragem." : ""}
    </p>
  </div>

  ${form.obsInterna ? `
  <h2>Observações Internas</h2>
  <div class="rec-box" style="border-left:3px solid #f59e0b;background:#fffbeb">
    <p style="white-space:pre-wrap">${form.obsInterna.replace(/</g, "&lt;")}</p>
  </div>` : ""}

  <div class="footer">
    ENYLA · Orçamentista de Embalagens · ${data}
  </div>

</body>
</html>`
}

export function gerarHtmlOrcamentoCliente(item: HistoricoItem): string {
  const { form, calculo, data, numero } = item
  const validadeDias = form.validadeDias ?? 7
  const dataVencimento = (() => {
    try {
      const [datePart] = data.split(", ")
      const [d, m, y] = datePart.split("/").map(Number)
      const dt = new Date(y, m - 1, d)
      dt.setDate(dt.getDate() + validadeDias)
      return dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })
    } catch { return "" }
  })()
  const { tabela, sweetSpotIdealQtd, sweetSpotMinimoQtd } = calculo

  const sweetIdeal = tabela.find(l => l.quantidade === sweetSpotIdealQtd) ?? tabela[tabela.length - 1]
  const sweetMin   = tabela.find(l => l.quantidade === sweetSpotMinimoQtd) ?? tabela[0]
  const precoKey   = form.comFaca ? "precoComFaca"    : "precoSemFaca"
  const unitKey    = form.comFaca ? "unitarioComFaca" : "unitarioSemFaca"
  const parc12Key  = form.comFaca ? "parcela12xComFaca" : "parcela12xSemFaca"

  const linhasHtml = tabela.map(l => {
    const isIdeal = l.quantidade === sweetSpotIdealQtd
    const isMin   = l.quantidade === sweetSpotMinimoQtd && !isIdeal
    const bg = isIdeal ? "#eff6ff" : isMin ? "#fffbeb" : "transparent"
    const preco = l[precoKey as keyof typeof l] as number
    const unit  = l[unitKey as keyof typeof l] as number
    const parc  = l[parc12Key as keyof typeof l] as number
    return `
      <tr style="background:${bg}">
        <td style="font-weight:${isIdeal || isMin ? "700" : "400"}">
          ${num(l.quantidade)}
          ${isIdeal ? ' <span style="background:#2563eb;color:#fff;font-size:9px;padding:1px 5px;border-radius:9999px;font-weight:700">RECOMENDADO</span>' : ""}
          ${isMin   ? ' <span style="background:#f59e0b;color:#fff;font-size:9px;padding:1px 5px;border-radius:9999px;font-weight:700">MÍNIMO</span>'  : ""}
        </td>
        <td style="font-weight:700;color:#1d4ed8;font-size:13px">${brl(preco)}</td>
        <td style="color:#475569">${brl(unit)}<span style="font-size:9px;color:#94a3b8">/un</span></td>
        <td style="color:#64748b">${brl(parc)}<span style="font-size:9px;color:#94a3b8">/mês</span></td>
      </tr>`
  }).join("")

  const extras: string[] = []
  if (form.incluirVerniz) extras.push("Verniz UV")
  if (form.comFaca && form.valorFaca > 0) extras.push(`Faca de corte inclusa (${brl(form.valorFaca)})`)

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Proposta — ${form.nomeCliente || "Cliente"} — ${data}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:system-ui,-apple-system,sans-serif;font-size:12px;color:#1e293b;background:#fff}
    .page{padding:36px 40px;min-height:100vh}
    .page-break{break-before:page;page-break-before:always}
    h1{font-size:24px;font-weight:800;color:#0f172a;margin-bottom:4px}
    h2{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;font-weight:700;margin:26px 0 10px}
    .logo{display:flex;align-items:center;gap:10px;margin-bottom:20px}
    .logo-text{font-size:20px;font-weight:900;color:#1e3a8a;letter-spacing:-.03em}
    .logo-sub{font-size:10px;color:#64748b;font-weight:400;letter-spacing:.02em;margin-top:1px}
    .header{border-bottom:2px solid #1e3a8a;padding-bottom:16px;margin-bottom:4px}
    .kpis{display:flex;flex-wrap:wrap;gap:10px}
    .kpi{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px 14px;min-width:110px}
    .kpi-label{font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;font-weight:700}
    .kpi-value{font-size:16px;font-weight:800;color:#0f172a;margin-top:3px}
    .kpi-sub{font-size:10px;color:#94a3b8;margin-top:2px}
    table{width:100%;border-collapse:collapse;font-size:11.5px}
    th{background:#f8fafc;padding:7px 10px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:#64748b;font-weight:700;border-bottom:2px solid #e2e8f0;white-space:nowrap}
    td{padding:8px 10px;border-bottom:1px solid #f1f5f9;white-space:nowrap}
    .highlight{background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:16px 20px;margin-top:10px}
    .highlight-title{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#3b82f6;font-weight:700;margin-bottom:6px}
    .highlight-price{font-size:28px;font-weight:900;color:#1d4ed8;line-height:1}
    .highlight-sub{font-size:11px;color:#64748b;margin-top:5px}
    .obs{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px 16px;margin-top:10px;font-size:11px;color:#475569;line-height:1.7}
    .footer{margin-top:32px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:10px;color:#94a3b8}
    /* ── Página 2: Perfil Jerograf ── */
    .p2-header{background:#1e3a8a;color:#fff;padding:36px 40px 28px}
    .p2-brand{font-size:28px;font-weight:900;letter-spacing:-.03em;margin-bottom:4px}
    .p2-brand span{color:#93c5fd}
    .p2-tagline{font-size:12px;color:#bfdbfe;font-weight:400;letter-spacing:.04em;text-transform:uppercase}
    .p2-body{padding:32px 40px}
    .p2-section-title{font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:#3b82f6;font-weight:700;margin-bottom:10px}
    .p2-heading{font-size:30px;font-weight:900;color:#0f172a;line-height:1.1;margin-bottom:18px}
    .p2-heading span{color:#1e3a8a}
    .p2-cols{display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-top:10px}
    .p2-text{font-size:11.5px;color:#475569;line-height:1.8}
    .p2-text p{margin-bottom:12px}
    .p2-text strong{color:#1e293b}
    .p2-highlights{display:flex;flex-direction:column;gap:12px}
    .p2-highlight-card{background:#f8fafc;border-left:3px solid #1e3a8a;border-radius:0 8px 8px 0;padding:12px 14px}
    .p2-highlight-card .num{font-size:22px;font-weight:900;color:#1e3a8a;line-height:1}
    .p2-highlight-card .label{font-size:10px;color:#64748b;margin-top:2px}
    .p2-divider{border:none;border-top:1px solid #e2e8f0;margin:24px 0}
    .p2-contact-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:4px}
    .p2-contact-item{font-size:10.5px;color:#475569;line-height:1.6}
    .p2-contact-item strong{display:block;font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;font-weight:700;margin-bottom:2px}
    .p2-footer{margin-top:28px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:10px;color:#94a3b8;display:flex;justify-content:space-between;align-items:center}
    .p2-seal{display:inline-flex;align-items:center;gap:6px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:4px 10px;font-size:10px;font-weight:700;color:#1e3a8a}
    @media print{
      .page{padding:16px 20px}
      .p2-header{padding:24px 20px 20px}
      .p2-body{padding:20px}
      @page{margin:0}
    }
  </style>
</head>
<body>

<!-- ═══════════════════════════════════════════════════════ PÁGINA 1: PROPOSTA -->
<div class="page">

  <div class="logo">
    <div>
      <div class="logo-text">Jerograf</div>
      <div class="logo-sub">Embalagens Personalizadas</div>
    </div>
  </div>

  <div class="header">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">
      <h1>${form.nomeCliente || "Proposta Comercial"}</h1>
      ${numero ? `<span style="font-size:12px;font-weight:700;color:#1e3a8a;background:#eff6ff;border:1px solid #bfdbfe;padding:5px 12px;border-radius:8px;white-space:nowrap">${numero}</span>` : ""}
    </div>
    <p style="color:#64748b;font-size:11px;margin-top:4px">Proposta gerada em ${data}</p>
  </div>

  <h2>Especificações da Embalagem</h2>
  <div class="kpis">
    <div class="kpi"><div class="kpi-label">Largura</div><div class="kpi-value">${form.frente} cm</div></div>
    <div class="kpi"><div class="kpi-label">Altura</div><div class="kpi-value">${form.alturaBox} cm</div></div>
    <div class="kpi"><div class="kpi-label">Profundidade</div><div class="kpi-value">${form.lateral} cm</div></div>
    ${form.materialNome ? `<div class="kpi"><div class="kpi-label">Material</div><div class="kpi-value" style="font-size:13px">${form.materialNome}</div></div>` : ""}
    ${form.incluirVerniz ? `<div class="kpi"><div class="kpi-label">Acabamento</div><div class="kpi-value" style="font-size:13px">Verniz UV</div></div>` : ""}
    ${form.comFaca && form.valorFaca > 0 ? `<div class="kpi"><div class="kpi-label">Faca de corte</div><div class="kpi-value" style="font-size:13px">Inclusa</div><div class="kpi-sub">investimento único</div></div>` : ""}
    <div class="kpi"><div class="kpi-label">Modelos (SKUs)</div><div class="kpi-value">${form.numSKUs}</div></div>
  </div>

  <h2>Tabela de Preços</h2>
  <table>
    <thead>
      <tr>
        <th>Quantidade</th>
        <th>Preço Total</th>
        <th>Preço Unitário</th>
        <th>Parcelado 12×</th>
      </tr>
    </thead>
    <tbody>${linhasHtml}</tbody>
  </table>

  <h2>Proposta Recomendada</h2>
  <div class="highlight">
    <div class="highlight-title">Quantidade ideal para melhor custo-benefício</div>
    <div class="highlight-price">${brl(sweetIdeal[precoKey as keyof typeof sweetIdeal] as number)}</div>
    <div class="highlight-sub">
      ${num(sweetIdeal.quantidade)} unidades ·
      ${brl(sweetIdeal[unitKey as keyof typeof sweetIdeal] as number)} por unidade ·
      ou ${brl(sweetIdeal[parc12Key as keyof typeof sweetIdeal] as number)}/mês em 12×
    </div>
  </div>

  <div class="obs">
    <strong>Observações:</strong><br>
    • Preços válidos para aprovação em até <strong>${validadeDias} dias corridos</strong>${dataVencimento ? ` (até ${dataVencimento})` : ""}.<br>
    • Contamos com designer próprio — desenvolvimento de arte incluso sem custo adicional.<br>
    • Prazo de entrega contado a partir da <strong>aprovação final da arte</strong>.<br>
    • A quantidade final do lote pode variar <strong>até 10%</strong> para mais ou para menos.<br>
    • Pagamentos à vista: coletamos <strong>50% do valor total</strong> no fechamento do pedido. O restante é pago somente na entrega.<br>
    ${form.comFaca && form.valorFaca > 0
      ? `• A faca de corte é um <strong>investimento único</strong> — reutilizada em todos os pedidos futuros do mesmo produto.<br>`
      : ""}
    • Pedido mínimo: <strong>${num(sweetMin.quantidade)} unidades</strong>.
    ${form.obsCliente ? `<br><br>${form.obsCliente.replace(/</g, "&lt;").replace(/\n/g, "<br>")}` : ""}
  </div>

  <div class="footer">
    Jerograf · Embalagens Personalizadas · CNPJ 03.999.896/0001-52 · ${data}
  </div>

</div>

<!-- ═══════════════════════════════════════════════════════ PÁGINA 2: PERFIL -->
<div class="page-break">

  <div class="p2-header">
    <div class="p2-brand">Jerograf<span>.</span></div>
    <div class="p2-tagline">Embalagens que valorizam seu produto</div>
  </div>

  <div class="p2-body">

    <div class="p2-section-title">Nossa história</div>
    <div class="p2-heading">Quem somos<br><span>nós?</span></div>

    <div class="p2-cols">

      <div class="p2-text">
        <p>
          Fundada em <strong>julho de 2000</strong> pelo Sr. <strong>José Jerônimo de Medeiros</strong>,
          a Jerograf nasceu com uma missão clara: criar embalagens que valorizem produtos
          e elevem a experiência do consumidor.
        </p>
        <p>
          Com mais de <strong>25 anos de atuação</strong> na região de <strong>Barueri/SP</strong>,
          construímos uma trajetória sólida baseada em qualidade, comprometimento e relacionamento
          próximo com cada cliente.
        </p>
        <p>
          Desde <strong>2018</strong>, somos referência no setor de perfumaria,
          atendendo marcas e distribuidores localizados no
          <strong>Brás e Centro de São Paulo</strong> com embalagens personalizadas
          que traduzem a identidade e o valor de cada fragrância.
        </p>
        <p>
          Nosso processo contempla desde o desenvolvimento da arte e dieline até
          a entrega final, garantindo consistência visual e padrão de excelência
          em cada tiragem.
        </p>
      </div>

      <div>
        <div class="p2-highlights">
          <div class="p2-highlight-card">
            <div class="num">+25</div>
            <div class="label">Anos de experiência em embalagens personalizadas</div>
          </div>
          <div class="p2-highlight-card">
            <div class="num">2000</div>
            <div class="label">Ano de fundação — Barueri, São Paulo</div>
          </div>
          <div class="p2-highlight-card">
            <div class="num">2018</div>
            <div class="label">Início da especialização em embalagens para perfumaria</div>
          </div>
          <div class="p2-highlight-card" style="border-left-color:#3b82f6">
            <div class="num" style="color:#2563eb;font-size:16px">Brás & Centro SP</div>
            <div class="label">Principal região atendida — polo de perfumaria do Brasil</div>
          </div>
        </div>
      </div>

    </div>

    <hr class="p2-divider">

    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px">

      <div>
        <div class="p2-section-title" style="margin-bottom:8px">Contato & Localização</div>
        <div class="p2-contact-grid">
          <div class="p2-contact-item">
            <strong>Endereço</strong>
            Estrada Velha de Itapevi, 3614<br>
            Parque dos Camargos · CEP 06444-000<br>
            Barueri – SP
          </div>
          <div class="p2-contact-item">
            <strong>CNPJ</strong>
            03.999.896/0001-52
            <br><br>
            <strong>Fundador</strong>
            José Jerônimo de Medeiros
          </div>
        </div>
      </div>

      <div class="p2-seal">
        Jerograf · Desde 2000
      </div>

    </div>

  </div>

  <div style="padding:0 40px 28px">
    <div class="p2-footer">
      <span>Jerograf Embalagens Personalizadas · CNPJ 03.999.896/0001-52</span>
      <span>Barueri/SP · ${data}</span>
    </div>
  </div>

</div>

</body>
</html>`
}

export function gerarHtmlPropostaCustom(p: PropostaCustom): string {
  const linhasAtivas = p.linhas.filter(l => l.ativa && l.quantidade > 0 && l.unitario >= 0)
  const ideal = linhasAtivas.find(l => l.isIdeal) ?? linhasAtivas[linhasAtivas.length - 1]
  const minLinha = linhasAtivas[0]

  const dataVencimento = (() => {
    try {
      const [datePart] = p.data.split(", ")
      const [d, m, y] = datePart.split("/").map(Number)
      const dt = new Date(y, m - 1, d)
      dt.setDate(dt.getDate() + (p.validadeDias ?? 7))
      return dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })
    } catch { return "" }
  })()

  const linhasHtml = linhasAtivas.map(l => {
    const isIdeal = l.isIdeal
    const isMin   = l === minLinha && !isIdeal
    const total   = l.unitario * l.quantidade
    const parc    = (total * p.parcFator) / 12
    const bg = isIdeal ? "#eff6ff" : isMin ? "#fffbeb" : "transparent"
    return `
      <tr style="background:${bg}">
        <td style="font-weight:${isIdeal || isMin ? "700" : "400"}">
          ${num(l.quantidade)}
          ${isIdeal ? ' <span style="background:#2563eb;color:#fff;font-size:9px;padding:1px 5px;border-radius:9999px;font-weight:700">RECOMENDADO</span>' : ""}
          ${isMin   ? ' <span style="background:#f59e0b;color:#fff;font-size:9px;padding:1px 5px;border-radius:9999px;font-weight:700">MÍNIMO</span>'  : ""}
        </td>
        <td style="font-weight:700;color:#1d4ed8;font-size:13px">${brl(total)}</td>
        <td style="color:#475569">${brl(l.unitario)}<span style="font-size:9px;color:#94a3b8">/un</span></td>
        <td style="color:#64748b">${brl(parc)}<span style="font-size:9px;color:#94a3b8">/mês</span></td>
      </tr>`
  }).join("")

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Proposta — ${p.nomeCliente || "Cliente"} — ${p.data}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:system-ui,-apple-system,sans-serif;font-size:12px;color:#1e293b;background:#fff}
    .page{padding:36px 40px;min-height:100vh}
    .page-break{break-before:page;page-break-before:always}
    h1{font-size:24px;font-weight:800;color:#0f172a;margin-bottom:4px}
    h2{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;font-weight:700;margin:26px 0 10px}
    .logo{display:flex;align-items:center;gap:10px;margin-bottom:20px}
    .logo-text{font-size:20px;font-weight:900;color:#1e3a8a;letter-spacing:-.03em}
    .logo-sub{font-size:10px;color:#64748b;font-weight:400;letter-spacing:.02em;margin-top:1px}
    .header{border-bottom:2px solid #1e3a8a;padding-bottom:16px;margin-bottom:4px}
    .kpis{display:flex;flex-wrap:wrap;gap:10px}
    .kpi{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px 14px;min-width:110px}
    .kpi-label{font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;font-weight:700}
    .kpi-value{font-size:16px;font-weight:800;color:#0f172a;margin-top:3px}
    .kpi-sub{font-size:10px;color:#94a3b8;margin-top:2px}
    table{width:100%;border-collapse:collapse;font-size:11.5px}
    th{background:#f8fafc;padding:7px 10px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:#64748b;font-weight:700;border-bottom:2px solid #e2e8f0;white-space:nowrap}
    td{padding:8px 10px;border-bottom:1px solid #f1f5f9;white-space:nowrap}
    .highlight{background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:16px 20px;margin-top:10px}
    .highlight-title{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#3b82f6;font-weight:700;margin-bottom:6px}
    .highlight-price{font-size:28px;font-weight:900;color:#1d4ed8;line-height:1}
    .highlight-sub{font-size:11px;color:#64748b;margin-top:5px}
    .obs{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px 16px;margin-top:10px;font-size:11px;color:#475569;line-height:1.7}
    .footer{margin-top:32px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:10px;color:#94a3b8}
    .p2-header{background:#1e3a8a;color:#fff;padding:36px 40px 28px}
    .p2-brand{font-size:28px;font-weight:900;letter-spacing:-.03em;margin-bottom:4px}
    .p2-brand span{color:#93c5fd}
    .p2-tagline{font-size:12px;color:#bfdbfe;font-weight:400;letter-spacing:.04em;text-transform:uppercase}
    .p2-body{padding:32px 40px}
    .p2-section-title{font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:#3b82f6;font-weight:700;margin-bottom:10px}
    .p2-heading{font-size:30px;font-weight:900;color:#0f172a;line-height:1.1;margin-bottom:18px}
    .p2-heading span{color:#1e3a8a}
    .p2-cols{display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-top:10px}
    .p2-text{font-size:11.5px;color:#475569;line-height:1.8}
    .p2-text p{margin-bottom:12px}
    .p2-text strong{color:#1e293b}
    .p2-highlights{display:flex;flex-direction:column;gap:12px}
    .p2-highlight-card{background:#f8fafc;border-left:3px solid #1e3a8a;border-radius:0 8px 8px 0;padding:12px 14px}
    .p2-highlight-card .num{font-size:22px;font-weight:900;color:#1e3a8a;line-height:1}
    .p2-highlight-card .label{font-size:10px;color:#64748b;margin-top:2px}
    .p2-divider{border:none;border-top:1px solid #e2e8f0;margin:24px 0}
    .p2-contact-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:4px}
    .p2-contact-item{font-size:10.5px;color:#475569;line-height:1.6}
    .p2-contact-item strong{display:block;font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;font-weight:700;margin-bottom:2px}
    .p2-footer{margin-top:28px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:10px;color:#94a3b8;display:flex;justify-content:space-between;align-items:center}
    .p2-seal{display:inline-flex;align-items:center;gap:6px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:4px 10px;font-size:10px;font-weight:700;color:#1e3a8a}
    @media print{
      .page{padding:16px 20px}
      .p2-header{padding:24px 20px 20px}
      .p2-body{padding:20px}
      @page{margin:0}
    }
  </style>
</head>
<body>

<div class="page">

  <div class="logo">
    <div>
      <div class="logo-text">Jerograf</div>
      <div class="logo-sub">Embalagens Personalizadas</div>
    </div>
  </div>

  <div class="header">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">
      <h1>${p.nomeCliente || "Proposta Comercial"}</h1>
      <span style="font-size:12px;font-weight:700;color:#1e3a8a;background:#eff6ff;border:1px solid #bfdbfe;padding:5px 12px;border-radius:8px;white-space:nowrap">${p.numero}</span>
    </div>
    <p style="color:#64748b;font-size:11px;margin-top:4px">Proposta gerada em ${p.data}</p>
  </div>

  ${p.descricao || p.material || p.dimensoes || p.incluirVerniz || p.comFaca || p.numSKUs > 0 ? `
  <h2>Especificações da Embalagem</h2>
  <div class="kpis">
    ${p.descricao   ? `<div class="kpi"><div class="kpi-label">Produto</div><div class="kpi-value" style="font-size:13px">${p.descricao}</div></div>` : ""}
    ${p.dimensoes   ? `<div class="kpi"><div class="kpi-label">Dimensões</div><div class="kpi-value" style="font-size:13px">${p.dimensoes}</div></div>` : ""}
    ${p.material    ? `<div class="kpi"><div class="kpi-label">Material</div><div class="kpi-value" style="font-size:13px">${p.material}</div></div>` : ""}
    ${p.incluirVerniz ? `<div class="kpi"><div class="kpi-label">Acabamento</div><div class="kpi-value" style="font-size:13px">Verniz UV</div></div>` : ""}
    ${p.comFaca && p.valorFaca > 0 ? `<div class="kpi"><div class="kpi-label">Faca de corte</div><div class="kpi-value" style="font-size:13px">Inclusa</div><div class="kpi-sub">investimento único</div></div>` : ""}
    ${p.numSKUs > 0 ? `<div class="kpi"><div class="kpi-label">Modelos (SKUs)</div><div class="kpi-value">${p.numSKUs}</div></div>` : ""}
  </div>` : ""}

  <h2>Tabela de Preços</h2>
  <table>
    <thead>
      <tr>
        <th>Quantidade</th>
        <th>Preço Total</th>
        <th>Preço Unitário</th>
        <th>Parcelado 12×</th>
      </tr>
    </thead>
    <tbody>${linhasHtml}</tbody>
  </table>

  ${ideal ? `
  <h2>Proposta Recomendada</h2>
  <div class="highlight">
    <div class="highlight-title">Quantidade ideal para melhor custo-benefício</div>
    <div class="highlight-price">${brl(ideal.unitario * ideal.quantidade)}</div>
    <div class="highlight-sub">
      ${num(ideal.quantidade)} unidades ·
      ${brl(ideal.unitario)} por unidade ·
      ou ${brl((ideal.unitario * ideal.quantidade * p.parcFator) / 12)}/mês em 12×
    </div>
  </div>` : ""}

  <div class="obs">
    <strong>Observações:</strong><br>
    • Preços válidos para aprovação em até <strong>${p.validadeDias ?? 7} dias corridos</strong>${dataVencimento ? ` (até ${dataVencimento})` : ""}.<br>
    • Contamos com designer próprio — desenvolvimento de arte incluso sem custo adicional.<br>
    • Prazo de entrega contado a partir da <strong>aprovação final da arte</strong>.<br>
    • A quantidade final do lote pode variar <strong>até 10%</strong> para mais ou para menos.<br>
    • Pagamentos à vista: coletamos <strong>50% do valor total</strong> no fechamento do pedido. O restante é pago somente na entrega.<br>
    ${p.comFaca && p.valorFaca > 0 ? `• A faca de corte é um <strong>investimento único</strong> — reutilizada em todos os pedidos futuros do mesmo produto.<br>` : ""}
    ${minLinha && ideal && minLinha !== ideal ? `• Pedido mínimo: <strong>${num(minLinha.quantidade)} unidades</strong>.<br>` : ""}
    ${p.obsCliente ? `<br>${p.obsCliente.replace(/</g, "&lt;").replace(/\n/g, "<br>")}` : ""}
  </div>

  <div class="footer">
    Jerograf · Embalagens Personalizadas · CNPJ 03.999.896/0001-52 · ${p.data}
  </div>

</div>

<div class="page-break">
  <div class="p2-header">
    <div class="p2-brand">Jerograf<span>.</span></div>
    <div class="p2-tagline">Embalagens que valorizam seu produto</div>
  </div>
  <div class="p2-body">
    <div class="p2-section-title">Nossa história</div>
    <div class="p2-heading">Quem somos<br><span>nós?</span></div>
    <div class="p2-cols">
      <div class="p2-text">
        <p>Fundada em <strong>julho de 2000</strong> pelo Sr. <strong>José Jerônimo de Medeiros</strong>, a Jerograf nasceu com uma missão clara: criar embalagens que valorizem produtos e elevem a experiência do consumidor.</p>
        <p>Com mais de <strong>25 anos de atuação</strong> na região de <strong>Barueri/SP</strong>, construímos uma trajetória sólida baseada em qualidade, comprometimento e relacionamento próximo com cada cliente.</p>
        <p>Desde <strong>2018</strong>, somos referência no setor de perfumaria, atendendo marcas e distribuidores localizados no <strong>Brás e Centro de São Paulo</strong> com embalagens personalizadas que traduzem a identidade e o valor de cada fragrância.</p>
        <p>Nosso processo contempla desde o desenvolvimento da arte e dieline até a entrega final, garantindo consistência visual e padrão de excelência em cada tiragem.</p>
      </div>
      <div>
        <div class="p2-highlights">
          <div class="p2-highlight-card"><div class="num">+25</div><div class="label">Anos de experiência em embalagens personalizadas</div></div>
          <div class="p2-highlight-card"><div class="num">2000</div><div class="label">Ano de fundação — Barueri, São Paulo</div></div>
          <div class="p2-highlight-card"><div class="num">2018</div><div class="label">Início da especialização em embalagens para perfumaria</div></div>
          <div class="p2-highlight-card" style="border-left-color:#3b82f6"><div class="num" style="color:#2563eb;font-size:16px">Brás &amp; Centro SP</div><div class="label">Principal região atendida — polo de perfumaria do Brasil</div></div>
        </div>
      </div>
    </div>
    <hr class="p2-divider">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px">
      <div>
        <div class="p2-section-title" style="margin-bottom:8px">Contato &amp; Localização</div>
        <div class="p2-contact-grid">
          <div class="p2-contact-item"><strong>Endereço</strong>Estrada Velha de Itapevi, 3614<br>Parque dos Camargos · CEP 06444-000<br>Barueri – SP</div>
          <div class="p2-contact-item"><strong>CNPJ</strong>03.999.896/0001-52<br><br><strong>Fundador</strong>José Jerônimo de Medeiros</div>
        </div>
      </div>
      <div class="p2-seal">Jerograf · Desde 2000</div>
    </div>
  </div>
  <div style="padding:0 40px 28px">
    <div class="p2-footer">
      <span>Jerograf Embalagens Personalizadas · CNPJ 03.999.896/0001-52</span>
      <span>Barueri/SP · ${p.data}</span>
    </div>
  </div>
</div>

</body>
</html>`
}
