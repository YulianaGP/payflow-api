"use client"

import { useSearchParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function CashInstructions() {
  const params = useSearchParams()
  const voucherCode   = params.get("voucherCode") ?? ""
  const networkName   = params.get("networkName") ?? "Payment Network"
  const instructions  = params.get("instructions") ?? ""
  const expiresAt     = params.get("expiresAt")
  const amount        = params.get("amount")
  const currency      = params.get("currency") ?? "USD"

  const formattedAmount = amount
    ? new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(amount) / 100)
    : null

  const expiryDate = expiresAt ? new Date(expiresAt).toLocaleDateString() : null

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-yellow-100">
            <span className="text-2xl">🏪</span>
          </div>
          <CardTitle>Pay at {networkName}</CardTitle>
          <p className="text-sm text-muted-foreground">Your payment voucher is ready</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {formattedAmount && (
            <div className="rounded-lg bg-muted p-4 text-center">
              <p className="text-sm text-muted-foreground">Amount to pay</p>
              <p className="text-3xl font-bold">{formattedAmount}</p>
            </div>
          )}

          <div className="rounded-lg border-2 border-dashed p-4 text-center">
            <p className="mb-1 text-xs text-muted-foreground uppercase tracking-wide">Voucher code</p>
            <p className="font-mono text-xl font-bold tracking-widest">{voucherCode}</p>
          </div>

          {instructions && (
            <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
              {instructions}
            </div>
          )}

          {expiryDate && (
            <p className="text-center text-xs text-muted-foreground">
              Voucher expires on <strong>{expiryDate}</strong>
            </p>
          )}

          <p className="text-center text-xs text-muted-foreground">
            Once you pay, your order will be confirmed automatically. You can close this page.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
