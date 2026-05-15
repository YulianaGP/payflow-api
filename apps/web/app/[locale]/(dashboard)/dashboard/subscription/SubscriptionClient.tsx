"use client"

import { useState } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { createApiClient } from "@/lib/api"
import { ChangePlanModal } from "./ChangePlanModal"
import type { SubscriptionDTO, PlanDTO } from "@payflow/shared-types"

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  ACTIVE: "default",
  TRIALING: "secondary",
  PAST_DUE: "destructive",
  CANCELED: "outline",
  PAUSED: "outline",
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
}

function formatCents(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100)
}

interface Props {
  subscription: SubscriptionDTO | null
  plans: PlanDTO[]
  token: string
}

export function SubscriptionClient({ subscription: initial, plans, token }: Props) {
  const t = useTranslations("subscription")
  const [subscription, setSubscription] = useState(initial)
  const [modalOpen, setModalOpen] = useState(false)
  const [canceling, setCanceling] = useState(false)

  const api = createApiClient(token)

  async function handleCancel() {
    if (!subscription) return
    if (!confirm(t("cancelConfirm"))) return
    setCanceling(true)
    try {
      const updated = await api.subscriptions.cancel(subscription.id) as SubscriptionDTO
      setSubscription(updated)
      toast.success(t("cancelSuccess"))
    } catch {
      toast.error("Failed to cancel subscription")
    } finally {
      setCanceling(false)
    }
  }

  if (!subscription) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground">{t("noSubscription")}</p>
        </CardContent>
        <CardFooter>
          <Button asChild>
            <Link href="/pricing">{t("browsePlans")}</Link>
          </Button>
        </CardFooter>
      </Card>
    )
  }

  const canChange = subscription.status === "ACTIVE" || subscription.status === "TRIALING"
  const canCancel = !subscription.cancelAtPeriodEnd && subscription.status !== "CANCELED"

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{subscription.plan.name}</CardTitle>
            <Badge variant={STATUS_VARIANT[subscription.status] ?? "outline"}>
              {t(`statuses.${subscription.status}`)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Row label={t("unitPrice")}>
            {formatCents(subscription.unitPrice, subscription.currency)}{" "}
            / {subscription.plan.interval}
          </Row>

          {subscription.status === "TRIALING" && subscription.trialEndsAt && (
            <Row label={t("trialEndsOn")}>{formatDate(subscription.trialEndsAt)}</Row>
          )}

          {subscription.cancelAtPeriodEnd ? (
            <Row label={t("cancelAtPeriodEnd")}>
              {formatDate(subscription.currentPeriodEnd)}
            </Row>
          ) : (
            <Row label={t("nextBilling")}>{formatDate(subscription.currentPeriodEnd)}</Row>
          )}
        </CardContent>
        <CardFooter className="gap-2 flex-wrap">
          {canChange && plans.length > 1 && (
            <Button variant="outline" onClick={() => setModalOpen(true)}>
              {t("changePlan")}
            </Button>
          )}
          {canCancel && (
            <Button variant="destructive" onClick={handleCancel} disabled={canceling}>
              {canceling ? "..." : t("cancelSubscription")}
            </Button>
          )}
        </CardFooter>
      </Card>

      <ChangePlanModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        subscriptionId={subscription.id}
        currentPlanId={subscription.planId}
        plans={plans}
        currency={subscription.currency}
        token={token}
        onSuccess={(updated) => setSubscription(updated)}
      />
    </>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{children}</span>
    </div>
  )
}
