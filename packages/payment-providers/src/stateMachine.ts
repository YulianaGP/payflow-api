import type { PaymentStatus } from "./types.js"

// Valid transitions — only these are allowed
// Any other combination is rejected before touching the DB
const VALID_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  PENDING:    ["PROCESSING", "SUCCESS", "FAILED"],
  PROCESSING: ["SUCCESS", "FAILED"],
  SUCCESS:    ["REFUNDED", "DISPUTED"],
  FAILED:     [], // terminal — a new payment must be created for a retry
  REFUNDED:   [], // terminal
  DISPUTED:   ["SUCCESS", "FAILED"], // resolved by provider
}

export function isValidTransition(from: PaymentStatus, to: PaymentStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}

// Used by reconciliation — only these states can be corrected automatically
// Never overwrite SUCCESS, REFUNDED, or DISPUTED with external data
export function isReconciliableStatus(status: PaymentStatus): boolean {
  return status === "PENDING" || status === "PROCESSING"
}
