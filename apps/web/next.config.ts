import type { NextConfig } from "next"
import createNextIntlPlugin from "next-intl/plugin"

const withNextIntl = createNextIntlPlugin("./i18n.ts")

const nextConfig: NextConfig = {
  transpilePackages: ["@payflow/payment-providers", "@payflow/shared-types"],
}

export default withNextIntl(nextConfig)
