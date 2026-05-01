import createNextIntlPlugin from "next-intl/plugin"

const withNextIntl = createNextIntlPlugin("./i18n.ts")

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@payflow/payment-providers", "@payflow/shared-types"],
}

export default withNextIntl(nextConfig)
