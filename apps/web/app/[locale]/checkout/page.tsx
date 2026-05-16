"use client"

import { useRef, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { useSession } from "next-auth/react"
import { nanoid } from "nanoid"
import { createApiClient, ApiError } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
const CURRENCIES = ["USD", "ARS", "EUR", "MXN", "CLP", "COP"]

export default function CheckoutPage() {
  const t = useTranslations("payment")
  const tCommon = useTranslations("common")
  const locale = useLocale()
  const { data: session } = useSession()

  const orderIdRef = useRef(nanoid())
  const idempotencyKeyRef = useRef(nanoid())

  const [amount, setAmount] = useState("")
  const [currency, setCurrency] = useState("USD")
  const [description, setDescription] = useState("")
  const [email, setEmail] = useState(session?.user?.email ?? "")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!session?.token) return
    setLoading(true)
    setError(null)

    const orderId = orderIdRef.current
    const localePrefix = locale === "en" ? "" : `/${locale}`
    const origin = window.location.origin

    try {
      const api = createApiClient(session.token)
      const result = await api.payments.create({
        orderId,
        amount: Math.round(parseFloat(amount) * 100),
        currency,
        description,
        customerEmail: email,
        successUrl: `${origin}${localePrefix}/payment/success?orderId=${orderId}`,
        failureUrl: `${origin}${localePrefix}/payment/failed?orderId=${orderId}`,
        idempotencyKey: idempotencyKeyRef.current,
      })

      window.location.href = result.redirectUrl
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("error"))
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t("checkoutTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="amount">{t("amount")}</Label>
                <Input
                  id="amount"
                  type="number"
                  min="0.50"
                  step="0.01"
                  placeholder="10.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="currency">{t("currency")}</Label>
                <select
                  id="currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description">{t("description")}</Label>
              <Input
                id="description"
                placeholder="Order #123"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                maxLength={500}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">{t("email")}</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? tCommon("loading") : t("checkoutSubmit")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
