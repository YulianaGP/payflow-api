import { MockPaymentService, StripePaymentService, MercadoPagoPaymentService } from "@payflow/payment-providers"
import type { PaymentService } from "@payflow/payment-providers"

export function resolveProvider(name: "mercadopago" | "stripe" | "mock"): PaymentService {
  const override = process.env["PAYMENT_PROVIDER"]
  if (override === "mock" || name === "mock") return new MockPaymentService()
  if (name === "stripe") return new StripePaymentService()
  if (name === "mercadopago") return new MercadoPagoPaymentService()
  throw new Error(`Provider '${name}' not yet implemented`)
}
