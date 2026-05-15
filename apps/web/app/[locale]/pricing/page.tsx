import { getServerSession } from "next-auth"
import { getTranslations } from "next-intl/server"
import Link from "next/link"
import { createApiClient } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import type { PlanDTO, SubscriptionDTO } from "@payflow/shared-types"

function formatPrice(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100)
}

export default async function PricingPage() {
  const t = await getTranslations("pricing")
  const session = await getServerSession()

  let plans: PlanDTO[] = []
  let activePlanId: string | null = null

  if (session?.token) {
    const api = createApiClient(session.token as string)
    try {
      ;[plans] = await Promise.all([
        api.plans.list(),
      ])

      // Find user's current active/trialing subscription
      const subscriptions = await api.subscriptions.list()
      const active = (subscriptions as SubscriptionDTO[]).find(
        (s) => s.status === "ACTIVE" || s.status === "TRIALING"
      )
      activePlanId = active?.planId ?? null
    } catch {
      // If fetch fails (e.g. token expired), show empty state — middleware will handle re-auth
    }
  }

  return (
    <div className="min-h-screen bg-background py-16 px-4">
      <div className="mx-auto max-w-5xl">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold tracking-tight mb-3">{t("title")}</h1>
          <p className="text-muted-foreground text-lg">{t("subtitle")}</p>
        </div>

        {plans.length === 0 ? (
          <p className="text-center text-muted-foreground">{t("signUpToSubscribe")}</p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {plans.map((plan) => {
              const isCurrent = plan.id === activePlanId
              return (
                <Card key={plan.id} className={isCurrent ? "border-primary ring-2 ring-primary" : ""}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>{plan.name}</CardTitle>
                      {isCurrent && <Badge>{t("currentPlan")}</Badge>}
                    </div>
                    {plan.description && (
                      <p className="text-sm text-muted-foreground">{plan.description}</p>
                    )}
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold">
                      {formatPrice(plan.price, plan.currency)}
                      <span className="text-base font-normal text-muted-foreground">
                        {" "}{plan.interval === "month" ? t("month") : t("year")}
                      </span>
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {plan.trialDays > 0
                        ? t("trialDays", { days: plan.trialDays })
                        : t("noTrial")}
                    </p>
                  </CardContent>
                  <CardFooter>
                    {session ? (
                      isCurrent ? (
                        <Button className="w-full" variant="outline" disabled>
                          {t("currentPlan")}
                        </Button>
                      ) : (
                        <Button className="w-full" asChild>
                          <Link href="/dashboard/subscription">{t("getStarted")}</Link>
                        </Button>
                      )
                    ) : (
                      <Button className="w-full" asChild>
                        <Link href="/register">{t("getStarted")}</Link>
                      </Button>
                    )}
                  </CardFooter>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
