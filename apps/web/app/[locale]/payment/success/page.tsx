"use client"

import { Suspense, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useSession } from "next-auth/react"
import { useLocale, useTranslations } from "next-intl"
import Link from "next/link"
import { CheckCircle, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createApiClient } from "@/lib/api"
import type { PaymentDTO } from "@payflow/shared-types"

function formatAmount(cents: number, currency: string) {
  return `${(cents / 100).toFixed(2)} ${currency}`
}

function SuccessContent() {
  const t = useTranslations("payment")
  const locale = useLocale()
  const { data: session } = useSession()
  const searchParams = useSearchParams()
  const orderId = searchParams.get("orderId")
  const [payment, setPayment] = useState<PaymentDTO | null>(null)

  useEffect(() => {
    if (!session?.token || !orderId) return
    createApiClient(session.token)
      .payments.list({ orderId, limit: 1 })
      .then((list) => { if (list.length > 0) setPayment(list[0]!) })
      .catch(() => {})
  }, [session?.token, orderId])

  const localePrefix = locale === "en" ? "" : `/${locale}`

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="text-center space-y-4 max-w-sm w-full">
        <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
        <h1 className="text-2xl font-bold">{t("success")}</h1>
        <p className="text-muted-foreground">{t("successMessage")}</p>

        {payment && (
          <div className="text-left rounded-lg border bg-card p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Amount</span>
              <span className="font-medium">{formatAmount(payment.amount, payment.currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Transaction ID</span>
              <span className="font-mono text-xs">{payment.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Provider</span>
              <span className="font-medium capitalize">{payment.provider}</span>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {payment && (
            <Button variant="outline" asChild>
              <a href={`/api/receipt/${payment.id}`} target="_blank" rel="noreferrer">
                <FileText className="mr-2 h-4 w-4" />
                View receipt
              </a>
            </Button>
          )}
          <Button asChild>
            <Link href={`${localePrefix}/dashboard`}>{t("backToDashboard")}</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function PaymentSuccessPage() {
  return (
    <Suspense>
      <SuccessContent />
    </Suspense>
  )
}
