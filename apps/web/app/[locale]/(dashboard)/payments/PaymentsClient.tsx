"use client"

import { useState, useTransition } from "react"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import type { PaymentDTO } from "@payflow/shared-types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { createApiClient } from "@/lib/api"

type Metrics = { todayRevenue: number; todayCount: number; successRate: number; pendingCount: number }
type AuditEntry = { id: string; fromStatus: string; toStatus: string; changedBy: string; metadata: unknown; createdAt: string }

const STATUS_OPTIONS = ["", "PENDING", "PROCESSING", "SUCCESS", "FAILED", "REFUNDED", "DISPUTED"]
const PROVIDER_OPTIONS = ["", "mock", "mercadopago", "stripe"]

const STATUS_COLORS: Record<string, string> = {
  SUCCESS: "bg-green-100 text-green-800",
  FAILED: "bg-red-100 text-red-800",
  PENDING: "bg-yellow-100 text-yellow-800",
  PROCESSING: "bg-blue-100 text-blue-800",
  REFUNDED: "bg-gray-100 text-gray-700",
  DISPUTED: "bg-orange-100 text-orange-800",
}

function fmt(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount / 100)
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

export function PaymentsClient({
  payments,
  metrics,
  isAdmin,
  token,
  filters,
}: {
  payments: PaymentDTO[]
  metrics: Metrics
  isAdmin: boolean
  token: string
  filters: { status?: string; provider?: string; dateFrom?: string; dateTo?: string; search?: string }
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  // Drawer state
  const [selectedPayment, setSelectedPayment] = useState<PaymentDTO | null>(null)
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Refund dialog state
  const [refundOpen, setRefundOpen] = useState(false)
  const [refundReason, setRefundReason] = useState("")
  const [refundLoading, setRefundLoading] = useState(false)
  const [refundError, setRefundError] = useState("")

  function applyFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    startTransition(() => router.push(`${pathname}?${params.toString()}`))
  }

  async function openDrawer(payment: PaymentDTO) {
    setSelectedPayment(payment)
    setDrawerOpen(true)
    setAuditLog([])
    setAuditLoading(true)
    try {
      const api = createApiClient(token)
      const logs = await api.payments.audit(payment.id)
      setAuditLog(logs)
    } catch {
      setAuditLog([])
    } finally {
      setAuditLoading(false)
    }
  }

  async function submitRefund() {
    if (!selectedPayment || !refundReason.trim()) return
    setRefundLoading(true)
    setRefundError("")
    try {
      const api = createApiClient(token)
      await api.payments.refund(selectedPayment.id, refundReason.trim())
      setRefundOpen(false)
      setRefundReason("")
      setDrawerOpen(false)
      router.refresh()
    } catch (err: any) {
      setRefundError(err.message ?? "Refund failed")
    } finally {
      setRefundLoading(false)
    }
  }

  const exportUrl = (() => {
    const params = new URLSearchParams()
    if (filters.status)   params.set("status", filters.status)
    if (filters.provider) params.set("provider", filters.provider)
    if (filters.dateFrom) params.set("dateFrom", filters.dateFrom)
    if (filters.dateTo)   params.set("dateTo", filters.dateTo)
    if (filters.search)   params.set("search", filters.search)
    const qs = params.toString()
    return `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}/api/payments/export${qs ? `?${qs}` : ""}`
  })()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Payments</h1>
        <a href={exportUrl} download>
          <Button variant="outline" size="sm">Export CSV</Button>
        </a>
      </div>

      {/* Metrics row */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-muted-foreground">Today</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold">{metrics.todayCount} payments</p>
            <p className="text-sm text-muted-foreground">${(metrics.todayRevenue / 100).toFixed(2)} revenue</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-muted-foreground">Success rate (30d)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold">{metrics.successRate}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-muted-foreground">Pending</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold">{metrics.pendingCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Search ID / Order / External…"
          defaultValue={filters.search ?? ""}
          className="h-8 w-56 text-sm"
          onKeyDown={(e) => { if (e.key === "Enter") applyFilter("search", e.currentTarget.value) }}
        />
        <select
          className="h-8 rounded-md border px-2 text-sm"
          value={filters.status ?? ""}
          onChange={(e) => applyFilter("status", e.target.value)}
        >
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s || "All statuses"}</option>)}
        </select>
        <select
          className="h-8 rounded-md border px-2 text-sm"
          value={filters.provider ?? ""}
          onChange={(e) => applyFilter("provider", e.target.value)}
        >
          {PROVIDER_OPTIONS.map((p) => <option key={p} value={p}>{p || "All providers"}</option>)}
        </select>
        <input
          type="date"
          className="h-8 rounded-md border px-2 text-sm"
          value={filters.dateFrom ?? ""}
          onChange={(e) => applyFilter("dateFrom", e.target.value)}
        />
        <input
          type="date"
          className="h-8 rounded-md border px-2 text-sm"
          value={filters.dateTo ?? ""}
          onChange={(e) => applyFilter("dateTo", e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              {["ID", "Order", "Status", "Amount", "Provider", "Date"].map((h) => (
                <th key={h} className="px-4 py-2 text-left font-medium text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {payments.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No payments found</td></tr>
            )}
            {payments.map((p) => (
              <tr
                key={p.id}
                className="border-t cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => openDrawer(p)}
              >
                <td className="px-4 py-2 font-mono text-xs">{p.id.slice(0, 10)}…</td>
                <td className="px-4 py-2 font-mono text-xs">{p.orderId}</td>
                <td className="px-4 py-2">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[p.status] ?? ""}`}>
                    {p.status}
                  </span>
                </td>
                <td className="px-4 py-2 font-medium">{fmt(p.amount, p.currency)}</td>
                <td className="px-4 py-2 capitalize text-muted-foreground">{p.provider}</td>
                <td className="px-4 py-2 text-muted-foreground">{fmtDate(p.createdAt as unknown as string)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Audit log drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selectedPayment && (
            <>
              <SheetHeader className="mb-4">
                <SheetTitle>Payment detail</SheetTitle>
                <p className="font-mono text-xs text-muted-foreground">{selectedPayment.id}</p>
              </SheetHeader>

              <div className="mb-4 grid grid-cols-2 gap-2 text-sm">
                <span className="text-muted-foreground">Status</span>
                <span className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[selectedPayment.status] ?? ""}`}>
                  {selectedPayment.status}
                </span>
                <span className="text-muted-foreground">Amount</span>
                <span className="font-medium">{fmt(selectedPayment.amount, selectedPayment.currency)}</span>
                <span className="text-muted-foreground">Provider</span>
                <span className="capitalize">{selectedPayment.provider}</span>
                <span className="text-muted-foreground">Order ID</span>
                <span className="font-mono text-xs">{selectedPayment.orderId}</span>
              </div>

              {/* Refund button (admin only, SUCCESS only) */}
              {isAdmin && selectedPayment.status === "SUCCESS" && (
                <Button
                  variant="destructive"
                  size="sm"
                  className="mb-6"
                  onClick={() => setRefundOpen(true)}
                >
                  Issue refund
                </Button>
              )}

              <h3 className="mb-2 text-sm font-semibold">Audit log</h3>
              {auditLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
              {!auditLoading && auditLog.length === 0 && (
                <p className="text-sm text-muted-foreground">No audit entries.</p>
              )}
              <ol className="space-y-3">
                {auditLog.map((entry) => (
                  <li key={entry.id} className="rounded-md border p-3 text-sm">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[entry.fromStatus] ?? "bg-muted"}`}>{entry.fromStatus}</span>
                      <span className="text-muted-foreground">→</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[entry.toStatus] ?? "bg-muted"}`}>{entry.toStatus}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">by {entry.changedBy} · {fmtDate(entry.createdAt)}</p>
                  </li>
                ))}
              </ol>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Refund dialog */}
      <Dialog open={refundOpen} onOpenChange={setRefundOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Issue refund</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Refund {selectedPayment ? fmt(selectedPayment.amount, selectedPayment.currency) : ""} to customer. This action is recorded in the audit log.
          </p>
          <Input
            placeholder="Reason (required)"
            value={refundReason}
            onChange={(e) => setRefundReason(e.target.value)}
          />
          {refundError && <p className="text-sm text-destructive">{refundError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefundOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!refundReason.trim() || refundLoading}
              onClick={submitRefund}
            >
              {refundLoading ? "Processing…" : "Confirm refund"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
