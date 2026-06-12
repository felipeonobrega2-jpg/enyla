"use client"

import React, { createContext, useContext, useEffect, useState } from "react"

export type ThemeChoice = "system" | "light" | "dark"

type ThemeCtx = { theme: ThemeChoice; setTheme: (t: ThemeChoice) => void; isDark: boolean }

const Ctx = createContext<ThemeCtx>({ theme: "system", setTheme: () => {}, isDark: false })

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeChoice>("system")
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    const stored = (localStorage.getItem("theme") ?? "system") as ThemeChoice
    setThemeState(stored)
  }, [])

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    function apply(t: ThemeChoice, systemDark: boolean) {
      const dark = t === "dark" || (t === "system" && systemDark)
      setIsDark(dark)
      document.documentElement.classList.toggle("dark", dark)
    }
    apply(theme, mq.matches)
    const handler = (e: MediaQueryListEvent) => { if (theme === "system") apply("system", e.matches) }
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [theme])

  function setTheme(t: ThemeChoice) {
    localStorage.setItem("theme", t)
    setThemeState(t)
  }

  return <Ctx.Provider value={{ theme, setTheme, isDark }}>{children}</Ctx.Provider>
}

export function useTheme() { return useContext(Ctx) }
