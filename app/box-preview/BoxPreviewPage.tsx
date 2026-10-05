"use client"

import { BoxPreview3D } from "../components/ModalPropostaCustom"

export default function BoxPreviewPage({
  largura, altura, profundidade, verniz,
}: {
  largura: number; altura: number; profundidade: number; verniz: boolean
}) {
  return (
    <div style={{
      minHeight: "100dvh",
      background: "linear-gradient(135deg,#f0ebff 0%,#fafafa 60%,#ebf5ff 100%)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
      padding: "32px 16px",
      gap: 32,
    }}>
      {/* Logo + título */}
      <div style={{ textAlign: "center" }}>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#5009c4", marginBottom: 6 }}>
          Enyla Embalagens
        </p>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", margin: 0, letterSpacing: "-0.02em" }}>
          Visualização 3D da Embalagem
        </h1>
        <p style={{ fontSize: 13, color: "#64748b", marginTop: 6 }}>
          Arraste para girar e explorar todos os ângulos
        </p>
      </div>

      {/* Box 3D */}
      <div style={{
        background: "#fff",
        borderRadius: 24,
        padding: "32px 40px",
        boxShadow: "0 8px 48px rgba(80,9,196,0.10), 0 2px 8px rgba(0,0,0,0.06)",
        border: "1px solid rgba(80,9,196,0.08)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
      }}>
        <BoxPreview3D
          largura={largura}
          altura={altura}
          profundidade={profundidade}
          materialNome={verniz ? "Verniz UV" : undefined}
          incluirVerniz={verniz}
        />
      </div>

      {/* Dimensões */}
      <div style={{ display: "flex", gap: 12 }}>
        {([["Largura", largura], ["Altura", altura], ["Profundidade", profundidade]] as [string, number][]).map(([label, val]) => (
          <div key={label} style={{
            background: "#fff",
            borderRadius: 12,
            padding: "10px 18px",
            textAlign: "center",
            boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
            border: "1px solid rgba(0,0,0,0.06)",
          }}>
            <p style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>{label}</p>
            <p style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", margin: "2px 0 0", fontVariantNumeric: "tabular-nums" }}>
              {val} <span style={{ fontSize: 12, fontWeight: 500, color: "#64748b" }}>cm</span>
            </p>
          </div>
        ))}
        {verniz && (
          <div style={{
            background: "linear-gradient(135deg,#f3eeff,#ede0ff)",
            borderRadius: 12,
            padding: "10px 18px",
            textAlign: "center",
            border: "1px solid rgba(80,9,196,0.15)",
          }}>
            <p style={{ fontSize: 10, color: "#8456e8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>Acabamento</p>
            <p style={{ fontSize: 15, fontWeight: 800, color: "#5009c4", margin: "2px 0 0" }}>Verniz UV</p>
          </div>
        )}
      </div>

      <p style={{ fontSize: 11, color: "#94a3b8", textAlign: "center" }}>
        Esta é uma representação 3D da estrutura da embalagem.<br />
        Arte e impressão finais podem variar conforme o design aprovado.
      </p>
    </div>
  )
}
