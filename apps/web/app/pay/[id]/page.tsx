import { notFound } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"

async function getInvoice(id: string) {
  const res = await fetch(`${BASE}/api/invoices/${id}`, { cache: "no-store" })
  if (res.status === 404 || res.status === 410) return null
  if (!res.ok) return null
  return res.json()
}

function fmt(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount / 100)
}

export default async function PublicPayPage({ params }: { params: { id: string } }) {
  const invoice = await getInvoice(params.id)
  if (!invoice) notFound()

  const expired = invoice.expiresAt && new Date(invoice.expiresAt) < new Date()
  const paid = invoice.status === "paid"

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <p className="text-sm font-medium text-muted-foreground">Invoice from PayFlow</p>
          <CardTitle className="text-3xl">{fmt(invoice.amount, invoice.currency)}</CardTitle>
          <p className="text-sm text-muted-foreground">{invoice.description}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {invoice.items && Array.isArray(invoice.items) && invoice.items.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-1 text-left font-medium text-muted-foreground">Item</th>
                  <th className="py-1 text-right font-medium text-muted-foreground">Total</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((item: any, i: number) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-1">{item.name} × {item.quantity}</td>
                    <td className="py-1 text-right">{fmt(item.unitPrice * item.quantity, invoice.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {invoice.expiresAt && (
            <p className="text-xs text-center text-muted-foreground">
              {expired ? "⚠️ This invoice has expired." : `Expires ${new Date(invoice.expiresAt).toLocaleDateString()}`}
            </p>
          )}

          {paid ? (
            <div className="rounded-lg bg-green-50 p-4 text-center">
              <p className="text-lg font-semibold text-green-800">✓ Paid</p>
              <p className="text-sm text-green-700">This invoice has been paid. Thank you!</p>
            </div>
          ) : expired ? (
            <div className="rounded-lg bg-red-50 p-4 text-center">
              <p className="text-sm text-red-800">This invoice has expired and can no longer be paid.</p>
            </div>
          ) : (
            <div className="rounded-lg bg-muted p-4 text-center text-sm text-muted-foreground">
              <p>To pay this invoice, use the payment link provided by the merchant.</p>
              <p className="mt-1 font-mono text-xs opacity-70">Invoice #{invoice.id.slice(0, 16)}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
