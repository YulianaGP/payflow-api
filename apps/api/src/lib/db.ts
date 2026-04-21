import { PrismaClient } from "@prisma/client"

// Singleton pattern — prevents multiple PrismaClient instances in development
// (Next.js hot reload would create a new instance on every reload otherwise)
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined }

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env["NODE_ENV"] === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  })

if (process.env["NODE_ENV"] !== "production") {
  globalForPrisma.prisma = db
}
