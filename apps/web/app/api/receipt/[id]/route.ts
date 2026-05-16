import { getToken } from "next-auth/jwt"
import { NextRequest, NextResponse } from "next/server"

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET ?? "dev-secret-change-in-production",
  })
  if (!token) return new NextResponse("Unauthorized", { status: 401 })

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"
  const res = await fetch(`${apiUrl}/api/payments/${params.id}/receipt`, {
    headers: { Authorization: `Bearer ${token.backendToken as string}` },
  })

  if (!res.ok) return new NextResponse("Not found", { status: res.status })

  const html = await res.text()
  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  })
}
