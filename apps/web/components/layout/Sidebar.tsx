"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { LayoutDashboard, CreditCard, Wallet, ArrowLeftRight, Settings, ChevronLeft, ChevronRight, Menu } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"

const NAV_ITEMS = [
  { href: "/dashboard",     icon: LayoutDashboard,  label: "Dashboard" },
  { href: "/payments",      icon: CreditCard,        label: "Payments" },
  { href: "/accounts",      icon: Wallet,            label: "Accounts" },
  { href: "/transactions",  icon: ArrowLeftRight,    label: "Transactions" },
  { href: "/settings",      icon: Settings,          label: "Settings" },
]

function NavItems({ collapsed }: { collapsed: boolean }) {
  const pathname = usePathname()
  return (
    <nav className="flex flex-col gap-1 px-2">
      {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
        const active = pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span>{label}</span>}
          </Link>
        )
      })}
    </nav>
  )
}

// Desktop sidebar — collapsible
function DesktopSidebar() {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col border-r bg-background transition-all duration-200",
        collapsed ? "w-16" : "w-60"
      )}
    >
      <div className="flex h-14 items-center justify-between px-4 border-b">
        {!collapsed && <span className="font-bold text-lg">PayFlow</span>}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed((c) => !c)}
          className="ml-auto"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto py-4">
        <NavItems collapsed={collapsed} />
      </div>
    </aside>
  )
}

// Mobile sidebar — Sheet (drawer)
function MobileSidebar() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-60 p-0">
        <div className="flex h-14 items-center border-b px-4">
          <span className="font-bold text-lg">PayFlow</span>
        </div>
        <div className="py-4">
          <NavItems collapsed={false} />
        </div>
      </SheetContent>
    </Sheet>
  )
}

export function Sidebar() {
  return (
    <>
      <DesktopSidebar />
      <MobileSidebar />
    </>
  )
}
