import { Suspense } from "react"
import { CashInstructions } from "./CashInstructions"

export default function CashPaymentPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Loading…</div>}>
      <CashInstructions />
    </Suspense>
  )
}
