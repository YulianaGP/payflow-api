import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { createApiClient } from "@/lib/api"
import { SubscriptionClient } from "./SubscriptionClient"
import type { SubscriptionDTO, PlanDTO } from "@payflow/shared-types"

export default async function SubscriptionPage() {
  const session = await getServerSession()
  if (!session?.token) redirect("/login")

  const t = await getTranslations("subscription")
  const api = createApiClient(session.token as string)

  let subscriptions: SubscriptionDTO[] = []
  let plans: PlanDTO[] = []

  try {
    ;[subscriptions, plans] = await Promise.all([
      api.subscriptions.list() as Promise<SubscriptionDTO[]>,
      api.plans.list() as Promise<PlanDTO[]>,
    ])
  } catch {
    // Surface as empty state — token may be expired, middleware will redirect
  }

  const active = subscriptions.find(
    (s) => s.status === "ACTIVE" || s.status === "TRIALING" || s.status === "PAST_DUE"
  ) ?? null

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <SubscriptionClient
        subscription={active}
        plans={plans}
        token={session.token as string}
      />
    </div>
  )
}
