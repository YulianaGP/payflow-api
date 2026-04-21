import { SignJWT, jwtVerify } from "jose"

const secret = new TextEncoder().encode(
  process.env["NEXTAUTH_SECRET"] ?? "dev-secret-change-in-production"
)

export interface JwtPayload {
  sub: string       // userId
  merchantId: string
  role: string
  jti: string       // JWT ID — used for revocation
}

export async function signJwt(payload: JwtPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret)
}

export async function verifyJwt(token: string): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, secret)
  return payload as unknown as JwtPayload
}
