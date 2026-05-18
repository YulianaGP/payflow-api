import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { authOptions } from "@/lib/authOptions"
import { SettingsClient } from "./SettingsClient"

export default async function SettingsPage() {
  const session = await getServerSession(authOptions)
  if (!session?.token) redirect("/login")
  return <SettingsClient token={session.token} />
}
