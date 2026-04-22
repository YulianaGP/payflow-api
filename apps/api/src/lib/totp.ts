import { generateSecret, generateURI, verifySync } from "otplib"
import { createCipheriv, createDecipheriv, randomBytes } from "crypto"

const ENCRYPTION_KEY = process.env["ENCRYPTION_KEY"] ?? "dev-encryption-key-32-chars-long!"
const KEY = Buffer.from(ENCRYPTION_KEY.slice(0, 32).padEnd(32, "0"))

export function generateTotpSecret(): string {
  return generateSecret()
}

export function generateTotpUri(secret: string, email: string): string {
  return generateURI({ issuer: "PayFlow", label: email, secret })
}

export function verifyTotpCode(secret: string, code: string): boolean {
  return verifySync({ secret, token: code }) === true
}

// Encrypts the TOTP secret before saving to DB — never store it in plain text
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(16)
  const cipher = createCipheriv("aes-256-cbc", KEY, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  return `${iv.toString("hex")}:${encrypted.toString("hex")}`
}

export function decryptSecret(encrypted: string): string {
  const [ivHex, dataHex] = encrypted.split(":")
  const iv = Buffer.from(ivHex!, "hex")
  const data = Buffer.from(dataHex!, "hex")
  const decipher = createDecipheriv("aes-256-cbc", KEY, iv)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8")
}
