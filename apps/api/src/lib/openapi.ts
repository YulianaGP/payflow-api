// OpenAPI 3.0 specification for PayFlow API
// Served at GET /openapi.json — consumed by Swagger UI at /docs

export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "PayFlow API",
    version: "1.0.0",
    description:
      "Full-stack payment template API. Accepts payments via MercadoPago and Stripe. " +
      "Card data is never processed by PayFlow — it is handled directly by the payment providers (PCI SAQ-A compliant).",
    contact: { email: "support@payflow.dev" },
  },
  servers: [{ url: "/", description: "Current server" }],

  // ─── Security schemes ────────────────────────────────────────────────────────
  components: {
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        description: "JWT token (from login) or API key (pk_live_... / pk_test_...)",
      },
    },
    schemas: {
      Error: {
        type: "object",
        required: ["error"],
        properties: {
          error: { type: "string" },
          code:  { type: "string", description: "Machine-readable error code" },
        },
      },
      Account: {
        type: "object",
        properties: {
          id:        { type: "string" },
          merchantId:{ type: "string" },
          name:      { type: "string" },
          currency:  { type: "string", enum: ["USD", "ARS", "EUR", "MXN", "CLP", "COP"] },
          balance:   { type: "integer", description: "Balance in cents. Never negative." },
          status:    { type: "string", enum: ["ACTIVE", "FROZEN", "CLOSED"] },
          metadata:  { type: "object", nullable: true },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      LedgerEntry: {
        type: "object",
        properties: {
          id:            { type: "string" },
          transactionId: { type: "string" },
          accountId:     { type: "string" },
          type:          { type: "string", enum: ["debit", "credit"] },
          amount:        { type: "integer", description: "Positive = credit, negative = debit. In cents." },
          currency:      { type: "string" },
          balanceAfter:  { type: "integer", description: "Account balance snapshot after this entry." },
          createdAt:     { type: "string", format: "date-time" },
        },
      },
      Transaction: {
        type: "object",
        properties: {
          id:              { type: "string" },
          merchantId:      { type: "string" },
          debitAccountId:  { type: "string", nullable: true },
          creditAccountId: { type: "string", nullable: true },
          type:            { type: "string", enum: ["TRANSFER", "DEPOSIT", "WITHDRAWAL", "REFUND"] },
          status:          { type: "string", enum: ["COMPLETED", "FAILED", "REVERSED"] },
          amount:          { type: "integer", description: "Amount in cents. Always positive." },
          currency:        { type: "string" },
          description:     { type: "string", nullable: true },
          idempotencyKey:  { type: "string", nullable: true },
          createdBy:       { type: "string", description: "'user:userId' | 'system' | 'reconciliation'" },
          reversalOfId:    { type: "string", nullable: true },
          createdAt:       { type: "string", format: "date-time" },
          ledgerEntries:   { type: "array", items: { $ref: "#/components/schemas/LedgerEntry" } },
        },
      },
      Payment: {
        type: "object",
        properties: {
          id:        { type: "string" },
          orderId:   { type: "string" },
          status:    { type: "string", enum: ["PENDING", "PROCESSING", "SUCCESS", "FAILED", "REFUNDED", "DISPUTED"] },
          amount:    { type: "integer", description: "Amount in cents." },
          currency:  { type: "string" },
          provider:  { type: "string", enum: ["mercadopago", "stripe", "mock"] },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      CursorPage: {
        type: "object",
        properties: {
          data:       { type: "array", items: {} },
          nextCursor: { type: "string", nullable: true, description: "Pass as ?cursor= in the next request. Null when no more pages." },
        },
      },
    },
  },

  security: [{ BearerAuth: [] }],

  // ─── Tags ────────────────────────────────────────────────────────────────────
  tags: [
    { name: "Auth",         description: "Authentication — JWT and session management" },
    { name: "API Keys",     description: "API key management for developer access" },
    { name: "2FA",          description: "Two-factor authentication (TOTP) for admin accounts" },
    { name: "Payments",     description: "Payment lifecycle — create, query, receive webhooks" },
    { name: "Webhooks",     description: "Incoming webhooks from MercadoPago and Stripe" },
    { name: "Accounts",     description: "Internal ledger accounts — balances in cents" },
    { name: "Transactions", description: "Ledger transactions — transfers, deposits, withdrawals, refunds" },
  ],

  paths: {
    // ─── Health ──────────────────────────────────────────────────────────────
    "/health": {
      get: {
        summary: "Health check",
        tags: ["Auth"],
        security: [],
        responses: {
          "200": { description: "Service is up", content: { "application/json": { schema: { type: "object", properties: { status: { type: "string" }, timestamp: { type: "string" } } } } } },
        },
      },
    },

    // ─── Auth ────────────────────────────────────────────────────────────────
    "/api/auth/register": {
      post: {
        summary: "Register a new user",
        tags: ["Auth"],
        security: [],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["email", "password", "name"], properties: {
            email:    { type: "string", format: "email" },
            password: { type: "string", minLength: 8 },
            name:     { type: "string" },
          } } } },
        },
        responses: {
          "201": { description: "User registered. Returns JWT token." },
          "409": { description: "Email already in use", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/auth/login": {
      post: {
        summary: "Login and receive JWT",
        tags: ["Auth"],
        security: [],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["email", "password"], properties: {
            email:    { type: "string", format: "email" },
            password: { type: "string" },
          } } } },
        },
        responses: {
          "200": { description: "Returns JWT token and user info" },
          "401": { description: "Invalid credentials", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/auth/logout": {
      post: {
        summary: "Logout — revoke current session",
        tags: ["Auth"],
        responses: {
          "200": { description: "Session revoked" },
          "401": { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/auth/revoke-all-sessions": {
      post: {
        summary: "Revoke all active sessions for the current user",
        description: "Use after a security incident to immediately invalidate all JWTs.",
        tags: ["Auth"],
        responses: {
          "200": { description: "All sessions revoked" },
        },
      },
    },

    // ─── API Keys ────────────────────────────────────────────────────────────
    "/api/keys": {
      post: {
        summary: "Create an API key",
        description: "The full key is returned ONCE — store it securely. Only the hash is kept in the database.",
        tags: ["API Keys"],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["name"], properties: {
            name:   { type: "string" },
            prefix: { type: "string", enum: ["pk_live_", "pk_test_"], default: "pk_test_" },
          } } } },
        },
        responses: {
          "201": { description: "API key created. Key shown once.", content: { "application/json": { schema: { type: "object", properties: { key: { type: "string", example: "pk_test_abc123xyz" }, id: { type: "string" } } } } } },
        },
      },
      get: {
        summary: "List API keys",
        tags: ["API Keys"],
        responses: {
          "200": { description: "List of API keys (without the actual key value)" },
        },
      },
    },
    "/api/keys/{id}": {
      delete: {
        summary: "Revoke an API key",
        tags: ["API Keys"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Key revoked" },
          "404": { description: "Key not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },

    // ─── 2FA ─────────────────────────────────────────────────────────────────
    "/api/2fa/setup": {
      post: {
        summary: "Initiate 2FA setup — returns QR code URI",
        tags: ["2FA"],
        responses: {
          "200": { description: "TOTP secret and QR URI", content: { "application/json": { schema: { type: "object", properties: { qrUri: { type: "string" }, secret: { type: "string" } } } } } },
        },
      },
    },
    "/api/2fa/verify": {
      post: {
        summary: "Verify TOTP code and activate 2FA",
        tags: ["2FA"],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["code"], properties: { code: { type: "string", minLength: 6, maxLength: 6 } } } } },
        },
        responses: {
          "200": { description: "2FA activated" },
          "401": { description: "Invalid TOTP code", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/2fa": {
      delete: {
        summary: "Disable 2FA",
        tags: ["2FA"],
        responses: {
          "200": { description: "2FA disabled" },
        },
      },
    },

    // ─── Payments ────────────────────────────────────────────────────────────
    "/api/payments": {
      post: {
        summary: "Create a payment and get the checkout URL",
        description: "Returns a redirect URL to the provider's hosted checkout page. Card data never touches PayFlow servers.",
        tags: ["Payments"],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["orderId", "amount", "currency", "description", "customerEmail", "successUrl", "failureUrl"], properties: {
            orderId:        { type: "string", description: "Your internal order ID. Unique per merchant — prevents double-charging." },
            amount:         { type: "integer", minimum: 50, description: "Amount in cents. Minimum 50 (= $0.50)." },
            currency:       { type: "string", enum: ["USD", "ARS", "EUR", "MXN", "CLP", "COP"] },
            description:    { type: "string" },
            customerEmail:  { type: "string", format: "email" },
            successUrl:     { type: "string", format: "uri" },
            failureUrl:     { type: "string", format: "uri" },
            idempotencyKey: { type: "string" },
            items:          { type: "array", items: { type: "object", properties: { name: { type: "string" }, quantity: { type: "integer" }, price: { type: "integer" } } } },
          } } } },
        },
        responses: {
          "201": { description: "Payment created", content: { "application/json": { schema: { type: "object", properties: { id: { type: "string" }, redirectUrl: { type: "string" }, status: { type: "string" } } } } } },
          "409": { description: "Order already paid", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "422": { description: "Invalid amount or currency", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
      get: {
        summary: "List payments",
        tags: ["Payments"],
        parameters: [
          { name: "status", in: "query", schema: { type: "string", enum: ["PENDING", "PROCESSING", "SUCCESS", "FAILED", "REFUNDED", "DISPUTED"] } },
          { name: "limit",  in: "query", schema: { type: "integer", default: 20, maximum: 100 } },
        ],
        responses: {
          "200": { description: "Array of payments", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Payment" } } } } },
        },
      },
    },
    "/api/payments/{id}": {
      get: {
        summary: "Get payment status",
        tags: ["Payments"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Payment", content: { "application/json": { schema: { $ref: "#/components/schemas/Payment" } } } },
          "404": { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },

    // ─── Webhooks ────────────────────────────────────────────────────────────
    "/api/webhooks/mercadopago": {
      post: {
        summary: "Receive MercadoPago webhook",
        description:
          "Verifies HMAC-SHA256 signature from `x-signature` header. " +
          "Rejects webhooks older than 5 minutes (replay attack prevention). " +
          "Always returns 200 — 4xx would cause MercadoPago to retry indefinitely.",
        tags: ["Webhooks"],
        security: [],
        requestBody: {
          content: { "application/json": { schema: { type: "object", properties: {
            action: { type: "string", example: "payment.updated" },
            data:   { type: "object", properties: { id: { type: "string" } } },
          } } } },
        },
        responses: {
          "200": { description: "Processed or already processed (idempotent)" },
        },
      },
    },
    "/api/webhooks/stripe": {
      post: {
        summary: "Receive Stripe webhook",
        description:
          "Verifies signature using `stripe.webhooks.constructEvent`. " +
          "Includes 5-minute replay tolerance. Always returns 200.",
        tags: ["Webhooks"],
        security: [],
        requestBody: {
          content: { "application/json": { schema: { type: "object", properties: {
            type: { type: "string", example: "payment_intent.succeeded" },
            data: { type: "object" },
          } } } },
        },
        responses: {
          "200": { description: "Processed or already processed (idempotent)" },
        },
      },
    },

    // ─── Accounts ────────────────────────────────────────────────────────────
    "/api/accounts": {
      post: {
        summary: "Create an internal account",
        tags: ["Accounts"],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["name", "currency"], properties: {
            name:     { type: "string", maxLength: 100 },
            currency: { type: "string", enum: ["USD", "ARS", "EUR", "MXN", "CLP", "COP"] },
            metadata: { type: "object" },
          } } } },
        },
        responses: {
          "201": { description: "Account created", content: { "application/json": { schema: { $ref: "#/components/schemas/Account" } } } },
        },
      },
      get: {
        summary: "List accounts",
        description: "Cursor-based pagination — use nextCursor as ?cursor= in the next request.",
        tags: ["Accounts"],
        parameters: [
          { name: "cursor", in: "query", schema: { type: "string" } },
          { name: "limit",  in: "query", schema: { type: "integer", default: 20, maximum: 100 } },
          { name: "status", in: "query", schema: { type: "string", enum: ["ACTIVE", "FROZEN", "CLOSED"] } },
        ],
        responses: {
          "200": { description: "Paginated accounts", content: { "application/json": { schema: { allOf: [{ $ref: "#/components/schemas/CursorPage" }, { properties: { data: { type: "array", items: { $ref: "#/components/schemas/Account" } } } }] } } } },
        },
      },
    },
    "/api/accounts/{id}": {
      get: {
        summary: "Get account with recent ledger entries",
        tags: ["Accounts"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Account and last 10 ledger entries", content: { "application/json": { schema: { $ref: "#/components/schemas/Account" } } } },
          "404": { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/accounts/{id}/fund": {
      post: {
        summary: "Fund an account (external deposit)",
        description: "Creates a DEPOSIT transaction in the account's currency. Returns X-Idempotent-Replayed: true if deduplicated.",
        tags: ["Accounts"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["amount"], properties: {
            amount:      { type: "integer", minimum: 1, description: "Amount in cents." },
            description: { type: "string", maxLength: 255 },
          } } } },
        },
        responses: {
          "201": { description: "Deposit created", content: { "application/json": { schema: { $ref: "#/components/schemas/Transaction" } } } },
          "403": { description: "Account is frozen or closed", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" }, example: { error: "Account is frozen and cannot process transactions", code: "ACCOUNT_FROZEN" } } } },
          "404": { description: "Account not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/accounts/{id}/freeze": {
      post: {
        summary: "Freeze an account",
        description: "Frozen accounts cannot send or receive transactions. Transition: ACTIVE → FROZEN.",
        tags: ["Accounts"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Account frozen", content: { "application/json": { schema: { $ref: "#/components/schemas/Account" } } } },
          "409": { description: "Invalid state transition", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" }, example: { error: "Cannot freeze an account with status FROZEN", code: "INVALID_STATE_TRANSITION" } } } },
        },
      },
    },
    "/api/accounts/{id}/unfreeze": {
      post: {
        summary: "Unfreeze an account",
        description: "Transition: FROZEN → ACTIVE.",
        tags: ["Accounts"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Account active", content: { "application/json": { schema: { $ref: "#/components/schemas/Account" } } } },
          "409": { description: "Invalid state transition", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/accounts/{id}/close": {
      post: {
        summary: "Close an account (permanent)",
        description: "Permanently closes an account. Requires zero balance — cannot be undone. Transition: ACTIVE|FROZEN → CLOSED.",
        tags: ["Accounts"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Account closed", content: { "application/json": { schema: { $ref: "#/components/schemas/Account" } } } },
          "409": { description: "Invalid state transition", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "422": { description: "Balance is not zero", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" }, example: { error: "Account must have zero balance before closing", code: "NON_ZERO_BALANCE" } } } },
        },
      },
    },

    // ─── Transactions ────────────────────────────────────────────────────────
    "/api/transactions": {
      post: {
        summary: "Create a transaction",
        description:
          "Creates a TRANSFER, DEPOSIT, or WITHDRAWAL. All operations are atomic and use SELECT FOR UPDATE.\n\n" +
          "**Idempotency:** If `idempotencyKey` is omitted, the system generates a deterministic key " +
          "scoped to a 60-second window — protecting against double-clicks and network retries. " +
          "For high-frequency identical operations between the same accounts, provide your own unique key. " +
          "Duplicate requests return the original transaction with `X-Idempotent-Replayed: true`.\n\n" +
          "**Currency:** debit and credit accounts must share the same currency.",
        tags: ["Transactions"],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { oneOf: [
            {
              title: "TRANSFER",
              type: "object",
              required: ["type", "debitAccountId", "creditAccountId", "amount", "currency"],
              properties: {
                type:            { type: "string", enum: ["TRANSFER"] },
                debitAccountId:  { type: "string" },
                creditAccountId: { type: "string" },
                amount:          { type: "integer", minimum: 1 },
                currency:        { type: "string", enum: ["USD", "ARS", "EUR", "MXN", "CLP", "COP"] },
                description:     { type: "string" },
                idempotencyKey:  { type: "string", description: "Optional. If omitted, auto-generated with 60s window." },
              },
            },
            {
              title: "DEPOSIT",
              type: "object",
              required: ["type", "creditAccountId", "amount", "currency"],
              properties: {
                type:            { type: "string", enum: ["DEPOSIT"] },
                creditAccountId: { type: "string" },
                amount:          { type: "integer", minimum: 1 },
                currency:        { type: "string", enum: ["USD", "ARS", "EUR", "MXN", "CLP", "COP"] },
                description:     { type: "string" },
                idempotencyKey:  { type: "string" },
              },
            },
            {
              title: "WITHDRAWAL",
              type: "object",
              required: ["type", "debitAccountId", "amount", "currency"],
              properties: {
                type:           { type: "string", enum: ["WITHDRAWAL"] },
                debitAccountId: { type: "string" },
                amount:         { type: "integer", minimum: 1 },
                currency:       { type: "string", enum: ["USD", "ARS", "EUR", "MXN", "CLP", "COP"] },
                description:    { type: "string" },
                idempotencyKey: { type: "string" },
              },
            },
          ] } } },
        },
        responses: {
          "201": { description: "Transaction created", content: { "application/json": { schema: { $ref: "#/components/schemas/Transaction" } } } },
          "200": { description: "Duplicate request — returns original transaction", headers: { "X-Idempotent-Replayed": { schema: { type: "string", enum: ["true"] } } }, content: { "application/json": { schema: { $ref: "#/components/schemas/Transaction" } } } },
          "403": { description: "Account frozen or closed", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" }, example: { error: "Account is frozen and cannot process transactions", code: "ACCOUNT_FROZEN" } } } },
          "422": { description: "Insufficient balance or currency mismatch", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" }, examples: {
            insufficient: { value: { error: "Insufficient balance in account X: has 500, needs 1000", code: "INSUFFICIENT_BALANCE" } },
            mismatch:     { value: { error: "Currency mismatch: debit account is USD, credit account is ARS", code: "CURRENCY_MISMATCH" } },
          } } } },
        },
      },
      get: {
        summary: "List transactions",
        tags: ["Transactions"],
        parameters: [
          { name: "cursor",    in: "query", schema: { type: "string" } },
          { name: "limit",     in: "query", schema: { type: "integer", default: 20, maximum: 100 } },
          { name: "accountId", in: "query", schema: { type: "string" }, description: "Filter by debit or credit account" },
          { name: "type",      in: "query", schema: { type: "string", enum: ["TRANSFER", "DEPOSIT", "WITHDRAWAL", "REFUND"] } },
          { name: "status",    in: "query", schema: { type: "string", enum: ["COMPLETED", "FAILED", "REVERSED"] } },
        ],
        responses: {
          "200": { description: "Paginated transactions with ledger entries", content: { "application/json": { schema: { allOf: [{ $ref: "#/components/schemas/CursorPage" }, { properties: { data: { type: "array", items: { $ref: "#/components/schemas/Transaction" } } } }] } } } },
        },
      },
    },
    "/api/transactions/{id}": {
      get: {
        summary: "Get transaction with ledger entries",
        tags: ["Transactions"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Transaction", content: { "application/json": { schema: { $ref: "#/components/schemas/Transaction" } } } },
          "404": { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/api/transactions/{id}/reverse": {
      post: {
        summary: "Reverse a completed transaction",
        description:
          "Creates a REFUND transaction that inverts all ledger entries of the original. " +
          "Only COMPLETED transactions can be reversed. One reversal per transaction (prevents double-reversal). " +
          "If the source account lacks sufficient balance, the reversal fails — negative balances are never allowed.",
        tags: ["Transactions"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "201": { description: "Reversal transaction created", content: { "application/json": { schema: { $ref: "#/components/schemas/Transaction" } } } },
          "409": { description: "Transaction already reversed or not in COMPLETED state", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" }, examples: {
            alreadyReversed: { value: { error: "Transaction X has already been reversed", code: "ALREADY_REVERSED" } },
            notCompleted:    { value: { error: "Only COMPLETED transactions can be reversed (current: REVERSED)", code: "INVALID_STATE_TRANSITION" } },
          } } } },
          "422": { description: "Insufficient balance in source account", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" }, example: { error: "Insufficient balance in account X to process reversal", code: "REVERSAL_INSUFFICIENT_FUNDS" } } } },
        },
      },
    },
  },
}
