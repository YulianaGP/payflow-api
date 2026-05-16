import { getTranslations } from "next-intl/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/authOptions"
import { createApiClient } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PaymentStream } from "@/components/PaymentStream"

export default async function DashboardPage() {
  const [t, session] = await Promise.all([
    getTranslations("dashboard"),
    getServerSession(authOptions),
  ])

  let metrics = { todayRevenue: 0, todayCount: 0, successRate: 0, pendingCount: 0 }

  if (session?.token) {
    try {
      const api = createApiClient(session.token)
      metrics = await api.payments.metrics()
    } catch {
      // silently fall back to zeros — dashboard still renders
    }
  }

  const todayRevenue = `$${(metrics.todayRevenue / 100).toFixed(2)}`

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <PaymentStream />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("paymentsToday")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{metrics.todayCount}</p>
            <p className="text-sm text-muted-foreground">{todayRevenue} revenue</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("successRate")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{metrics.successRate}%</p>
            <p className="text-sm text-muted-foreground">last 30 days</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("pendingPayments")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{metrics.pendingCount}</p>
            <p className="text-sm text-muted-foreground">PENDING + PROCESSING</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
