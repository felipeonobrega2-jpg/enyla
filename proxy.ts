import { auth } from "@/auth"
import { NextResponse } from "next/server"

export default auth((req) => {
  const { pathname } = req.nextUrl
  const isPublic =
    pathname.startsWith("/login") ||
    pathname.startsWith("/track") ||
    pathname.startsWith("/pix") ||
    pathname.startsWith("/aprovar") ||
    pathname === "/parceiros" ||                // cadastro público Parceiros ENYLA
    pathname === "/api/parceiros/cadastro" ||

    pathname.startsWith("/d/") ||               // pedido digital (link assinado)
    pathname.startsWith("/api/d/") ||
    pathname.startsWith("/c/") ||
    pathname.startsWith("/api/c/") ||
    pathname.startsWith("/api/aprovar/") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/whatsapp/webhook") ||
    pathname === "/api/digital/varredura" ||
    pathname === "/api/relatorio/semanal" ||
    pathname === "/api/emails/teste" ||
    pathname === "/api/whatsapp/historico" ||    // histórico do Evolution pelo VPS (exige o segredo do webhook na rota)          // amostra dos e-mails (exige o segredo do webhook na rota)     // relatório semanal do VPS (exige o segredo do webhook na rota)
    pathname === "/api/sistema/vigia" ||          // vigia do VPS (exige o segredo do webhook na rota)     // a rota exige login ou o segredo do webhook
    pathname === "/api/frete/webhook" ||
    pathname === "/api/infinitepay/webhook" ||  // InfinitePay (sem assinatura: só dispara o payment_check)
    pathname === "/api/asaas/webhook" ||        // Asaas (token no cabeçalho; status vem da API)        // Lalamove (só lê o nº da corrida; status vem da API)
    pathname === "/api/meta/cron-refresh" ||
    pathname === "/api/externo" ||               // diretores na nuvem (exige a chave do diretor na própria rota)
    pathname === "/api/prospector/enviar" ||     // agendador da Vercel (mesma regra; chave prospector_envio_ativo desligada por padrão)
    pathname === "/api/prospector/importar" ||   // agendador da Vercel (exige CRON_SECRET, ou o agendador, na própria rota)
    pathname === "/api/prospector/fila-respostas" ||   // agendador da Vercel (mesma regra de autenticação na própria rota)
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
