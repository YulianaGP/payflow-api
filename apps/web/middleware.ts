import createMiddleware from "next-intl/middleware"

export default createMiddleware({
  locales: ["en", "es"],
  defaultLocale: "en",
  localePrefix: "as-needed", // /en/... only shows for non-default; / works for English
})

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
}
