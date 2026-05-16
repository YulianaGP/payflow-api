"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import Link from "next/link"
import { XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"

const ERROR_CODE_KEYS: Record<string, string> = {
  insufficient_funds: "insufficient_funds",
  card_declined: "card_declined",
  expired_card: "expired_card",
  incorrect_cvc: "incorrect_cvc",
  processing_error: "processing_error",
  INSUFFICIENT_BALANCE: "INSUFFICIENT_BALANCE",
  CURRENCY_MISMATCH: "CURRENCY_MISMATCH",
}

function FailedContent() {
  const t = useTranslations("payment")
  const locale = useLocale()
  const searchParams = useSearchParams()
  const errorCode = searchParams.get("error")
  const localePrefix = locale === "en" ? "" : `/${locale}`

  const errorMessage = errorCode && ERROR_CODE_KEYS[errorCode]
    ? t(`errors.${ERROR_CODE_KEYS[errorCode]}` as any)
    : t("failedMessage")

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="text-center space-y-4 max-w-sm">
        <XCircle className="h-16 w-16 text-destructive mx-auto" />
        <h1 className="text-2xl font-bold">{t("failed")}</h1>
        <p className="text-muted-foreground">{errorMessage}</p>
        <div className="flex flex-col gap-2">
          <Button asChild>
            <Link href={`${localePrefix}/checkout`}>{t("retry")}</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/dashboard">{t("backToDashboard")}</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function PaymentFailedPage() {
  return (
    <Suspense>
      <FailedContent />
    </Suspense>
  )
}
