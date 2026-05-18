import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"

async function getStatus() {
  try {
    const res = await fetch(`${BASE}/api/status`, { next: { revalidate: 60 } })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

const INDICATOR: Record<string, { dot: string; label: string }> = {
  operational: { dot: "bg-green-500", label: "Operational" },
  degraded:    { dot: "bg-yellow-500", label: "Degraded" },
  down:        { dot: "bg-red-500", label: "Down" },
}

const OVERALL_BG: Record<string, string> = {
  operational: "bg-green-50 border-green-200",
  degraded:    "bg-yellow-50 border-yellow-200",
  down:        "bg-red-50 border-red-200",
}

export default async function StatusPage() {
  const data = await getStatus()

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Could not load status. API may be unavailable.</p>
      </div>
    )
  }

  const overall = (INDICATOR[data.overall] ?? INDICATOR["degraded"])!
  const services = Object.entries(data.services as Record<string, { status: string; latencyMs: number | null; checkedAt: string }>)

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold">PayFlow Status</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Real-time system status • Updated every 60 seconds
          </p>
        </div>

        <div className={`rounded-lg border p-4 ${OVERALL_BG[data.overall] ?? OVERALL_BG.degraded}`}>
          <div className="flex items-center gap-3">
            <div className={`h-4 w-4 rounded-full ${overall.dot}`} />
            <p className="font-semibold">All systems {overall.label.toLowerCase()}</p>
          </div>
          <p className="mt-1 pl-7 text-xs text-muted-foreground">
            Last checked {new Date(data.checkedAt).toLocaleTimeString()}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Services
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {services.map(([name, svc]) => {
              const dot   = INDICATOR[svc.status]?.dot   ?? "bg-yellow-500"
              const label = INDICATOR[svc.status]?.label ?? "Degraded"
              return (
                <div key={name} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`h-2.5 w-2.5 rounded-full ${dot}`} />
                    <span className="text-sm capitalize">{name.replace(/_/g, " ")}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    {svc.latencyMs != null && <span>{svc.latencyMs}ms</span>}
                    <span className={`font-medium ${svc.status === "operational" ? "text-green-700" : svc.status === "down" ? "text-red-700" : "text-yellow-700"}`}>
                      {label}
                    </span>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Powered by PayFlow • <a href="/" className="hover:underline">Back to dashboard</a>
        </p>
      </div>
    </div>
  )
}
