"use client"

import { Suspense, useState } from "react"
import { useParams, useSearchParams } from "next/navigation"

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"

function MockCheckout() {
  const params = useParams()
  const searchParams = useSearchParams()
  const externalRef = params["externalRef"] as string
  const successUrl = searchParams.get("successUrl") ?? "/dashboard"
  const failureUrl = searchParams.get("failureUrl") ?? "/dashboard"

  const [loading, setLoading] = useState(false)

  async function pay(status: "SUCCESS" | "FAILED") {
    setLoading(true)
    try {
      await fetch(`${API}/api/webhooks/mock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ externalRef, status }),
      })
    } catch {
      // webhook failed — still redirect so the pending page can handle it
    }
    window.location.href = status === "SUCCESS" ? successUrl : failureUrl
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4">
      <div className="text-center">
        <div className="inline-block bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 text-xs font-medium px-2.5 py-1 rounded-full mb-4">
          Development only
        </div>
        <h1 className="text-2xl font-bold mb-1">Mock Payment Checkout</h1>
        <p className="text-sm text-gray-500 font-mono break-all max-w-sm">{externalRef}</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={() => pay("SUCCESS")}
          disabled={loading}
          className="px-6 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-medium rounded-md transition-colors"
        >
          Pay (success)
        </button>
        <button
          onClick={() => pay("FAILED")}
          disabled={loading}
          className="px-6 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-medium rounded-md transition-colors"
        >
          Pay (fail)
        </button>
        <a
          href="/dashboard"
          className="px-6 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 font-medium rounded-md transition-colors text-center"
        >
          Cancel
        </a>
      </div>

      {loading && (
        <p className="text-sm text-gray-500">Processing...</p>
      )}
    </div>
  )
}

export default function MockCheckoutPage() {
  return (
    <Suspense>
      <MockCheckout />
    </Suspense>
  )
}
