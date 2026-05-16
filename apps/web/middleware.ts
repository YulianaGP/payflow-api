import createMiddleware from "next-intl/middleware"
import { getToken } from "next-auth/jwt"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const intlMiddleware = createMiddleware({
  locales: ["en", "es"],
  defaultLocale: "en",
  localePrefix: "as-needed",
})

// Matches /dashboard, /accounts, /transactions, /payments, /settings
// and their /es/ prefixed equivalents
const PROTECTED = /^\/(es\/)?(dashboard|accounts|transactions|payments|settings)(\/|$)/

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Mock checkout is a dev tool outside [locale] — skip i18n routing
  if (pathname.startsWith("/mock-checkout")) {
    return NextResponse.next()
  }

  if (PROTECTED.test(pathname)) {
    const token = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET ?? "dev-secret-change-in-production",
    })

    if (!token) {
      const locale = pathname.startsWith("/es/") ? "es" : "en"
      const loginPath = locale === "es" ? "/es/login" : "/login"
      const loginUrl = new URL(loginPath, req.url)
      loginUrl.searchParams.set("callbackUrl", pathname)
      return NextResponse.redirect(loginUrl)
    }
  }

  return intlMiddleware(req)
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)" ],
}
