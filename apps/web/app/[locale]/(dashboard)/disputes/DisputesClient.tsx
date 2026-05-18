"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type Dispute = {
  id: string
  paymentId: string
  externalId: string
  status: string
  reason: string
  amount: number
  dueDate: string
  createdAt: string
  payment?: { orderId: string; amount: number; currency: string; provider: string }
}

const STATUS_COLORS: Record<string, string> = {
  needs_response: "bg-red-100 text-red-800",
  open:           "bg-orange-100 text-orange-800",
  under_review:   "bg-blue-100 text-blue-800",
  won:            "bg-green-100 text-green-800",
  lost:           "bg-gray-100 text-gray-700",
}

function daysUntil(iso: string) {
  const diff = new Date(iso).getTime() - Date.now()
  return Math.ceil(diff / 86_400_000)
}

function fmt(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount / 100)
}

export function DisputesClient({ disputes }: { disputes: Dispute[] }) {
  const open = disputes.filter((d) => !["won", "lost"].includes(d.status))
  const closed = disputes.filter((d) => ["won", "lost"].includes(d.status))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Disputes</h1>
        {open.length > 0 && (
          <span className="rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-800">
            {open.length} require action
          </span>
        )}
      </div>

      {disputes.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No disputes — that&apos;s great!
          </CardContent>
        </Card>
      )}

      {open.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Action required
          </h2>
          <div className="space-y-3">
            {open.map((d) => (
              <DisputeCard key={d.id} dispute={d} />
            ))}
          </div>
        </div>
      )}

      {closed.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Closed
          </h2>
          <div className="space-y-3">
            {closed.map((d) => (
              <DisputeCard key={d.id} dispute={d} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function DisputeCard({ dispute: d }: { dispute: Dispute }) {
  const days = daysUntil(d.dueDate)
  const urgent = days <= 3 && !["won", "lost"].includes(d.status)

  return (
    <Card className={urgent ? "border-red-300" : ""}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-mono">{d.payment?.orderId ?? d.paymentId.slice(0, 10)}</CardTitle>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[d.status] ?? "bg-muted"}`}>
            {d.status.replace("_", " ")}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
          <span className="text-muted-foreground">Reason</span>
          <span className="capitalize">{d.reason.replace(/_/g, " ")}</span>
          <span className="text-muted-foreground">Amount</span>
          <span>{d.payment ? fmt(d.payment.amount, d.payment.currency) : `${d.amount} cents`}</span>
          <span className="text-muted-foreground">Provider</span>
          <span className="capitalize">{d.payment?.provider ?? "—"}</span>
          <span className="text-muted-foreground">Response due</span>
          <span className={urgent ? "font-semibold text-red-600" : ""}>
            {new Date(d.dueDate).toLocaleDateString()}
            {!["won", "lost"].includes(d.status) && ` (${days > 0 ? `${days}d left` : "OVERDUE"})`}
          </span>
          <span className="text-muted-foreground">Dispute ID</span>
          <span className="font-mono text-xs">{d.externalId}</span>
        </div>
      </CardContent>
    </Card>
  )
}
