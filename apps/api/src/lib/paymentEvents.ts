import { EventEmitter } from "node:events"

export interface PaymentStreamEvent {
  type: "payment_updated"
  paymentId: string
  merchantId: string
  orderId: string
  status: string
  amount: number
  currency: string
  provider: string
  updatedAt: string
}

class PaymentEventBus extends EventEmitter {}

export const paymentEventBus = new PaymentEventBus()
// 2× the SSE connection limit — one listener slot per connected client
paymentEventBus.setMaxListeners(200)
