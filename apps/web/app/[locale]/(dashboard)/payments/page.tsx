import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { authOptions } from "@/lib/authOptions"
import { createApiClient } from "@/lib/api"
import { PaymentsClient } from "./PaymentsClient"

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: { status?: string; provider?: string; dateFrom?: string; dateTo?: string; search?: string }
}) {
  const session = await getServerSession(authOptions)
  if (!session?.token) redirect("/login")

  const api = createApiClient(session.token)

  const [payments, metrics] = await Promise.all([
    api.payments.list({
      status: searchParams.status,
      provider: searchParams.provider,
      dateFrom: searchParams.dateFrom,
      dateTo: searchParams.dateTo,
      search: searchParams.search,
      limit: 100,
    }).catch(() => []),
    api.payments.metrics().catch(() => ({ todayRevenue: 0, todayCount: 0, successRate: 0, pendingCount: 0 })),
  ])

  const isAdmin = session.role === "ADMIN"

  return (
    <PaymentsClient
      payments={payments}
      metrics={metrics}
      isAdmin={isAdmin}
      token={session.token}
      filters={searchParams}
    />
  )
}
