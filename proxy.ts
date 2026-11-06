import { auth } from "@/auth"
import { NextResponse } from "next/server"

export default auth((req) => {
  const { pathname } = req.nextUrl
  const isPublic =
    pathname.startsWith("/login") ||
    pathname.startsWith("/track") ||
    pathname.startsWith("/pix") ||
    pathname.startsWith("/aprovar") ||
    pathname.startsWith("/d/") ||               // pedido digital (link assinado)
    pathname.startsWith("/api/d/") ||
    pathname.startsWith("/c/") ||
    pathname.startsWith("/api/c/") ||
    pathname.startsWith("/api/aprovar/") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/whatsapp/webhook") ||
    pathname === "/api/frete/webhook" ||        // Lalamove (só lê o nº da corrida; status vem da API)
    pathname === "/api/meta/cron-refresh" ||
    pathname === "/api/whatsapp/verificar" ||    // agendador da Vercel (mesma regra)     // agendador da Vercel (exige CRON_SECRET na própria rota)
    pathname.startsWith("/api/track") ||
    pathname.startsWith("/brand/") ||
    pathname === "/manifest.webmanifest" ||
    /\.(png|jpg|jpeg|svg|ico|webmanifest)$/.test(pathname)

  if (!req.auth && !isPublic) {
    return NextResponse.redirect(new URL("/login", req.url))
  }
})

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
