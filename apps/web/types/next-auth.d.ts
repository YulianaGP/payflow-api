import type { DefaultSession } from "next-auth"
import type { DefaultJWT } from "next-auth/jwt"

declare module "next-auth" {
  interface Session extends DefaultSession {
    token: string
    merchantId: string
    role: string
  }

  interface User {
    role: string
    merchantId: string
    backendToken: string
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    backendToken: string
    merchantId: string
    role: string
  }
}
