"use client"

import React, { createContext, useContext, useEffect, useState } from "react"
import { usePathname } from "next/navigation"

// Páginas que o cliente abre pelo link (aprovação, pedido digital, portal, Pix, rastreio): sempre claras, mesmo com o
// celular dele no modo escuro (foram desenhadas claras; o tema escuro do sistema é só para a equipe)
export const PAGINA_DO_CLIENTE = /^\/(aprovar|d|c|pix|track|pedido|box-preview)(\/|$)/

export type ThemeChoice = "system" | "light" | "dark"

type ThemeCtx = { theme: ThemeChoice; setTheme: (t: ThemeChoice) => void; isDark: boolean }

const Ctx = createContext<ThemeCtx>({ theme: "system", setTheme: () => {}, isDark: false })

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeChoice>("system")
  const [isDark, setIsDark] = useState(false)
  const pathname = usePathname() ?? ""
  const doCliente = PAGINA_DO_CLIENTE.test(pathname)

  useEffect(() => {
    const stored = (localStorage.getItem("theme") ?? "system") as ThemeChoice
    setThemeState(stored)
  }, [])

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    function apply(t: ThemeChoice, systemDark: boolean) {
      const dark = !doCliente && (t === "dark" || (t === "system" && systemDark))
      setIsDark(dark)
      document.documentElement.classList.toggle("dark", dark)
    }
    apply(theme, mq.matches)
    const handler = (e: MediaQueryListEvent) => { if (theme === "system") apply("system", e.matches) }
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [theme, doCliente])

  function setTheme(t: ThemeChoice) {
    localStorage.setItem("theme", t)
    setThemeState(t)
  }

  return <Ctx.Provider value={{ theme, setTheme, isDark }}>{children}</Ctx.Provider>
}

export function useTheme() { return useContext(Ctx) }
