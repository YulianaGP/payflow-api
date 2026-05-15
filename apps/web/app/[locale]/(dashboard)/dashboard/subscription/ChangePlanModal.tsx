"use client"

import { useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { createApiClient, ApiError } from "@/lib/api"
import type { PlanDTO, PlanChangePreviewDTO, SubscriptionDTO } from "@payflow/shared-types"

function formatCents(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100)
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  subscriptionId: string
  currentPlanId: string
  plans: PlanDTO[]
  currency: string
  token: string
  onSuccess: (updated: SubscriptionDTO) => void
}

export function ChangePlanModal({
  open,
  onOpenChange,
  subscriptionId,
  currentPlanId,
  plans,
  currency,
  token,
  onSuccess,
}: Props) {
  const t = useTranslations("subscription.changePlanModal")
  const [selectedPlanId, setSelectedPlanId] = useState<string>("")
  const [preview, setPreview] = useState<PlanChangePreviewDTO | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [isPending, startTransition] = useTransition()

  const api = createApiClient(token)
  const otherPlans = plans.filter((p) => p.id !== currentPlanId)

  async function handleSelectPlan(planId: string) {
    setSelectedPlanId(planId)
    setPreview(null)
    setConfirmed(false)
    setLoadingPreview(true)
    try {
      const data = await api.subscriptions.previewPlanChange(subscriptionId, planId)
      setPreview(data)
    } catch {
      toast.error("Failed to load billing preview")
    } finally {
      setLoadingPreview(false)
    }
  }

  function handleConfirm() {
    if (!selectedPlanId) return
    startTransition(async () => {
      try {
        const updated = await api.subscriptions.changePlan(subscriptionId, selectedPlanId)
        toast.success(t("success"))
        onSuccess(updated as SubscriptionDTO)
        onOpenChange(false)
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : t("paymentFailed")
        toast.error(msg)
      }
    })
  }

  const canConfirm =
    selectedPlanId &&
    preview &&
    !loadingPreview &&
    (preview.netChargeCents === 0 || preview.appliedNextPeriod || confirmed)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Plan selector — button grid */}
          <div>
            <p className="text-sm font-medium mb-3">{t("selectPlan")}</p>
            <div className="space-y-2">
              {otherPlans.map((plan) => (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => handleSelectPlan(plan.id)}
                  className={[
                    "w-full text-left rounded-md border px-4 py-3 text-sm transition-colors",
                    selectedPlanId === plan.id
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border hover:border-primary/50",
                  ].join(" ")}
                >
                  <span className="font-medium">{plan.name}</span>
                  <span className="ml-2 text-muted-foreground">
                    {formatCents(plan.price, plan.currency)} / {plan.interval}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Proration preview */}
          {loadingPreview && (
            <p className="text-sm text-muted-foreground animate-pulse">Loading preview...</p>
          )}

          {preview && !loadingPreview && (
            <div className="rounded-md bg-muted p-4 space-y-2 text-sm">
              <p className="font-medium">{t("preview")}</p>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("daysRemaining")}</span>
                <span>{preview.daysRemaining} / {preview.daysInPeriod}</span>
              </div>
              {!preview.appliedNextPeriod && (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("credit")}</span>
                    <span className="text-green-600">−{formatCents(preview.creditCents, currency)}</span>
                  </div>
                  {preview.creditBalanceCents > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("creditBalance")}</span>
                      <span className="text-green-600">−{formatCents(preview.creditBalanceCents, currency)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("charge")}</span>
                    <span>{formatCents(preview.chargeCents, currency)}</span>
                  </div>
                  <div className="flex justify-between font-semibold border-t pt-2 mt-1">
                    <span>{t("netCharge")}</span>
                    <span>{formatCents(preview.netChargeCents, currency)}</span>
                  </div>
                </>
              )}
              {preview.appliedNextPeriod && (
                <p className="text-muted-foreground italic">{t("appliedNextPeriod")}</p>
              )}
            </div>
          )}

          {/* Confirmation checkbox — only shown when there's a charge */}
          {preview && preview.netChargeCents > 0 && !preview.appliedNextPeriod && (
            <label className="flex items-start gap-2 cursor-pointer text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              <span>
                {t("confirmCharge", {
                  amount: (preview.netChargeCents / 100).toFixed(2),
                  currency,
                })}
              </span>
            </label>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!canConfirm || isPending}>
            {isPending ? "Processing..." : t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
