import type {
  PaymentDTO,
  CreatePaymentResult,
  AccountDTO,
  AccountListResult,
  TransactionDTO,
  TransactionListResult,
  AuthResult,
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
    },

    payments: {
      get: (id: string, init?: Pick<RequestInit, "signal">) =>
        request<PaymentDTO>(`/api/payments/${id}`, init),
      list: (params?: { status?: string; limit?: number }) => {
        const qs = new URLSearchParams(params as Record<string, string>).toString()
        return request<PaymentDTO[]>(`/api/payments${qs ? `?${qs}` : ""}`)
      },
      create: (body: Record<string, unknown>) =>
        request<CreatePaymentResult>("/api/payments", { method: "POST", body: JSON.stringify(body) }),
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
  }
}
