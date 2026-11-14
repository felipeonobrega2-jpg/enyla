// Relatório em HTML para imprimir/PDF (Relatórios → Exportar). Veio do Dashboard antigo, que não existe mais.
import { brl, num } from "../utils"
import { LOGO_DARK_B64 } from "../pdf"

export function gerarHtmlRelatorio({
  periodoLabel, dreRec, dreDesp,
  kpisData, topClientesData, materiaisData,
  aReceber, aReceberCount, vencidos, vencidosCount,
  dataGeracao, materiaisEmPedidos = false,
}: {
  materiaisEmPedidos?: boolean
  periodoLabel: string
  dreRec: number; dreDesp: number
  kpisData: { receita: number; vendas: number; ticket: number; conversao: number; pipelineGlobal: number; total: number; clientesUnicos: number }
  topClientesData: { nome: string; total: number; count: number }[]
  materiaisData: { nome: string; count: number; value: number }[]
  aReceber: number; aReceberCount: number
  vencidos: number; vencidosCount: number
  dataGeracao: string
}): string {
  const resultado = dreRec - dreDesp
  const kpiBoxes = [
    { label: "Receita confirmada",   val: brl(dreRec),                      sub: "no período"             },
    { label: "Vendas",               val: String(kpisData.vendas),          sub: `${kpisData.total} orçamentos` },
    { label: "Ticket médio",         val: brl(kpisData.ticket),             sub: "por negócio"            },
    { label: "Conversão",            val: `${num(kpisData.conversao, 1)}%`, sub: "dos orçamentos"         },
  ].map(k => `
    <div class="kpi-box">
      <div class="kpi-label">${k.label}</div>
      <div class="kpi-val">${k.val}</div>
      <div class="kpi-sub">${k.sub}</div>
    </div>`).join("")

  const clientesRows = topClientesData.slice(0, 6).map((c, i) => `
    <tr>
      <td class="muted" style="width:20px">${i + 1}</td>
      <td>${c.nome}</td>
      <td class="right">${brl(c.total)}</td>
      <td class="right muted">${c.count}×</td>
    </tr>`).join("") || `<tr><td colspan="4" class="muted" style="text-align:center;padding:12px">Sem dados</td></tr>`

  const matRows = materiaisData.slice(0, 6).map(m => `
    <tr>
      <td>${m.nome}</td>
      <td class="right">${m.count.toLocaleString("pt-BR")} ${materiaisEmPedidos ? (m.count === 1 ? "pedido" : "pedidos") : "un"}</td>
      <td class="right muted">${brl(m.value)}</td>
    </tr>`).join("") || `<tr><td colspan="3" class="muted" style="text-align:center;padding:12px">Sem dados</td></tr>`

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Relatório · ${periodoLabel}</title>
<style>
  @page { margin: 18mm 16mm; size: A4 portrait; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif; font-size: 10px; color: #191625; line-height: 1.45; -webkit-font-smoothing: antialiased; }
  @media screen { body { padding: 34px 40px; max-width: 900px; margin: 0 auto; } }

  .header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 14px; border-bottom: 1px solid #ebe9f5; margin-bottom: 18px; }
  .brand { font-size: 22px; font-weight: 800; letter-spacing: -0.04em; }
  .header-right { text-align: right; }
  .period { font-size: 13px; font-weight: 700; color: #191625; }
  .gen-date { font-size: 8.5px; color: #898892; margin-top: 2px; }

  h2 { display: flex; align-items: center; gap: 8px; font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.09em; color: #898892; margin-bottom: 8px; }
  h2::after { content: ""; flex: 1; height: 1px; background: #ebe9f5; }
  section { margin-bottom: 15px; }

  .dre { background: #f8f7fc; border-radius: 12px; padding: 12px 16px; }
  .dre-row { display: flex; justify-content: space-between; padding: 3px 0; font-size: 11px; }
  .dre-sep { border-top: 1px solid #ebe9f5; margin: 7px 0 5px; }
  .dre-total { display: flex; justify-content: space-between; font-size: 14px; font-weight: 700; }
  .green { color: #009351; }
  .red   { color: #d33a3c; }
  .tn    { font-variant-numeric: ds-num; }

  .kpi-grid { display: grid; grid-template-columns: repeat(5,1fr); gap: 6px; }
  .kpi-box  { background: #f8f7fc; border-radius: 10px; padding: 9px 11px; }
  .kpi-label { font-size: 7.5px; color: #898892; text-transform: uppercase; letter-spacing: 0.06em; }
  .kpi-val  { font-size: 16px; font-weight: 700; margin: 3px 0 2px; font-variant-numeric: ds-num; }
  .kpi-sub  { font-size: 7.5px; color: #898892; }

  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  th { text-align: left; padding: 5px 8px; background: #f8f7fc; font-size: 7.5px; text-transform: uppercase; letter-spacing: 0.06em; color: #898892; font-weight: 700; }
  td { padding: 6px 8px; border-bottom: 1px solid #ebe9f5; }
  td.right { text-align: right; font-variant-numeric: ds-num; font-weight: 600; }
  td.muted { color: #898892; }

  .fin-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; }
  .fin-box  { border-radius: 12px; padding: 11px 13px; }
  .fin-green { background: #ebf8f0; }
  .fin-amber { background: #fff6e8; }
  .fin-red   { background: #fdeeed; }
  .fin-label { font-size: 7.5px; color: #898892; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 5px; }
  .fin-val   { font-size: 16px; font-weight: 700; font-variant-numeric: ds-num; }
  .fin-green .fin-val { color: #009351; }
  .fin-amber .fin-val { color: #c57800; }
  .fin-red   .fin-val { color: #d33a3c; }
  .fin-sub   { font-size: 8px; margin-top: 3px; }
  .fin-green .fin-sub { color: #5e5c68; }
  .fin-amber .fin-sub { color: #5e5c68; }
  .fin-red   .fin-sub { color: #5e5c68; }

  .footer { border-top: 1px solid #ebe9f5; margin-top: 18px; padding-top: 8px; font-size: 8px; color: #898892; display: flex; justify-content: space-between; }
</style>
</head>
<body>

<div class="header">
  <img src="${LOGO_DARK_B64}" alt="Enyla" style="height:24px;display:block" />
  <div class="header-right">
    <div class="period">Relatório · ${periodoLabel}</div>
    <div class="gen-date">Gerado em ${dataGeracao}</div>
  </div>
</div>

<section>
  <h2>Resultado do Período</h2>
  <div class="dre">
    <div class="dre-row"><span>Receita confirmada</span><span class="green tn">${brl(dreRec)}</span></div>
    <div class="dre-row"><span>Despesas pagas</span><span class="red tn">(${brl(dreDesp)})</span></div>
    <div class="dre-sep"></div>
    <div class="dre-total">
      <span>Resultado líquido</span>
      <span class="${resultado >= 0 ? "green" : "red"} tn">${brl(resultado)}</span>
    </div>
  </div>
</section>

<section>
  <h2>Indicadores Operacionais</h2>
  <div class="kpi-grid">${kpiBoxes}</div>
</section>

<section class="two-col">
  <div>
    <h2>Top Clientes</h2>
    <table>
      <thead><tr><th>#</th><th>Cliente</th><th style="text-align:right">Total</th><th style="text-align:right">Pedidos</th></tr></thead>
      <tbody>${clientesRows}</tbody>
    </table>
  </div>
  <div>
    <h2>Materiais</h2>
    <table>
      <thead><tr><th>Material</th><th style="text-align:right">Qtd</th><th style="text-align:right">Valor</th></tr></thead>
      <tbody>${matRows}</tbody>
    </table>
  </div>
</section>

<section>
  <h2>Situação Financeira (Global)</h2>
  <div class="fin-grid">
    <div class="fin-box fin-green">
      <div class="fin-label">Recebido no período</div>
      <div class="fin-val">${brl(dreRec)}</div>
      <div class="fin-sub">receita confirmada</div>
    </div>
    <div class="fin-box fin-amber">
      <div class="fin-label">A receber</div>
      <div class="fin-val">${brl(aReceber)}</div>
      <div class="fin-sub">${aReceberCount} título${aReceberCount !== 1 ? "s" : ""} pendente${aReceberCount !== 1 ? "s" : ""}</div>
    </div>
    <div class="fin-box fin-red">
      <div class="fin-label">Em atraso</div>
      <div class="fin-val">${brl(vencidos)}</div>
      <div class="fin-sub">${vencidosCount} título${vencidosCount !== 1 ? "s" : ""} vencido${vencidosCount !== 1 ? "s" : ""}</div>
    </div>
  </div>
</section>

<div class="footer">
  <span>Enyla</span>
  <span>${dataGeracao}</span>
</div>

</body>
</html>`
}
