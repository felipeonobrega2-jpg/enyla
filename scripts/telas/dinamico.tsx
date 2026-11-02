// Substitui next/dynamic nas telas de conferência: carrega o componente com React.lazy
import React from "react"
export default function dynamic<P extends object>(carregar: () => Promise<React.ComponentType<P> | { default: React.ComponentType<P> }>) {
  const Lazy = React.lazy(async () => { const m = await carregar(); return "default" in m ? m : { default: m } })
  return function Dinamico(props: P) { return <React.Suspense fallback={null}><Lazy {...props} /></React.Suspense> }
}
