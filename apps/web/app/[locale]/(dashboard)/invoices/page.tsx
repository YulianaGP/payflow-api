import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { authOptions } from "@/lib/authOptions"
import { createApiClient } from "@/lib/api"
import { InvoicesClient } from "./InvoicesClient"

export default async function InvoicesPage() {
  const session = await getServerSession(authOptions)
  if (!session?.token) redirect("/login")

  const api = createApiClient(session.token)
  const invoices = await api.invoices.list().catch(() => [])

  return <InvoicesClient invoices={invoices} token={session.token} />
}
