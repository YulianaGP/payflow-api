"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { createApiClient } from "@/lib/api"

type Invoice = {
  id: string
  amount: number
  currency: string
  description: string
  status: string
  expiresAt?: string | null
  createdAt: string
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  paid:    "bg-green-100 text-green-800",
  expired: "bg-gray-100 text-gray-600",
}

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"

function fmt(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount / 100)
}

export function InvoicesClient({ invoices: initial, token }: { invoices: Invoice[]; token: string }) {
  const router = useRouter()
  const [invoices, setInvoices] = useState(initial)
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState("")
  const [form, setForm] = useState({ description: "", amount: "", currency: "USD", expiresAt: "" })
  const [newPayUrl, setNewPayUrl] = useState("")

  async function handleCreate() {
    if (!form.description || !form.amount) return
    setCreating(true)
    setError("")
    try {
      const api = createApiClient(token)
      const inv = await api.invoices.create({
        description: form.description,
        amount: Math.round(Number(form.amount) * 100),
        currency: form.currency as any,
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : undefined,
      })
      setNewPayUrl((inv as any).payUrl)
      setInvoices((prev) => [inv as Invoice, ...prev])
      setForm({ description: "", amount: "", currency: "USD", expiresAt: "" })
    } catch (e: any) {
      setError(e.message ?? "Failed to create invoice")
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Invoices</h1>
        <Button size="sm" onClick={() => { setCreateOpen(true); setNewPayUrl("") }}>
          New invoice
        </Button>
      </div>

      {invoices.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No invoices yet. Create one and share the link to get paid.
          </CardContent>
        </Card>
      )}

      <div className="rounded-md border overflow-x-auto">
        {invoices.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {["Description", "Amount", "Status", "Expires", "Link"].map((h) => (
                  <th key={h} className="px-4 py-2 text-left font-medium text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-t">
                  <td className="px-4 py-2">{inv.description}</td>
                  <td className="px-4 py-2 font-medium">{fmt(inv.amount, inv.currency)}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[inv.status] ?? ""}`}>
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground text-xs">
                    {inv.expiresAt ? new Date(inv.expiresAt).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-2">
                    <a
                      href={`/pay/${inv.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Open link ↗
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New invoice</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
            <div className="flex gap-2">
              <Input
                placeholder="Amount (e.g. 99.99)"
                type="number"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
              <select
                className="h-9 rounded-md border px-2 text-sm"
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
              >
                {["USD", "ARS", "EUR", "MXN", "CLP", "COP", "PEN"].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Expiry date (optional)</label>
              <Input
                type="date"
                value={form.expiresAt}
                onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            {newPayUrl && (
              <div className="rounded-md bg-green-50 p-3 text-sm">
                <p className="font-medium text-green-800 mb-1">Invoice created!</p>
                <a href={newPayUrl} target="_blank" rel="noopener noreferrer" className="break-all text-blue-600 hover:underline text-xs">
                  {newPayUrl}
                </a>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Close</Button>
            {!newPayUrl && (
              <Button disabled={creating || !form.description || !form.amount} onClick={handleCreate}>
                {creating ? "Creating…" : "Create & get link"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
