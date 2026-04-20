import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  transpilePackages: ["@payflow/payment-providers"],
}

export default nextConfig
