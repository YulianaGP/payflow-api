export class AppError extends Error {
  readonly code: string
  readonly statusCode: number
  readonly safeMessage: string

  constructor(code: string, statusCode: number, message: string, safeMessage?: string) {
    super(message)
    this.name = this.constructor.name
    this.code = code
    this.statusCode = statusCode
    this.safeMessage = safeMessage ?? message
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor)
    }
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super("NOT_FOUND", 404, `${resource} not found`)
  }
}

export class ConflictError extends AppError {
  constructor(code: string, message: string) {
    super(code, 409, message)
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super("VALIDATION_ERROR", 400, message)
  }
}

export class AuthError extends AppError {
  constructor(message = "Unauthorized") {
    super("UNAUTHORIZED", 401, message)
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super("FORBIDDEN", 403, message)
  }
}

export class FraudError extends AppError {
  constructor(reason: string) {
    super("FRAUD_BLOCKED", 403, `Fraud check failed: ${reason}`, "Request blocked")
  }
}

export class ProviderError extends AppError {
  constructor(provider: string, message: string) {
    super("PROVIDER_ERROR", 502, `${provider}: ${message}`, "Payment provider error. Please try again.")
  }
}

export class RateLimitError extends AppError {
  constructor() {
    super("RATE_LIMITED", 429, "Too many requests", "Too many requests. Please try again later.")
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = "Service unavailable") {
    super("SERVICE_UNAVAILABLE", 503, message)
  }
}

export function toHttpError(err: unknown): { code: string; message: string; statusCode: number } {
  if (err instanceof AppError) {
    return { code: err.code, message: err.safeMessage, statusCode: err.statusCode }
  }
  return { code: "INTERNAL_ERROR", message: "An unexpected error occurred", statusCode: 500 }
}
