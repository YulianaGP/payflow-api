import type {
  PaymentDTO,
  CreatePaymentResult,
  AccountDTO,
  AccountListResult,
  TransactionDTO,
  TransactionListResult,
  AuthResult,
  PlanDTO,
  SubscriptionDTO,
  PlanChangePreviewDTO,
} from "@payflow/shared-types"

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string
  ) {
    super(message)
    this.name = "ApiError"
  }
}

export function createApiClient(token?: string) {
  async function request<T>(
    path: string,
    init?: RequestInit
  ): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
      ...init,
    })

    if (res.status === 401 && typeof window !== "undefined") {
      const { signOut } = await import("next-auth/react")
      await signOut({ callbackUrl: "/login" })
      // Page is navigating away — throw so callers know the request failed
      throw new ApiError("Session expired", 401)
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "Request failed" }))
      throw new ApiError(
        body.error ?? "Request failed",
        res.status,
        body.code
      )
    }

    return res.json() as Promise<T>
  }

  return {
    auth: {
      login: (body: { email: string; password: string }) =>
        request<AuthResult>("/api/auth/login", { method: "POST", body: JSON.stringify(body) }),
      register: (body: { name: string; email: string; password: string; merchantId: string; consentAccepted: true }) =>
        request<AuthResult>("/api/auth/register", { method: "POST", body: JSON.stringify(body) }),
      forgotPassword: (body: { email: string }) =>
        request<{ message: string }>("/api/auth/forgot-password", { method: "POST", body: JSON.stringify(body) }),
      resetPassword: (body: { token: string; password: string }) =>
        request<{ message: string }>("/api/auth/reset-password", { method: "POST", body: JSON.stringify(body) }),
    },

    payments: {
      get: (id: string, init?: Pick<RequestInit, "signal">) =>
        request<PaymentDTO>(`/api/payments/${id}`, init),
      list: (params?: { status?: string; provider?: string; dateFrom?: string; dateTo?: string; search?: string; orderId?: string; limit?: number }) => {
        const qs = new URLSearchParams(
          Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v != null)) as Record<string, string>
        ).toString()
        return request<PaymentDTO[]>(`/api/payments${qs ? `?${qs}` : ""}`)
      },
      create: (body: Record<string, unknown>) =>
        request<CreatePaymentResult>("/api/payments", { method: "POST", body: JSON.stringify(body) }),
      metrics: () =>
        request<{ todayRevenue: number; todayCount: number; successRate: number; pendingCount: number }>("/api/payments/metrics"),
      audit: (id: string) =>
        request<Array<{ id: string; fromStatus: string; toStatus: string; changedBy: string; metadata: unknown; createdAt: string }>>(`/api/payments/${id}/audit`),
      refund: (id: string, reason: string) =>
        request<{ refunded: boolean }>(`/api/payments/${id}/refund`, { method: "POST", body: JSON.stringify({ reason }) }),
    },

    accounts: {
      list: (params?: { cursor?: string; limit?: number; status?: string }) => {
        const qs = new URLSearchParams(params as Record<string, string>).toString()
        return request<AccountListResult>(`/api/accounts${qs ? `?${qs}` : ""}`)
      },
      get: (id: string) => request<AccountDTO>(`/api/accounts/${id}`),
    },

    transactions: {
      list: (params?: { cursor?: string; limit?: number; accountId?: string }) => {
        const qs = new URLSearchParams(params as Record<string, string>).toString()
        return request<TransactionListResult>(`/api/transactions${qs ? `?${qs}` : ""}`)
      },
      get: (id: string, init?: Pick<RequestInit, "signal">) =>
        request<TransactionDTO>(`/api/transactions/${id}`, init),
    },

    plans: {
      list: (onlyActive = true) =>
        request<PlanDTO[]>(`/api/plans${onlyActive ? "" : "?all=true"}`),
      get: (id: string) => request<PlanDTO>(`/api/plans/${id}`),
      create: (body: Record<string, unknown>) =>
        request<PlanDTO>("/api/plans", { method: "POST", body: JSON.stringify(body) }),
    },

    disputes: {
      list: () => request<any[]>("/api/disputes"),
      get: (id: string) => request<any>(`/api/disputes/${id}`),
    },

    invoices: {
      list: () => request<any[]>("/api/invoices"),
      get: (id: string) => request<any>(`/api/invoices/${id}`),
      create: (body: { description: string; amount: number; currency: string; expiresAt?: string; items?: any[] }) =>
        request<any>("/api/invoices", { method: "POST", body: JSON.stringify(body) }),
    },

    subscriptions: {
      list: () => request<SubscriptionDTO[]>("/api/subscriptions"),
      get: (id: string) => request<SubscriptionDTO>(`/api/subscriptions/${id}`),
      create: (planId: string) =>
        request<SubscriptionDTO>("/api/subscriptions", { method: "POST", body: JSON.stringify({ planId }) }),
      cancel: (id: string) =>
        request<SubscriptionDTO>(`/api/subscriptions/${id}/cancel`, { method: "POST" }),
      previewPlanChange: (id: string, newPlanId: string) =>
        request<PlanChangePreviewDTO>(`/api/subscriptions/${id}/plan-change-preview?newPlanId=${newPlanId}`),
      changePlan: (id: string, newPlanId: string) =>
        request<SubscriptionDTO>(`/api/subscriptions/${id}/change-plan`, { method: "POST", body: JSON.stringify({ newPlanId }) }),
    },
  }
}
