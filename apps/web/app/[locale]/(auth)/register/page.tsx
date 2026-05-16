"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useTranslations, useLocale } from "next-intl"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { createApiClient } from "@/lib/api"
import { ApiError } from "@/lib/api"

const registerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email"),
  password: z.string().min(8, "Minimum 8 characters"),
  merchantId: z.string().min(1, "Merchant ID is required"),
  consentAccepted: z.boolean().refine((v) => v === true, {
    message: "You must accept the terms to continue",
  }),
})

type RegisterValues = z.infer<typeof registerSchema>

export default function RegisterPage() {
  const t = useTranslations("auth")
  const locale = useLocale()
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const prefix = locale === "es" ? "/es" : ""

  const { register, handleSubmit, formState: { errors } } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "", merchantId: "", consentAccepted: false },
  })

  async function onSubmit(values: RegisterValues) {
    setIsLoading(true)
    const api = createApiClient()

    try {
      await api.auth.register({
        name: values.name,
        email: values.email,
        password: values.password,
        merchantId: values.merchantId,
        consentAccepted: true,
      })

      const result = await signIn("credentials", {
        redirect: false,
        email: values.email,
        password: values.password,
      })

      if (result?.error) {
        toast.error("Account created — please sign in")
        router.push(`${prefix}/login`)
        return
      }

      router.push("/dashboard")
      router.refresh()
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Registration failed"
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-2xl">{t("register")}</CardTitle>
        <CardDescription>{t("merchantIdHint")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t("name")}</Label>
            <Input id="name" type="text" autoComplete="name" {...register("name")} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">{t("email")}</Label>
            <Input id="email" type="email" autoComplete="email" {...register("email")} />
            {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t("password")}</Label>
            <Input id="password" type="password" autoComplete="new-password" {...register("password")} />
            {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="merchantId">{t("merchantId")}</Label>
            <Input id="merchantId" type="text" placeholder="cm_..." {...register("merchantId")} />
            {errors.merchantId && <p className="text-sm text-destructive">{errors.merchantId.message}</p>}
          </div>
          <div className="flex items-start gap-2">
            <input
              id="consentAccepted"
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-input accent-primary"
              {...register("consentAccepted")}
            />
            <Label htmlFor="consentAccepted" className="text-sm font-normal leading-snug cursor-pointer">
              {t("consent")}
            </Label>
          </div>
          {errors.consentAccepted && (
            <p className="text-sm text-destructive">{errors.consentAccepted.message}</p>
          )}
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? "..." : t("register")}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center">
        <p className="text-sm text-muted-foreground">
          {t("haveAccount")}{" "}
          <Link href={`${prefix}/login`} className="text-foreground hover:underline font-medium">
            {t("login")}
          </Link>
        </p>
      </CardFooter>
    </Card>
  )
}
