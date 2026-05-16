import type { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import type { AuthResult } from "@payflow/shared-types"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        try {
          const res = await fetch(`${API_URL}/api/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: credentials.email, password: credentials.password }),
          })

          if (!res.ok) return null

          const data: AuthResult = await res.json()
          return {
            id: data.user.id,
            email: data.user.email,
            name: data.user.name ?? "",
            backendToken: data.token,
            merchantId: data.user.merchantId,
            role: data.user.role,
          }
        } catch {
          return null
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.backendToken = user.backendToken
        token.merchantId = user.merchantId
        token.role = user.role
      }
      return token
    },
    async session({ session, token }) {
      session.token = token.backendToken as string
      session.merchantId = token.merchantId as string
      session.role = token.role as string
      return session
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: { strategy: "jwt" },
}
