"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { useSession } from "next-auth/react"
import { createApiClient } from "@/lib/api"
import { Button } from "@/components/ui/button"

const POLL_INTERVAL_MS = 3_000
const TIMEOUT_MS = 30_000

function PendingContent() {
  const t = useTranslations("payment")
  const router = useRouter()
  const locale = useLocale()
  const { data: session } = useSession()
  const searchParams = useSearchParams()
  const orderId = searchParams.get("orderId")

  const [timedOut, setTimedOut] = useState(false)
  const activeRef = useRef(true)
  const timeoutHandleRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const paymentIdRef = useRef<string | null>(null)

  const localePrefix = locale === "en" ? "" : `/${locale}`

  function startPolling() {
    if (!session?.token || !orderId) return

    activeRef.current = true
    setTimedOut(false)

    const api = createApiClient(session.token)

    timeoutHandleRef.current = setTimeout(() => {
      activeRef.current = false
      setTimedOut(true)
    }, TIMEOUT_MS)

    const poll = async () => {
      if (!activeRef.current) return
      const controller = new AbortController()
      try {
        if (!paymentIdRef.current) {
          const list = await api.payments.list({ orderId, limit: 1 })
          if (list.length > 0) paymentIdRef.current = list[0]!.id
        }

        if (paymentIdRef.current) {
          const payment = await api.payments.get(paymentIdRef.current, { signal: controller.signal })

          if (payment.status === "SUCCESS") {
            clearTimeout(timeoutHandleRef.current!)
            activeRef.current = false
            router.push(`${localePrefix}/payment/success?orderId=${orderId}`)
            return
          }
          if (payment.status === "FAILED") {
            clearTimeout(timeoutHandleRef.current!)
            activeRef.current = false
            router.push(`${localePrefix}/payment/failed?orderId=${orderId}`)
            return
          }
        }

        if (activeRef.current) setTimeout(poll, POLL_INTERVAL_MS)
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return
        if (activeRef.current) setTimeout(poll, POLL_INTERVAL_MS)
      }
    }

    poll()
  }

  function restartPolling() {
    activeRef.current = false
    clearTimeout(timeoutHandleRef.current!)
    setTimeout(() => startPolling(), 0)
  }

  useEffect(() => {
    startPolling()
    return () => {
      activeRef.current = false
      clearTimeout(timeoutHandleRef.current!)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.token, orderId])

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="text-center space-y-4 max-w-sm">
        {!timedOut ? (
          <>
            <div className="h-10 w-10 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="font-medium">{t("pending")}</p>
            <p className="text-sm text-muted-foreground">{t("pendingNote")}</p>
          </>
        ) : (
          <>
            <p className="font-medium">{t("timedOut")}</p>
            <div className="flex gap-3 justify-center">
              <Button onClick={restartPolling}>{t("checkAgain")}</Button>
              <Button variant="outline">{t("contactSupport")}</Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function PaymentPendingPage() {
  return (
    <Suspense>
      <PendingContent />
    </Suspense>
  )
}
