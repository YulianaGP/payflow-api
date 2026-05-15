"use client"

import { signOut, useSession } from "next-auth/react"
import { useLocale, useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import Link from "next/link"
import { AlertTriangle } from "lucide-react"
import { ThemeToggle } from "@/components/layout/ThemeToggle"
import { LocaleSwitcher } from "@/components/layout/LocaleSwitcher"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { LogOut, User } from "lucide-react"
import { createApiClient } from "@/lib/api"
import type { SubscriptionDTO } from "@payflow/shared-types"

function getInitials(name?: string | null): string {
  if (!name) return "PF"
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

export function Header() {
  const t = useTranslations("dashboard")
  const tSub = useTranslations("subscription")
  const { data: session } = useSession()
  const locale = useLocale()
  const loginPath = locale === "en" ? "/login" : "/es/login"
  const initials = getInitials(session?.user?.name)
  const [pastDue, setPastDue] = useState(false)

  useEffect(() => {
    if (!session?.token) return
    const api = createApiClient(session.token as string)
    api.subscriptions.list().then((subs) => {
      const hasPastDue = (subs as SubscriptionDTO[]).some((s) => s.status === "PAST_DUE")
      setPastDue(hasPastDue)
    }).catch(() => {})
  }, [session?.token])

  return (
    <div>
      {/* PAST_DUE banner */}
      {pastDue && (
        <div className="flex items-center justify-center gap-2 bg-destructive px-4 py-2 text-sm text-destructive-foreground">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            Your subscription payment failed.{" "}
            <Link href="/dashboard/subscription" className="underline font-semibold">
              Update your payment method
            </Link>{" "}
            to avoid losing access.
          </span>
        </div>
      )}

      <header className="flex h-14 items-center justify-between border-b bg-background px-4 md:px-6">
        <div className="flex items-center gap-2">
          {/* Mobile menu trigger is rendered inside Sidebar component */}
        </div>
        <div className="flex items-center gap-2">
          <LocaleSwitcher />
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {session?.user?.name && (
                <div className="px-2 py-1.5 text-sm font-medium">{session.user.name}</div>
              )}
              <DropdownMenuItem>
                <User className="mr-2 h-4 w-4" />
                {t("profile")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => signOut({ callbackUrl: loginPath })}
              >
                <LogOut className="mr-2 h-4 w-4" />
                {t("signOut")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
    </div>
  )
}
