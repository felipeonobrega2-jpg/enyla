import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { conferirLogin } from "@/app/lib/acessoServidor"
import { ehPapel, type Papel } from "@/app/lib/acesso"

declare module "next-auth" {
  interface Session { papel?: Papel; usuario?: string }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        usuario: { label: "Usuário", type: "text" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        const senha = typeof credentials?.password === "string" ? credentials.password : ""
        const usuario = typeof credentials?.usuario === "string" ? credentials.usuario.trim() : ""
        if (!senha) return null
        // Com usuário: tabela "Usuario" (admin ou diretor). Sem usuário: a senha única de sempre entra como admin.
        if (usuario) {
          const u = await conferirLogin(usuario, senha)
          if (!u) return null
          return { id: u.id, name: u.nome, papel: u.papel, usuario: u.usuario }
        }
        const hash = process.env.ADMIN_PASSWORD_HASH
        if (!hash) return null
        const ok = await bcrypt.compare(senha, hash)
        if (!ok) return null
        return { id: "1", name: "Admin", papel: "admin" as Papel, usuario: "admin" }
      },
    }),
  ],
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        const u = user as { papel?: unknown; usuario?: unknown }
        token.papel = ehPapel(u.papel) ? u.papel : "admin"
        token.usuario = typeof u.usuario === "string" ? u.usuario : "admin"
      }
      // Sessão antiga (de antes do papel existir) é a da senha única: admin
      if (!token.papel) { token.papel = "admin"; token.usuario = "admin" }
      return token
    },
    session({ session, token }) {
      session.papel = ehPapel(token.papel) ? token.papel : "admin"
      session.usuario = typeof token.usuario === "string" ? token.usuario : "admin"
      return session
    },
  },
})
