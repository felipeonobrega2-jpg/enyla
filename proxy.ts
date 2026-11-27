import { auth } from "@/auth"
import { NextResponse } from "next/server"
import { avaliarGuarda, enxugar } from "@/app/lib/guardaAcesso"
import { CAMPOS_CONFIG_VIGIADOS } from "@/app/lib/acesso"
import { lerInterruptores, registrarAuditoria, usuarioAtivo, lerAntes } from "@/app/lib/acessoServidor"
import { lerCampos } from "@/app/lib/configAtomica"

export default auth(async (req) => {
  const { pathname } = req.nextUrl
  const isPublic =
    pathname.startsWith("/login") ||
    pathname.startsWith("/track") ||
    pathname.startsWith("/pix") ||
    pathname.startsWith("/aprovar") ||
    pathname === "/parceiros" ||                // cadastro público Parceiros ENYLA
    pathname === "/api/parceiros/cadastro" ||
    pathname === "/parceiros/termos" ||         // Termos de Parceria (texto e aceite por token do cadastro)
    pathname === "/api/parceiros/termos" ||

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
    pathname === "/api/mercadopago/webhook" ||  // Mercado Pago (o pagamento é sempre buscado na API com o nosso token)
    pathname === "/api/openi/webhook" ||        // Openi (segredo OPENI_WEBHOOK_SECRET na própria rota)
    pathname === "/api/asaas/webhook" ||        // Asaas (token no cabeçalho; status vem da API)        // Lalamove (só lê o nº da corrida; status vem da API)
    pathname === "/api/meta/cron-refresh" ||
    pathname === "/api/externo" ||               // diretores na nuvem (exige a chave do diretor na própria rota)
    pathname === "/api/prospector/enviar" ||     // agendador da Vercel (mesma regra; chave prospector_envio_ativo desligada por padrão)
    pathname === "/api/banco/cron" ||            // agendador da Vercel, a cada 1h (exige CRON_SECRET na própria rota)
    pathname === "/api/prospector/importar" ||   // agendador da Vercel (exige CRON_SECRET, ou o agendador, na própria rota)
    pathname === "/api/prospector/inbound" ||    // webhook da Resend (email.received e eventos do envio; exige assinatura Svix na própria rota)
    pathname.startsWith("/api/prospector/o/") || // pixel de abertura do e-mail do Prospector (token aleatório; só devolve um GIF 1x1)
    pathname.startsWith("/api/prospector/r/") || // link rastreado do e-mail do Prospector (token aleatório; só redireciona ao /parceiros)
    pathname === "/api/whatsapp/verificar" ||    // agendador da Vercel (mesma regra)     // agendador da Vercel (exige CRON_SECRET na própria rota)
    pathname.startsWith("/api/track") ||
    pathname.startsWith("/brand/") ||
    pathname === "/manifest.webmanifest" ||
    /\.(png|jpg|jpeg|svg|ico|webmanifest)$/.test(pathname)

  if (!req.auth && !isPublic) {
    return NextResponse.redirect(new URL("/login", req.url))
  }

  // Perfil diretor: acesso total, menos o que o admin ligou nos interruptores (todos desligados por padrão).
  // A guarda é do servidor (403 aqui, antes da rota), não depende de botão escondido na tela.
  if (req.auth && pathname.startsWith("/api/") && !pathname.startsWith("/api/auth") && req.auth.papel === "diretor") {
    const usuario = req.auth.usuario ?? "?"
    try {
      if (!(await usuarioAtivo(usuario))) return NextResponse.json({ erro: "Usuário desativado." }, { status: 401 })
      const metodo = req.method
      const escreve = !["GET", "HEAD", "OPTIONS"].includes(metodo)
      let corpo: unknown
      if (escreve && (req.headers.get("content-type") ?? "").includes("json")) corpo = await req.clone().json().catch(() => undefined)
      const r = avaliarGuarda({
        papel: "diretor", metodo, caminho: pathname, corpo,
        configSalva: pathname === "/api/config" && metodo === "POST" ? await lerCampos(CAMPOS_CONFIG_VIGIADOS) : undefined,
        interruptores: await lerInterruptores(),
      })
      if (!r.decisao.permitido) return NextResponse.json({ erro: r.decisao.mensagem, interruptor: r.decisao.interruptor }, { status: 403 })
      if (r.auditar) {
        const antes = r.antesDepois ? r.antesDepois.antes : await lerAntes(pathname)
        await registrarAuditoria({ usuario, papel: "diretor", metodo, caminho: pathname + req.nextUrl.search, antes: enxugar(antes), depois: enxugar(r.antesDepois ? r.antesDepois.depois : corpo) })
      }
    } catch {
      // Falha ao ler interruptor ou usuário: nega, nunca deixa passar sem a guarda
      return NextResponse.json({ erro: "Não foi possível conferir a permissão agora. Tente de novo." }, { status: 503 })
    }
  }
})

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
