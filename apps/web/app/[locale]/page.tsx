import { redirect } from "next/navigation"

// Root locale page — redirect to dashboard (auth middleware handles protection)
export default function LocaleHomePage() {
  redirect("/dashboard")
}
