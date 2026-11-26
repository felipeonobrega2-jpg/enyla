import { auth } from "@/auth"
import { NextResponse } from "next/server"
import { avaliar, bloqueiosDaConfig, bloqueiosDaRota, ehRotaDeConfig, type Bloqueio } from "@/app/lib/acesso"
import { lerInterruptores } from "@/app/lib/usuarios"
import { registrarAuditoria } from "@/app/lib/auditoriaDiretor"

export default auth(async (req) => {
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
    pathname === "/api/prospector/inbound" ||    // webhook da Resend (email.received e eventos do envio; exige assinatura Svix na própria rota)
    pathname.startsWith("/api/prospector/r/") || // link rastreado do e-mail do Prospector (token aleatório; só redireciona ao /parceiros)
    pathname === "/api/whatsapp/verificar" ||    // agendador da Vercel (mesma regra)     // agendador da Vercel (exige CRON_SECRET na própria rota)
    pathname.startsWith("/api/track") ||
    pathname.startsWith("/brand/") ||
    pathname === "/manifest.webmanifest" ||
    /\.(png|jpg|jpeg|svg|ico|webmanifest)$/.test(pathname)

  if (!req.auth && !isPublic) {
    return NextResponse.redirect(new URL("/login", req.url))
  }

  // Perfil diretor: acesso total, menos o que um interruptor bloquear. Conferido AQUI, no servidor, em toda chamada
  // à API (esconder botão na tela não protege nada). Toda alteração do diretor é registrada (quem, quando, antes, depois).
  const u = req.auth?.user as { login?: string; name?: string | null; perfil?: string } | undefined
  if (u?.perfil === "diretor" && pathname.startsWith("/api/") && !isPublic) {
    const metodo = req.method.toUpperCase()
    const escrita = metodo !== "GET" && metodo !== "HEAD" && metodo !== "OPTIONS"
    // Tela de administração: só o admin
    if (pathname === "/api/usuarios/interruptores" && escrita) {
      return NextResponse.json({ erro: "Só o admin muda os interruptores do perfil diretor." }, { status: 403 })
    }
    const ehPixLink = pathname.startsWith("/api/pix-link")   // um GET nesta rota já gera cobrança
    if (escrita || ehPixLink) {
      try {
        const interruptores = await lerInterruptores()
        let antes: unknown = null
        let depois: unknown = null
        let tocados: Bloqueio[] = bloqueiosDaRota(metodo, pathname)
        const corpo = escrita ? await req.clone().text().catch(() => "") : ""
        let json: unknown = null
        try { json = corpo ? JSON.parse(corpo) : null } catch { /* não é JSON (upload, formulário) */ }
        depois = json ?? (corpo ? `[corpo não-JSON, ${corpo.length} caracteres]` : null)
        const cabecalhos = { cookie: req.headers.get("cookie") ?? "" }
        if (ehRotaDeConfig(metodo, pathname) && json && typeof json === "object") {
          // Configuração é salva inteira: só conta o campo que mudou de verdade
          const atual = await fetch(new URL("/api/config", req.url), { headers: cabecalhos }).then(r => r.json()).catch(() => null) as Record<string, unknown> | null
          const novo = json as Record<string, unknown>
          const mudados = Object.keys(novo).filter(k => JSON.stringify(novo[k]) !== JSON.stringify(atual?.[k]))
          tocados = bloqueiosDaConfig(mudados)
          antes = Object.fromEntries(mudados.map(k => [k, atual?.[k] ?? null]))
          depois = Object.fromEntries(mudados.map(k => [k, novo[k]]))
          if (mudados.length === 0) return   // nada mudou: nada a registrar
        } else if (escrita && metodo !== "POST") {
          // Estado de antes: o mesmo endereço lido por GET (quando a rota tem leitura)
          antes = await fetch(req.url, { headers: cabecalhos }).then(r => r.ok ? r.json() : null).catch(() => null)
        }
        const decisao = avaliar(u.perfil, interruptores, tocados)
        const base = { quem: u.login ?? "?", nome: u.name ?? "", perfil: "diretor", metodo, caminho: pathname }
        if (!decisao.ok) {
          await registrarAuditoria({ ...base, resultado: "barrado", bloqueio: decisao.bloqueio, antes: null, depois })
          return NextResponse.json({ erro: decisao.erro, bloqueio: decisao.bloqueio }, { status: decisao.status })
        }
        if (escrita) await registrarAuditoria({ ...base, resultado: "liberado", antes, depois })
      } catch {
        // Sem conferir o interruptor ou sem gravar o registro, a alteração do diretor não passa
        return NextResponse.json({ erro: "Não foi possível conferir a permissão e registrar a alteração. Tente de novo." }, { status: 503 })
      }
    }
  }
  // Tela de usuários: só admin
  if (u?.perfil === "diretor" && pathname.startsWith("/usuarios")) {
    return NextResponse.redirect(new URL("/", req.url))
  }
})

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
