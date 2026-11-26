import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { conferirLogin } from "@/app/lib/usuarios"

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        usuario: { label: "Usuário", type: "text" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        // Com usuário preenchido: login próprio (perfil do cadastro, ex.: diretor).
        const usuario = String(credentials?.usuario ?? "").trim()
        if (usuario) {
          const u = await conferirLogin(usuario, String(credentials?.password ?? ""))
          if (!u) return null
          return { id: u.login, name: u.nome, login: u.login, perfil: u.perfil } as never
        }
        // Sem usuário: a senha única de sempre entra como admin.
        const hash = process.env.ADMIN_PASSWORD_HASH
        if (!hash || !credentials?.password) return null
        const ok = await bcrypt.compare(credentials.password as string, hash)
        if (!ok) return null
        return { id: "1", name: "Admin", login: "admin", perfil: "admin" } as never
      },
    }),
  ],
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  callbacks: {
    // O perfil vai no token; o proxy e as rotas leem dele. Token antigo (sem perfil) vem da senha única = admin.
    jwt({ token, user }) {
      if (user) {
        const u = user as { login?: string; perfil?: string }
        token.login = u.login ?? "admin"
        token.perfil = u.perfil ?? "admin"
      }
      return token
    },
    session({ session, token }) {
      const u = session.user as unknown as Record<string, unknown>
      u.login = (token.login as string | undefined) ?? "admin"
      u.perfil = (token.perfil as string | undefined) ?? "admin"
      return session
    },
  },
})
