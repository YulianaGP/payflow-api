import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { authOptions } from "@/lib/authOptions"
import { createApiClient } from "@/lib/api"
import { DisputesClient } from "./DisputesClient"

export default async function DisputesPage() {
  const session = await getServerSession(authOptions)
  if (!session?.token) redirect("/login")

  const api = createApiClient(session.token)
  const disputes = await api.disputes.list().catch(() => [])

  return <DisputesClient disputes={disputes} />
}
