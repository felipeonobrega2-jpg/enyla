import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        const hash = process.env.ADMIN_PASSWORD_HASH
        if (!hash || !credentials?.password) return null
        const ok = await bcrypt.compare(credentials.password as string, hash)
        if (!ok) return null
        return { id: "1", name: "Admin" }
      },
    }),
  ],
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
})
