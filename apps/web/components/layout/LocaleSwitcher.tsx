"use client"

import { useLocale, useTranslations } from "next-intl"
import { usePathname, useRouter } from "next/navigation"
import { Globe } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const LOCALES = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
]

export function LocaleSwitcher() {
  const locale = useLocale()
  const t = useTranslations("dashboard")
  const pathname = usePathname()
  const router = useRouter()

  function switchLocale(next: string) {
    if (next === locale) return
    let newPath: string
    if (next === "en") {
      newPath = pathname.startsWith("/es") ? pathname.slice(3) || "/" : pathname
    } else {
      newPath = pathname.startsWith("/es") ? pathname : `/es${pathname}`
    }
    document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=31536000; SameSite=Lax`
    router.push(newPath)
    router.refresh()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("language")}>
          <Globe className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {LOCALES.map(({ code, label }) => (
          <DropdownMenuItem
            key={code}
            onClick={() => switchLocale(code)}
            className={locale === code ? "font-semibold" : ""}
          >
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
