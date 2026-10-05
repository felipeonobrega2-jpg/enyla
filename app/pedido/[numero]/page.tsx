import { notFound } from "next/navigation"
import { createClient } from "@supabase/supabase-js"
import { KanbanCard, PedidoArquivo, COLUNAS_KANBAN } from "@/app/types"

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

function brl(n: number) {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtDate(iso?: string | null) {
  if (!iso) return "—"
  return new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
}

const ICON_COLOR: Record<string, string> = {
  arte: "#7c3aed", faca: "#0ea5e9", mockup: "#10b981", referencia: "#f59e0b", outro: "#6b7280"
}
const ICON_ABBR: Record<string, string> = {
  arte: "Arte", faca: "Faca", mockup: "Mock", referencia: "Ref", outro: "Arq"
}
const TIPO_LABEL: Record<string, string> = {
  arte: "Arte", faca: "Faca / Dieline", mockup: "Mockup", referencia: "Referência", outro: "Outro"
}

const CHECKLIST = [
  "Arte aprovada pelo cliente",
  "Arquivo de arte enviado",
  "Faca / dieline enviada",
  "Papel e gramatura confirmados",
  "Prazo acordado com a gráfica",
  "Quantidade confirmada",
]

export default async function PedidoPublicoPage({ params }: { params: Promise<{ numero: string }> }) {
  const { numero } = await params
  const decoded = decodeURIComponent(numero)

  const { data: cardRaw } = await supabaseAdmin
    .from("KanbanCard")
    .select("*")
    .eq("numero", decoded)
    .single()

  if (!cardRaw) notFound()

  const card = cardRaw as KanbanCard & { observacoes_os?: string }
  const observacoesOS = card.observacoesOS ?? card.observacoes_os

  const { data: arquivos } = await supabaseAdmin
    .from("pedido_arquivos")
    .select("*")
    .eq("card_id", card.id)
    .order("created_at", { ascending: true })

  const files = (arquivos ?? []) as PedidoArquivo[]
  const etapa = COLUNAS_KANBAN[card.coluna] ?? "—"

  return (
    <html lang="pt-BR">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Pedido {card.numero} — {card.nomeCliente}</title>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0 }
          body { font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; background: #f5f5f7; color: #1a1a1a; min-height: 100vh }
          .wrap { max-width: 680px; margin: 0 auto; padding: 32px 16px 64px }
          .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 28px }
          .logo { font-size: 20px; font-weight: 800; color: #5009c4; letter-spacing: -0.5px }
          .num { font-size: 13px; font-weight: 700; color: #5009c4; background: rgba(80,9,196,.1); padding: 4px 12px; border-radius: 20px }
          .card { background: #fff; border-radius: 16px; padding: 24px; margin-bottom: 16px; border: 1px solid rgba(60,60,67,.1) }
          .section-title { font-size: 10px; text-transform: uppercase; letter-spacing: .08em; font-weight: 700; color: #8e8e93; margin-bottom: 14px }
          .cliente { font-size: 22px; font-weight: 800; color: #1a1a1a; margin-bottom: 4px }
          .badge { display: inline-block; background: rgba(80,9,196,.08); color: #5009c4; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 20px; border: 1px solid rgba(80,9,196,.15) }
          .row { display: flex; justify-content: space-between; align-items: flex-start; padding: 8px 0; border-bottom: 1px solid #f0f0f0 }
          .row:last-child { border-bottom: none }
          .lbl { font-size: 12px; color: #8e8e93; flex: 0 0 45% }
          .val { font-size: 13px; font-weight: 600; color: #1a1a1a; text-align: right }
          .file-item { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid #f5f5f7 }
          .file-item:last-child { border-bottom: none }
          .file-icon { font-size: 22px; flex-shrink: 0 }
          .file-info { flex: 1; min-width: 0 }
          .file-name { font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
          .file-meta { font-size: 11px; color: #8e8e93; margin-top: 2px }
          .download-btn { flex-shrink: 0; background: #5009c4; color: #fff; font-size: 12px; font-weight: 600; padding: 7px 16px; border-radius: 10px; text-decoration: none; white-space: nowrap }
          .checklist { display: flex; flex-direction: column; gap: 8px }
          .check-item { display: flex; align-items: center; gap: 10px; font-size: 13px; color: #3a3a3c }
          .check-box { width: 18px; height: 18px; border: 2px solid #d1d1d6; border-radius: 5px; flex-shrink: 0 }
          .obs { background: #fffbf0; border: 1px solid rgba(255,149,0,.2); border-radius: 10px; padding: 14px 16px; font-size: 13px; line-height: 1.6; white-space: pre-wrap; color: #333 }
          .empty { text-align: center; color: #8e8e93; font-size: 13px; padding: 20px 0 }
          .footer { text-align: center; font-size: 11px; color: #aeaeb2; margin-top: 32px }
          @media print {
            body { background: #fff }
            .wrap { max-width: 100%; padding: 0 }
            .download-btn { display: none }
          }
        `}</style>
      </head>
      <body>
        <div className="wrap">
          <div className="header">
            <div className="logo">Enyla</div>
            <div className="num">Pedido {card.numero}</div>
          </div>

          {/* Cliente + etapa */}
          <div className="card">
            <div className="section-title">Identificação</div>
            <div className="cliente">{card.nomeCliente}</div>
            <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" as const, alignItems: "center" }}>
              <span className="badge">{etapa}</span>
              {card.dataEntregaPrevista && (
                <span style={{ fontSize: 12, color: "#8e8e93" }}>Entrega prevista: <strong style={{ color: "#1a1a1a" }}>{fmtDate(card.dataEntregaPrevista)}</strong></span>
              )}
            </div>
          </div>

          {/* Especificações */}
          <div className="card">
            <div className="section-title">Especificações</div>
            {[
              ["Material", card.materialNome],
              ["Quantidade", `${card.quantidade.toLocaleString("pt-BR")} un`],
              ["Dimensões", card.dimensoes ? `${card.dimensoes} cm` : null],
              ["Cores", card.cores],
              ["Acabamentos", card.acabamentos?.join(", ")],
              ["Fechamento", fmtDate(card.dataFechamento)],
            ].filter(([, v]) => v).map(([l, v]) => (
              <div className="row" key={String(l)}>
                <div className="lbl">{l}</div>
                <div className="val">{v}</div>
              </div>
            ))}
          </div>

          {/* Arquivos */}
          <div className="card">
            <div className="section-title">Arquivos ({files.length})</div>
            {files.length === 0 ? (
              <div className="empty">Nenhum arquivo anexado ainda.</div>
            ) : (
              files.map(f => (
                <div className="file-item" key={f.id}>
                  <div className="file-icon" style={{ background: `${ICON_COLOR[f.tipo] ?? "#6b7280"}18`, color: ICON_COLOR[f.tipo] ?? "#6b7280", fontSize: 9, fontWeight: 700, letterSpacing: "0.02em" }}>{ICON_ABBR[f.tipo] ?? "ARQ"}</div>
                  <div className="file-info">
                    <div className="file-name">{f.nome}</div>
                    <div className="file-meta">{TIPO_LABEL[f.tipo] ?? f.tipo} · {f.tamanho ? `${(f.tamanho / 1024).toFixed(0)} KB` : ""}</div>
                  </div>
                  <a className="download-btn" href={f.url} target="_blank" rel="noreferrer" download={f.nome}>↓ Baixar</a>
                </div>
              ))
            )}
          </div>

          {/* Observações */}
          {observacoesOS && (
            <div className="card">
              <div className="section-title">Observações para a gráfica</div>
              <div className="obs">{observacoesOS}</div>
            </div>
          )}

          {/* Checklist */}
          <div className="card">
            <div className="section-title">Checklist de conferência</div>
            <div className="checklist">
              {CHECKLIST.map(item => (
                <div className="check-item" key={item}>
                  <div className="check-box" />
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="footer">
            Enyla · Jerograf Embalagens Personalizadas · Pedido {card.numero}
          </div>
        </div>
      </body>
    </html>
  )
}
