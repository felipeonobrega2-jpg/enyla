import { FormData, Calculo, PropostaCustom } from "./types"

type HistoricoItem = { form: FormData; calculo: Calculo; data: string; numero?: string }

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

  <div class="logo">ENYLA <span>Orçamentista de Embalagens</span></div>

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
