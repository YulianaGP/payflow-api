# ROADMAP — PayFlow
**Full-Stack Payment Template | TypeScript + Next.js 14 + Hono + Prisma + PostgreSQL + Turborepo**

> Roadmap día a día hasta el deploy. Al inicio de cada sesión: leer en qué día quedamos, ejecutar la tarea, marcar como completado.
> **Todo el código, README, comentarios, Swagger y docs estarán 100% en inglés.**

---

## POR QUÉ EXISTE ESTE TEMPLATE (leer antes de cada sesión)

El comprador piensa: *"no quiero aprender pagos, quiero vender ya"*.

Lo que se vende NO es código. Se venden tres cosas:
1. **Tiempo ahorrado** — semanas de trabajo resueltas en 30 minutos de setup
2. **Confianza** — pagos que no se pierden, no se duplican, no corrompen datos
3. **Menos riesgo** — edge cases ya manejados, fraude cubierto, listo para producción

Si el template funciona pero da miedo tocarlo, no se vende.
Si funciona y da confianza, vale $149–199.

---

## QUÉ ES PAYFLOW

Template full-stack en **TypeScript** para aceptar pagos reales desde el día 1.

**El template NO procesa tarjetas.** Delega completamente en MercadoPago y Stripe, que son los que tienen certificación financiera. El template se ocupa de todo lo que rodea al pago: estados, notificaciones, suscripciones, fraude, dashboard, historial. Los datos de tarjeta nunca tocan el servidor de PayFlow.

- **Lenguaje:** TypeScript en todo — backend, frontend, scripts, tests, seed
- **Backend:** Hono + Prisma + PostgreSQL
- **Frontend:** Next.js 14 App Router + shadcn/ui + dark mode + i18n
- **Pagos reales:** MercadoPago API + Stripe API, intercambiables por `.env` por merchant
- **Suscripciones completas:** planes, upgrades, downgrades, prorrateo, grace periods, reintentos
- **Dashboard admin:** pagos en tiempo real (SSE), filtros, CSV, log de auditoría
- **Multi-tenant:** cada merchant tiene su proveedor, su moneda y sus datos aislados
- **Seguridad:** 2FA admin, antifraude, CORS, headers de seguridad, audit log inmutable
- **Confianza:** emails de confirmación, PDF de comprobante, página de estado, chargebacks
- **Compliance LATAM:** consentimiento de datos, derecho al olvido (Arg, Mex, Col, Chile)

**Para qué sirve:** SaaS, membresías, productos digitales, marketplaces, cualquier negocio que necesite cobrar.

**Precio objetivo:** $149–199 en Gumroad / Lemon Squeezy

---

## FASES DEL PROYECTO

### Fase 1 — Fundación (Días 1–4) ✅ COMPLETADA
| Tarea | Estado |
|---|---|
| Monorepo + TypeScript + ESLint | ✅ |
| Schema de base de datos + migraciones + seed | ✅ |
| Auth: JWT + API keys (login, registro, logout) | ✅ |
| 2FA TOTP para admin + revocación de sesiones | ✅ |

### Fase 2 — Motor de pagos (Días 5–13) ✅ COMPLETADA
| Tarea | Estado |
|---|---|
| PaymentService interface + validaciones de monto | ✅ |
| MockPaymentService (desarrollo sin credenciales reales) | ✅ |
| Outbox pattern + OutboxWorker (SKIP LOCKED, backoff cap) | ✅ |
| SELECT FOR UPDATE (concurrencia) | ✅ |
| Idempotencia de webhooks | ✅ |
| MercadoPago API adapter (pendiente prueba con credenciales) | ✅ |
| Stripe API adapter (probado con sandbox) | ✅ |
| BullMQ + Redis (reintentos con backoff exponencial) | ⏳ Fase 6 |
| Reconciliación automática (PENDING=10min / PROCESSING=20min) | ✅ |

### Fase 3 — API completa (Días 14–15) ✅ COMPLETADA
| Tarea | Estado |
|---|---|
| Modelos Account + Transaction + LedgerEntry (double-entry ledger) | ✅ |
| Account state machine: ACTIVE ↔ FROZEN → CLOSED | ✅ |
| Endpoints accounts: CRUD + fund + freeze + unfreeze + close | ✅ |
| Endpoints transactions: CRUD + reverse | ✅ |
| Idempotencia con ventana de 60s + key explícita | ✅ |
| Locks con orden determinístico (anti-deadlock) | ✅ |
| Swagger / OpenAPI en /docs | ✅ |

---

## PENDIENTES Y DEUDA TÉCNICA

> Gaps reales encontrados al leer el código. No bloquean el avance, pero deben resolverse antes de v1.0.0.

### Pendientes de Fase 2

| # | Archivo | Descripción | Prioridad | Resuelto en |
|---|---|---|---|---|
| P2-1 | `src/routes/webhooks.ts` | Rutas `/mercadopago` y `/stripe` son stubs que devuelven un mensaje de texto. Los adapters existen pero no están conectados al `processPaymentUpdate`. | 🔴 Alta | Fase 4 (Day 20) o Fase 6 |
| P2-2 | `src/workers/outboxWorker.ts` | `dispatch()` es un no-op: logea los eventos pero no entrega nada. Los TODOs del código apuntan a Day 12 (BullMQ) y Day 20 (Resend). | 🔴 Alta | Day 12 → Fase 6 / Day 20 → Fase 4 |
| P2-3 | `src/jobs/reconcile.ts` | La alerta de "pago sin resolver por más de 20 min" solo escribe a stdout. No envía email ni dispara SSE. | 🟡 Media | Fase 6 (Day 25 Dashboard) |
| P2-4 | `packages/payment-providers` | MercadoPago adapter no testeado con credenciales reales (solo Stripe con sandbox). | 🟡 Media | Fase 7 (deploy) |

### Pendientes de Fase 3

| # | Archivo | Descripción | Prioridad | Resuelto en |
|---|---|---|---|---|
| P3-1 | `src/services/accountService.ts:110` | `transitionAccount` hace `findFirst` + `update` sin `SELECT FOR UPDATE`. Dos freeze concurrentes podrían aplicarse dos veces. Riesgo bajo (el resultado final es idempotente), pero es una inconsistencia con el contrato de la Regla de Negocio #2. | 🟡 Media | Fase 7 (tests de integración) |
| P3-2 | `src/services/transactionService.ts:359` | `reverseTransaction` no captura `P2002`. Si dos reversos concurrentes pasan el guard `original.reversedBy`, el segundo falla con error no controlado en vez de devolver la transacción ganadora. | 🔴 Alta | Antes de Fase 5 |
| P3-3 | `src/routes/transactions.ts:76` | Los handlers de error usan `err.message?.includes(...)` — string matching frágil. Si el mensaje cambia, el handler deja de funcionar silenciosamente. Debería usar errores tipados. | 🟡 Media | Fase 7 (refactor) |
| P3-4 | `src/lib/openapi.ts` | El spec OpenAPI cubre Fase 3 (accounts, transactions) pero no Fase 1/2: no documenta `/api/auth`, `/api/keys`, `/api/2fa`, `/api/payments`, `/api/webhooks`. | 🟡 Media | Fase 6 (Day 28 logging) |

---

### Fase 4 — Frontend (Días 16–20) ⏳
| Tarea | Estado |
|---|---|
| Shell Next.js + shadcn/ui + dark mode | ⏳ |
| Login, registro y consentimiento de datos | ⏳ |
| i18n español/inglés + multi-moneda | ⏳ |
| Checkout flow completo (éxito, fallo, pendiente) | ⏳ |
| Emails transaccionales + PDF de comprobante | ⏳ |

### Fase 5 — Suscripciones (Días 21–23) ⏳
| Tarea | Estado |
|---|---|
| Planes + trials + cancelación | ⏳ |
| Upgrades, downgrades y prorrateo | ⏳ |
| Dunning + webhooks + edge cases | ⏳ |

### Fase 6 — Dashboard y features avanzados (Días 24–32) ⏳
| Tarea | Estado |
|---|---|
| Dashboard admin + SSE real-time | ⏳ |
| Filtros, exportación CSV y audit log | ⏳ |
| Chargebacks y disputas | ⏳ |
| Antifraude avanzado (PaymentAttempt) | ⏳ |
| Logging estructurado + CORS + headers de seguridad | ⏳ |
| Compliance LATAM (consentimiento + derecho al olvido) | ⏳ |
| Pagos en efectivo (OXXO + Rapipago/Pago Fácil) | ⏳ |
| Invoice por link + múltiples items | ⏳ |
| Página de estado pública (/status) | ⏳ |

### Fase 7 — Producción y lanzamiento (Días 33–39) ⏳
| Tarea | Estado |
|---|---|
| Frontend: gestión de suscripciones | ⏳ |
| Tests de integración (cobertura >70%) | ⏳ |
| Docker + docker-compose | ⏳ |
| GitHub Actions CI | ⏳ |
| Deploy en Railway | ⏳ |
| CLI de setup (npx payflow init) | ⏳ |
| README profesional + SETUP.md + tag v1.0.0 | ⏳ |

---

## SESIÓN ACTUAL

**Fecha:** 2026-04-30
**Día:** Días 16–20
**Tarea activa:** Fase 4 — Frontend (shell + auth + checkout + emails)
**Bloqueantes:** —

---

## ARQUITECTURA COMPLETA

```
HTTP Request (web o API)
        │
        ▼
   Hono Router (TypeScript)
        │
        ├─ Rate Limit Middleware      → por IP y por merchant (Redis store, no in-memory)
        ├─ Auth Middleware            → JWT (web) o API key hash SHA-256 (API)
        ├─ 2FA Check (solo admin)     → TOTP verificado antes de operaciones sensibles
        ├─ CORS Middleware            → lista blanca explícita de orígenes
        ├─ Fraud Check               → consulta PaymentAttempt antes de procesar
        ├─ Amount Validation         → monto > 0, dentro de límites, moneda válida
        ├─ Idempotency Middleware     → UNIQUE(provider, externalId, eventType)
        ▼
   Controller (TypeScript)           → req/res, sin lógica de negocio
        │
        ▼
   Service (TypeScript)              → lógica, state machine, balance
        │
        ├─ PaymentRouter             → elige proveedor por merchant.paymentProvider
        │       │
        │       ├─ MercadoPagoService  implements PaymentService
        │       │     └─ api.mercadopago.com (SDK oficial, nunca toca tarjetas)
        │       ├─ StripeService       implements PaymentService
        │       │     └─ api.stripe.com (SDK oficial, nunca toca tarjetas)
        │       └─ MockPaymentService  implements PaymentService (dev/test)
        │
        ▼
   Prisma $transaction (SELECT FOR UPDATE)   → atomicidad, sin race conditions
        │
        ├─ Payment (actualiza estado)
        ├─ PaymentAuditLog (registro inmutable, nunca se edita)
        └─ OutboxEvent (persiste evento ANTES de enviarlo)
                │
                ▼
        BullMQ Worker                → lee outbox, envía webhooks, reintenta
                │
                ├─ Redis Pub/Sub     → notifica dashboard vía SSE
                └─ Resend (email)    → confirmación de pago al usuario
```

**Regla de oro de atomicidad:** actualizar `Payment.status` + crear `OutboxEvent` en la MISMA `$transaction`. Si uno falla, los dos hacen rollback. El dinero nunca cambia de estado sin dejar rastro.

---

## MODELOS DE BASE DE DATOS (referencia permanente)

```prisma
// NÚCLEO
model Payment {
  id             String        @id @default(cuid())
  merchantId     String
  orderId        String        // ID del pedido interno
  status         PaymentStatus // PENDING | PROCESSING | SUCCESS | FAILED | REFUNDED | DISPUTED
  amount         Int           // SIEMPRE en centavos. $10.50 = 1050. Nunca floats.
  currency       String        // 'ARS' | 'USD' | 'EUR' | 'MXN' | 'CLP' | 'COP'
  provider       String        // 'mercadopago' | 'stripe' | 'mock'
  externalId     String?       // ID del proveedor (llega por webhook)
  confirmedAmount   Int?       // monto confirmado por el proveedor (debe coincidir con amount)
  confirmedCurrency String?    // moneda confirmada por el proveedor (debe coincidir con currency)
  idempotencyKey String?       @unique
  metadata       Json?
  items          Json?         // lista de items para órdenes con múltiples productos
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt

  @@unique([merchantId, orderId])  // un solo pago por pedido — evita doble cobro
}

// OUTBOX PATTERN — garantía de entrega de eventos internos
model OutboxEvent {
  id          String    @id @default(cuid())
  type        String    // 'payment.success' | 'subscription.renewed' | etc.
  payload     Json
  attempts    Int       @default(0)
  lastError   String?
  nextRetryAt DateTime? @default(now())
  sentAt      DateTime?
  createdAt   DateTime  @default(now())
}

// IDEMPOTENCIA DE WEBHOOKS — evita procesar el mismo evento dos veces
model PaymentEvent {
  id          String   @id @default(cuid())
  provider    String
  externalId  String
  eventType   String
  processedAt DateTime @default(now())
  @@unique([provider, externalId, eventType])
}

// AUDITORÍA INMUTABLE — nunca se edita, solo se agrega
model PaymentAuditLog {
  id         String   @id @default(cuid())
  paymentId  String
  fromStatus String
  toStatus   String
  changedBy  String   // 'webhook' | 'reconciliation' | 'admin:userId' | 'system'
  metadata   Json     // IP, userAgent, razón, adminId si aplica
  createdAt  DateTime @default(now())
  // SIN updatedAt — este modelo NUNCA se modifica
}

// FRAUDE — sin esta tabla las reglas no tienen datos históricos
model PaymentAttempt {
  id           String   @id @default(cuid())
  merchantId   String
  emailHash    String   // sha256(email.toLowerCase()) — nunca el email en claro
  ip           String
  userAgent    String?
  status       String   // 'success' | 'failed' | 'blocked'
  amount       Int
  currency     String
  provider     String
  blockReason  String?  // 'too_many_failures' | 'suspicious_amount' | 'too_many_cards'
  createdAt    DateTime @default(now())
  @@index([emailHash, createdAt])
  @@index([ip, createdAt])
}

// SUSCRIPCIONES
model Subscription {
  id                 String             @id @default(cuid())
  merchantId         String
  userId             String
  planId             String
  status             SubscriptionStatus // ACTIVE | PAST_DUE | CANCELED | PAUSED | TRIALING
  currentPeriodStart DateTime
  currentPeriodEnd   DateTime
  cancelAtPeriodEnd  Boolean            @default(false)
  trialEndsAt        DateTime?
  gracePeriodEndsAt  DateTime?
  failedPaymentCount Int                @default(0)
  creditBalance      Int                @default(0)
  externalId         String?
  provider           String
}

// CHARGEBACKS / DISPUTAS
model Dispute {
  id          String   @id @default(cuid())
  paymentId   String
  merchantId  String
  externalId  String   // ID de la disputa en MP o Stripe
  status      String   // 'open' | 'won' | 'lost' | 'needs_response'
  reason      String   // 'fraudulent' | 'duplicate' | 'product_not_received' | etc.
  amount      Int
  dueDate     DateTime // fecha límite para responder
  evidence    Json?    // evidencia enviada por el merchant
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

// SESIONES REVOCADAS — para invalidar JWT comprometidos
model RevokedSession {
  jti       String   @id  // JWT ID (claim "jti")
  userId    String
  revokedAt DateTime @default(now())
  expiresAt DateTime // para limpiar registros viejos
  @@index([expiresAt])
}

// CONSENTIMIENTO DE DATOS — compliance LATAM
model UserConsent {
  id          String   @id @default(cuid())
  userId      String   @unique
  acceptedAt  DateTime @default(now())
  ipAddress   String
  userAgent   String
  version     String   @default('1.0') // versión de los términos aceptados
}

// INVOICES POR LINK
model Invoice {
  id          String    @id @default(cuid())
  merchantId  String
  amount      Int
  currency    String
  description String
  items       Json?
  status      String    // 'pending' | 'paid' | 'expired'
  expiresAt   DateTime?
  paymentId   String?   // se llena cuando el invoice es pagado
  createdAt   DateTime  @default(now())
}

// MERCHANTS
model Merchant {
  id               String  @id @default(cuid())
  name             String
  paymentProvider  String  // 'mercadopago' | 'stripe'
  fallbackProvider String?
  currency         String  @default('USD')
  webhookSecret    String
  refundWindowDays Int     @default(180)  // política de reembolso del merchant
}

// ─── LEDGER INTERNO (Fase 3) ───────────────────────────────────────────────

// CUENTAS INTERNAS — wallet por merchant
// balance es un campo CACHEADO, no la fuente de verdad
// fuente de verdad: SUM(LedgerEntry.amount WHERE accountId = X) === balance
enum AccountStatus { ACTIVE, FROZEN, CLOSED }

model Account {
  id         String        @id @default(cuid())
  merchantId String
  name       String
  currency   String        // 'ARS' | 'USD' | 'EUR' | 'MXN' | 'CLP' | 'COP'
  balance    Int           @default(0)  // en centavos, CACHEADO — nunca negativo
  status     AccountStatus @default(ACTIVE)
  metadata   Json?
  createdAt  DateTime      @default(now())
  updatedAt  DateTime      @updatedAt
  @@index([merchantId, status])
}

// TRANSACCIONES — movimientos entre cuentas
// PENDING eliminado: operaciones síncronas y atómicas
enum TransactionStatus { COMPLETED, FAILED, REVERSED }

model Transaction {
  id              String            @id @default(cuid())
  merchantId      String
  debitAccountId  String?           // null para DEPOSIT (fondeo externo)
  creditAccountId String?           // null para WITHDRAWAL
  type            TransactionType   // TRANSFER | DEPOSIT | WITHDRAWAL | REFUND
  status          TransactionStatus @default(COMPLETED)
  amount          Int               // en centavos, siempre positivo
  currency        String
  description     String?
  metadata        Json?
  idempotencyKey  String?           // resuelto siempre internamente (ventana 60s si no se envía)
  createdBy       String            // 'user:userId' | 'system' | 'reconciliation'
  reversalOfId    String?  @unique  // una sola reversión por tx — invariante intencional
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  @@unique([merchantId, idempotencyKey])  // idempotencia POR merchant, no global
  @@index([merchantId, status, createdAt])
  @@index([debitAccountId])
  @@index([creditAccountId])
}

// LEDGER ENTRIES — fuente de verdad del balance
// Cada TRANSFER genera 2 entradas que suman 0 (débito + crédito)
// DEPOSIT/WITHDRAWAL generan 1 entrada (sin contraparte interna — limitación documentada)
// SIN updatedAt — estos registros NUNCA se modifican
model LedgerEntry {
  id            String   @id @default(cuid())
  transactionId String
  accountId     String
  type          String   // 'debit' | 'credit' — explícito para observabilidad en queries
  amount        Int      // positivo = crédito (+), negativo = débito (-)
  currency      String   // denormalizado — entry autosuficiente sin JOIN a Transaction
  balanceAfter  Int      // snapshot del saldo tras esta entrada
  createdAt     DateTime @default(now())
  @@index([accountId, createdAt])
  @@index([transactionId])
}
```

---

## REGLAS DE NEGOCIO CRÍTICAS (leer antes de tocar pagos)

1. **Atomicidad:** actualizar `Payment.status` + crear `OutboxEvent` en la misma `$transaction`. Rollback si cualquiera falla.

2. **Concurrencia:** `SELECT FOR UPDATE` antes de modificar un pago. Sin esto, webhook + reconciliación pueden procesar el mismo pago dos veces.

3. **Idempotencia de webhooks:** verificar `UNIQUE(provider, externalId, eventType)`. Si ya existe → devolver 200 sin procesar. Nunca 4xx (el proveedor reintenta forever con 4xx).

4. **Monto y moneda:** validar que el monto del webhook coincide con el monto del checkout. Si no coincide → estado `REVIEW_NEEDED`, alerta al admin. Nunca marcar SUCCESS con montos distintos.

5. **Replay attack:** verificar que el timestamp del webhook tiene menos de 5 minutos. Un webhook más antiguo es un posible ataque de repetición.

6. **Fallback de proveedor:** solo si el error es de red. Nunca si es de negocio. Verificar que el proveedor principal NO cobró antes de hacer fallback.

7. **Monto negativo o cero:** rechazar en la capa de tipos TypeScript (Zod) Y en el service. Nunca confiar solo en una capa.

8. **orderId único:** `@@unique([merchantId, orderId])` en Payment. Si ya existe un SUCCESS para ese orderId → rechazar con 409. Evita doble cobro por doble click o refresh.

9. **Fraude:** guardar `PaymentAttempt` siempre, incluyendo los bloqueados. Email siempre como `sha256(email)`.

10. **Balances:** siempre en centavos (enteros). `$10.50 = 1050`. Nunca floats.

11. **Admin actions:** toda acción del admin (reembolso, cambio de estado) se registra en `PaymentAuditLog` con `changedBy: 'admin:userId'` y el motivo obligatorio.

12. **Ledger — fuente de verdad:** crear `LedgerEntry` + actualizar `Account.balance` en la MISMA `$transaction`. Si uno falla → rollback completo. El balance cacheado nunca diverge del ledger.

13. **Ledger — invariante de balance:** para TRANSFER y REFUND, la suma de entries debe ser 0. Validar en código antes del commit: `sum(entries.amount) === 0`. Un valor distinto de cero indica un bug en el service.

14. **Ledger — locks anti-deadlock:** bloquear cuentas siempre en orden determinístico con un solo query:
    ```sql
    SELECT * FROM "Account" WHERE id = ANY($ids) ORDER BY id FOR UPDATE
    ```
    Nunca bloquear fila por fila en un loop — riesgo de deadlock si dos requests cruzan el orden.

15. **Ledger — idempotencia de transactions:** `@@unique([merchantId, idempotencyKey])`. Si no se envía key, el sistema genera un hash determinístico con ventana de 60 segundos. Atrapar error `P2002` en INSERT para manejar race conditions concurrentes.

16. **Ledger — moneda entre cuentas:** en TRANSFER, `debitAccount.currency` debe ser igual a `creditAccount.currency`. Nunca convertir implícitamente.

17. **Ledger — reversal:** solo transacciones COMPLETED pueden revertirse. Una sola reversión por transacción (`reversalOfId @unique`). Si la cuenta origen no tiene saldo para revertir → error `REVERSAL_INSUFFICIENT_FUNDS`, no saldo negativo.

---

## DÍA 1 — Monorepo con Turborepo + TypeScript

**Meta:** Estructura del monorepo lista, TypeScript configurado en todos los packages, ambas apps corren.

```
payflow/
├── apps/
│   ├── api/      → Hono + Prisma + TypeScript
│   └── web/      → Next.js 14 App Router + TypeScript
├── packages/
│   └── payment-providers/   → interfaz PaymentService + adapters
├── turbo.json
├── package.json  (workspace root)
└── ROADMAP.md
```

- [ ] `npx create-turbo@latest`
- [ ] Migrar código actual de Hono a `apps/api/`
- [ ] Crear `apps/web/`: `npx create-next-app@latest --typescript`
- [ ] Crear `packages/payment-providers/` con `package.json` y `tsconfig.json` estricto
- [ ] `turbo.json` con pipelines: `dev`, `build`, `test`, `lint`, `type-check`
- [ ] TypeScript strict en todos los `tsconfig.json`: `"strict": true`, `"noUncheckedIndexedAccess": true`
- [ ] **[A5]** Configurar ESLint con regla que prohíbe `$queryRawUnsafe` de Prisma:
  - `no-restricted-syntax` apuntando a llamadas a `$queryRawUnsafe`
  - Razón: las queries raw seguras usan tagged templates (`$queryRaw```) — `$queryRawUnsafe` abre SQL injection
- [ ] `apps/api` en `localhost:3001`, `apps/web` en `localhost:3000`
- [ ] `.env.example` documentado en cada app

---

## DÍA 2 — Schema de base de datos completo

**Meta:** Todos los modelos Prisma definidos, migraciones corriendo, seed con datos realistas.

- [ ] `prisma/schema.prisma` con todos los modelos del bloque "MODELOS DE BASE DE DATOS"
- [ ] Enums: `PaymentStatus` (incluir `DISPUTED`), `SubscriptionStatus`, `TransactionType`
- [ ] Índices en: `emailHash+createdAt`, `ip+createdAt`, `@@unique([provider, externalId, eventType])`, `@@unique([merchantId, orderId])`
- [ ] `npx prisma migrate dev --name init`
- [ ] `prisma/seed.ts` en TypeScript:
  - 2 merchants (uno MP, uno Stripe)
  - 5 usuarios por merchant con `UserConsent` creado
  - 10 pagos en distintos estados incluyendo uno `DISPUTED`
  - 3 suscripciones (ACTIVE, PAST_DUE, CANCELED)
  - Registros en `PaymentAuditLog` para cada pago
  - 1 invoice por link sin pagar
- [ ] Verificar en Prisma Studio
- [ ] `src/lib/db.ts` — singleton de PrismaClient

---

## DÍA 3 — Auth: login/registro + API keys

**Meta:** Dos sistemas de auth: JWT para usuarios del dashboard, API keys para developers.

- [ ] NextAuth en `apps/web/` con providers: email/password + Google OAuth
- [ ] Páginas: `/login`, `/register`, `/forgot-password`
- [ ] **[E2]** Pantalla de consentimiento de datos al registro:
  - Checkbox obligatorio: "Acepto el tratamiento de mis datos personales"
  - Al aceptar → crear registro en `UserConsent` con IP y userAgent
  - Sin aceptar → no se puede completar el registro
- [ ] Middleware Next.js: `/dashboard/**` redirige a `/login` sin sesión
- [ ] `apps/api/`: middleware `src/middlewares/auth.ts` para API keys:
  - `Authorization: Bearer pk_live_abc123xyz`
  - `sha256(key)` → busca en DB → autoriza o rechaza
  - Prefijos: `pk_live_` producción, `pk_test_` testing
- [ ] La key se muestra UNA sola vez al crearla
- [ ] Tests: key válida ✅, key inválida → 401, key revocada → 401

---

## DÍA 4 — Admin security: 2FA + JWT blacklist

**Meta:** El dashboard admin tiene una segunda capa de seguridad. Las sesiones comprometidas se pueden invalidar.

**Por qué es crítico:** el admin puede ver todos los pagos y emitir reembolsos. Con solo contraseña, si alguien roba las credenciales tiene acceso total. Con 2FA, necesita también el teléfono del admin.

**[D1] 2FA con TOTP:**
```typescript
// Flujo de activación:
// 1. Admin va a Configuración → Seguridad → Activar 2FA
// 2. La app genera un secret con otplib.authenticator.generateSecret()
// 3. Muestra QR para escanear con Google Authenticator / Authy
// 4. Admin ingresa el código de 6 dígitos para confirmar
// 5. La app guarda el secret cifrado en DB
// 6. Desde ese momento, cada login requiere contraseña + código TOTP
```

**[D2] JWT Blacklist (invalidación de sesiones):**
```typescript
// Si una cuenta admin es comprometida:
// Admin en pánico → botón "Cerrar todas las sesiones"
// → Insertar todos los JTI activos del usuario en RevokedSession
// → El middleware verifica RevokedSession en cada request
// → Sesiones comprometidas quedan inválidas inmediatamente
// → Limpiar RevokedSession registros con expiresAt < now() (cron semanal)
```

- [ ] Instalar `otplib` y `qrcode`: `npm install otplib qrcode`
- [ ] Modelo `TwoFactorAuth { userId, encryptedSecret, enabledAt }` en Prisma
- [ ] Endpoints: `POST /api/auth/2fa/setup`, `POST /api/auth/2fa/verify`, `DELETE /api/auth/2fa`
- [ ] Página `/dashboard/security` con toggle de 2FA y QR code
- [ ] Middleware que verifica TOTP en rutas sensibles del admin (`/api/admin/**`)
- [ ] **[D2]** `RevokedSession` ya está en el schema — implementar verificación en auth middleware
- [ ] Endpoint `POST /api/auth/revoke-all-sessions` — invalida todas las sesiones del usuario
- [ ] Cron semanal: limpiar `RevokedSession` con `expiresAt < now()`
- [ ] Tests: login sin 2FA cuando está activo → 403, código TOTP incorrecto → 401, sesión revocada → 401

---

## DÍA 5 — PaymentService: interfaz TypeScript + validaciones de monto

**Meta:** Abstracción central de pagos con validaciones de seguridad integradas en los tipos.

**[A1] Validación de montos — integrada en los tipos desde el inicio:**
```typescript
// packages/payment-providers/src/types.ts
export interface CheckoutInput {
  orderId: string
  amount: number           // en centavos — validado con Zod antes de llegar aquí
  currency: 'ARS' | 'USD' | 'EUR' | 'MXN' | 'CLP' | 'COP'
  description: string
  customerEmail: string
  successUrl: string
  failureUrl: string
  idempotencyKey: string
  items?: OrderItem[]      // para órdenes con múltiples productos [F1]
}

// Zod schema — validación en controller Y en service (dos capas)
export const CheckoutSchema = z.object({
  amount: z.number().int()
    .min(50, 'Monto mínimo: 50 centavos')
    .max(99_999_999, 'Monto máximo: $999,999.99'),
  currency: z.enum(['ARS', 'USD', 'EUR', 'MXN', 'CLP', 'COP']),
  // amount negativo o cero → rechazado antes de llegar al proveedor
})

export interface PaymentService {
  createCheckout(input: CheckoutInput): Promise<{ redirectUrl: string; externalRef: string }>
  getPaymentStatus(externalRef: string): Promise<PaymentStatus>
  parseWebhook(body: unknown, headers: Record<string, string>): Promise<WebhookEvent>
  refund(externalRef: string, amount?: number): Promise<void>
  createSubscription(input: SubscriptionInput): Promise<{ externalRef: string }>
  cancelSubscription(externalRef: string): Promise<void>
  getByIdempotencyKey(key: string): Promise<{ externalRef: string; status: PaymentStatus } | null>
}
```

- [ ] `packages/payment-providers/src/types.ts` con todos los tipos
- [ ] `CheckoutSchema` con validación de monto mínimo 50 centavos y máximo $999,999.99
- [ ] `PaymentRouter` que lee `merchant.paymentProvider` de la DB
- [ ] Verificar que los tipos se importan sin errores en `apps/api` y `apps/web`

---

## DÍA 6 — MockPaymentService

**Meta:** Proveedor simulado que permite desarrollar sin credenciales reales.

- [ ] `packages/payment-providers/src/mock.ts` implementando `PaymentService`
- [ ] Página `apps/web/src/app/mock-checkout/[id]/page.tsx` con botones: "Pagar (éxito)", "Pagar (fallo)", "Cancelar"
- [ ] `MOCK_PAYMENT_BEHAVIOR=success|fail|timeout|pending`
- [ ] Guard: solo disponible si `NODE_ENV !== 'production'`
- [ ] Simula delay de webhook configurable (`MOCK_WEBHOOK_DELAY_MS`)
- [ ] Tests del mock para tests de integración

---

## DÍA 7 — MercadoPago API integration

**Meta:** Adapter TypeScript para la API real de MercadoPago.

**Cómo funciona (el template conecta con estos endpoints, no maneja tarjetas):**
```
POST https://api.mercadopago.com/checkout/preferences  → crea checkout, devuelve URL
GET  https://api.mercadopago.com/v1/payments/:id       → consulta estado
POST https://api.mercadopago.com/v1/payments/:id/refunds → reembolso
POST https://api.mercadopago.com/preapproval           → suscripción
```

- [ ] `npm install mercadopago`
- [ ] `packages/payment-providers/src/mercadopago.ts`
- [ ] `createCheckout` → `POST /checkout/preferences` con `back_urls` y `notification_url`
- [ ] `getPaymentStatus` → `GET /v1/payments/:id` mapeando estados:
  ```typescript
  const MP_STATUS_MAP = {
    'approved': 'SUCCESS', 'rejected': 'FAILED', 'cancelled': 'FAILED',
    'pending': 'PENDING', 'in_process': 'PROCESSING', 'refunded': 'REFUNDED',
    'charged_back': 'DISPUTED'  // ← nuevo estado para chargebacks
  }
  ```
- [ ] `parseWebhook`:
  - Verificar firma HMAC-SHA256 del header `x-signature`
  - **[A3]** Verificar timestamp `ts` del header — rechazar si tiene más de 5 minutos:
    ```typescript
    const ts = extractTs(headers['x-signature']) // viene como "ts=1234567890,v1=abc..."
    if (Date.now() / 1000 - ts > 300) throw new Error('Webhook expired — possible replay attack')
    ```
  - Llamar a `GET /v1/payments/{id}` para obtener el estado real (no confiar solo en el body)
  - **[A2]** Verificar que `amount` y `currency` del webhook coinciden con el pago en DB
- [ ] `refund` con límite de tiempo: `merchant.refundWindowDays` (por defecto 180 días para MP)
- [ ] `createSubscription` → `POST /preapproval`
- [ ] **[F2]** Soporte a pagos en efectivo: `POST /checkout/preferences` con método `rapipago` o `pagofacil`
- [ ] Variables: `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`
- [ ] Tests con sandbox de MercadoPago

---

## DÍA 8 — Stripe API integration

**Meta:** Adapter TypeScript para la API real de Stripe.

**Cómo funciona (el template conecta con estos endpoints, no maneja tarjetas):**
```
POST https://api.stripe.com/v1/checkout/sessions    → crea checkout, devuelve URL
GET  https://api.stripe.com/v1/payment_intents/:id  → consulta estado
POST https://api.stripe.com/v1/refunds              → reembolso
POST https://api.stripe.com/v1/subscriptions        → suscripción
```

- [ ] `npm install stripe`
- [ ] `packages/payment-providers/src/stripe.ts`
- [ ] `createCheckout` → `POST /v1/checkout/sessions` con `mode: 'payment'`
- [ ] `getPaymentStatus` → `GET /v1/payment_intents/:id` mapeando estados:
  ```typescript
  const STRIPE_STATUS_MAP = {
    'succeeded': 'SUCCESS', 'payment_failed': 'FAILED', 'canceled': 'FAILED',
    'processing': 'PROCESSING', 'requires_payment_method': 'PENDING'
  }
  ```
- [ ] `parseWebhook`:
  - `stripe.webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET)` — verifica firma
  - **[A3]** Stripe incluye `t=` en la firma — `constructEvent` lo verifica automáticamente con `tolerance: 300`
  - **[A2]** Verificar que `event.data.object.amount` y `currency` coinciden con el pago en DB
- [ ] `refund` con límite de tiempo: `merchant.refundWindowDays` (por defecto 365 días para Stripe)
- [ ] **[F2]** Soporte a OXXO (México): `PaymentMethod` con `type: 'oxxo'` en Stripe
- [ ] Variables: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- [ ] Testear con `stripe listen --forward-to localhost:3001/api/webhooks/stripe`

---

## DÍA 9 — Outbox Pattern

**Meta:** Ningún pago se cobra sin registrarse. Ningún evento se pierde.

```typescript
await db.$transaction(async (tx) => {
  await tx.payment.update({ where: { id }, data: { status: 'SUCCESS', confirmedAmount, confirmedCurrency } })
  await tx.paymentAuditLog.create({ data: { paymentId: id, fromStatus: 'PENDING', toStatus: 'SUCCESS', changedBy: 'webhook', metadata: { ip, provider } } })
  await tx.outboxEvent.create({ data: { type: 'payment.success', payload: { paymentId: id, merchantId, amount }, nextRetryAt: new Date() } })
  // Si cualquiera falla → rollback completo
})
```

- [ ] `src/workers/outboxWorker.ts` — corre cada 5 segundos
- [ ] Query: `WHERE sentAt IS NULL AND nextRetryAt <= NOW() LIMIT 50`
- [ ] Al fallar: `attempts + 1`, `lastError`, `nextRetryAt = now() + 2^attempts * 1000ms`
- [ ] Después de 5 fallos: `DeadLetterEvent` + alerta
- [ ] Tests: fallo de DB después del cobro → rollback completo

---

## DÍA 10 — Concurrencia con SELECT FOR UPDATE

**Meta:** Dos procesos no modifican el mismo pago simultáneamente.

```typescript
await db.$transaction(async (tx) => {
  const [payment] = await tx.$queryRaw<Payment[]>`
    SELECT * FROM payments WHERE id = ${paymentId} FOR UPDATE
  `  // ← $queryRaw con tagged template = parameterizado = seguro contra SQL injection
  if (payment.status !== 'PENDING') return  // ya procesado por otro proceso
  // continuar...
})
```

- [ ] `SELECT FOR UPDATE` en `processPaymentUpdate`
- [ ] `SELECT FOR UPDATE` en operaciones de balance
- [ ] `SELECT FOR UPDATE` en activación de suscripciones
- [ ] Tests: dos requests simultáneos → solo uno procesa

---

## DÍA 11 — Idempotencia de webhooks

**Meta:** El mismo webhook de MP o Stripe procesado dos veces no genera dos cobros.

```typescript
// CRÍTICO: devolver 200, NO 4xx. Con 4xx el proveedor reintenta indefinidamente.
if (existing) return c.json({ status: 'already_processed' }, 200)
```

- [ ] Middleware `src/middlewares/webhookIdempotency.ts`
- [ ] `PaymentEvent` creado dentro de la misma `$transaction` del pago
- [ ] Tests: mismo webhook 3 veces → procesado exactamente 1 vez

---

## DÍA 12 — BullMQ + Redis

**Meta:** Webhooks salientes con reintentos automáticos. Worker con firma HMAC y timeout de 8s.

- [ ] `npm install bullmq ioredis`
- [ ] Redis en `docker-compose.yml`
- [ ] `src/queues/webhookDeliveryQueue.ts` — 5 reintentos con backoff exponencial
- [ ] Worker con `AbortSignal.timeout(8000)` — ninguna llamada externa bloquea más de 8s
- [ ] Endpoints: `GET /api/webhooks/:id/deliveries`, `POST /api/webhooks/:id/test`

---

## DÍA 13 — Reconciliación automática

**Meta:** Pagos en PENDING por más de 10 minutos se consultan directamente a MP o Stripe.

- [ ] `src/jobs/reconcile.ts` — cron cada 15 minutos
- [ ] Llama a `getPaymentStatus(externalId)` del proveedor correspondiente
- [ ] Registra en `PaymentAuditLog` con `changedBy: 'reconciliation'`
- [ ] Alerta si un pago lleva más de 20 minutos sin resolverse
- [ ] Tests: pago PENDING 11 minutos → reconciliación lo marca SUCCESS

---

## DÍA 14 — Accounts y Transactions

**Meta:** CRUD de cuentas y transacciones con double-entry ledger, state machine completa e idempotencia robusta.

**Diseño del ledger:**
- `Account.balance` es un campo **cacheado** — se actualiza atómicamente junto con las `LedgerEntry`
- `LedgerEntry` es la **fuente de verdad** — el balance se puede verificar en cualquier momento:
  ```typescript
  SUM(LedgerEntry.amount WHERE accountId = X) === Account.balance
  ```
- Cada `TRANSFER` o `REFUND` genera exactamente 2 entradas que suman 0 (débito + crédito)
- `DEPOSIT` y `WITHDRAWAL` generan 1 entrada — sin contraparte interna (limitación documentada)

**Account state machine:**
```
ACTIVE  ──freeze──►   FROZEN
FROZEN  ──unfreeze──► ACTIVE
ACTIVE  ──close──►    CLOSED   (guard: balance === 0)
FROZEN  ──close──►    CLOSED   (guard: balance === 0)
CLOSED  ──(nada)      terminal — no se puede reabrir
```

**Idempotencia con ventana de tiempo:**
```typescript
// Si el cliente NO envía idempotencyKey, el sistema genera uno automáticamente:
const window = Math.floor(Date.now() / 60_000) // ventana de 60 segundos
const autoKey = sha256(`auto:${merchantId}:${debitId}:${creditId}:${amount}:${type}:${normalizedDescription}:${window}`)
// description normalizada: trim().toLowerCase() — evita falsos negativos por mayúsculas/espacios
// Protege double-clicks y retries de red sin bloquear transfers legítimos posteriores
// Para operaciones de alta frecuencia entre las mismas cuentas → usar idempotencyKey explícito
```

**Anti-deadlock con locks determinísticos:**
```typescript
// NUNCA bloquear fila por fila en un loop — un solo query en orden consistente
SELECT * FROM "Account" WHERE id = ANY($ids) ORDER BY id FOR UPDATE
// ORDER BY id garantiza el mismo orden siempre → elimina deadlocks A→B vs B→A simultáneos
```

**Reversal sin fondos:**
```typescript
// Si la cuenta de origen del reversal no tiene saldo suficiente → error explícito:
// { "error": "Insufficient balance in account X to process reversal", "code": "REVERSAL_INSUFFICIENT_FUNDS" }
// No se permite saldo negativo — el reversal falla limpiamente
```

- [ ] Enums: `AccountStatus { ACTIVE, FROZEN, CLOSED }`, `TransactionStatus { COMPLETED, FAILED, REVERSED }`
- [ ] Modelo `Account` — ver sección MODELOS DE BASE DE DATOS
- [ ] Modelo `Transaction` — ver sección MODELOS DE BASE DE DATOS
- [ ] Modelo `LedgerEntry` — ver sección MODELOS DE BASE DE DATOS
- [ ] Migración: `prisma migrate dev --name phase3_accounts_transactions_ledger`
- [ ] Zod schemas en `src/schemas/accounts.ts` y `src/schemas/transactions.ts`
  - `CreateTransactionSchema`: discriminated union por `type` — TRANSFER/DEPOSIT/WITHDRAWAL
  - Imposible enviar combinaciones inválidas de cuentas a nivel de tipos
- [ ] `src/services/accountService.ts` — state machine + `verifyBalance` (auditoría, no flujo crítico)
- [ ] `src/services/transactionService.ts`:
  - `resolveIdempotencyKey` — ventana 60s con description normalizada
  - `checkIdempotency` + catch `P2002` para race conditions concurrentes
  - `acquireAccountLocks` — single query `SELECT FOR UPDATE ORDER BY id`
  - `assertLedgerBalance` — assert `sum === 0` para TRANSFER/REFUND + log antes de throw
- [ ] Balance en centavos, nunca negativo, cuenta frozen/closed no opera
- [ ] Cursor pagination: `?cursor=cuid&limit=20` (no offset — los datos cambian en tiempo real)
- [ ] Endpoints accounts: `POST`, `GET`, `GET/:id`, `POST/:id/fund`, `POST/:id/freeze`, `POST/:id/unfreeze`
- [ ] Endpoints transactions: `POST`, `GET`, `GET/:id`, `POST/:id/reverse`
- [ ] Header `X-Idempotent-Replayed: true` cuando la respuesta es cacheada
- [ ] Log estructurado en replay: `{ event: 'idempotent_replay', transactionId, merchantId, idempotencyKey }`
- [ ] Tests: saldo negativo → 422, cuenta frozen → 403, reversal sin fondos → 409, idempotencia → misma tx

---

## DÍA 15 — Swagger / OpenAPI

**Meta:** Documentación interactiva de la API para el comprador del template.

- [ ] `@hono/swagger-ui` ya instalado — accesible en `/docs`, spec en `/openapi.json`
- [ ] `src/lib/openapi.ts` — spec OpenAPI 3.0 completo cubriendo todos los grupos de endpoints:
  - Auth (`/api/auth`): login, register, logout, revoke-all-sessions
  - API keys (`/api/keys`): create, list, revoke
  - 2FA (`/api/2fa`): setup, verify, disable
  - Payments (`/api/payments`): create, get, list
  - Webhooks (`/api/webhooks`): MP + Stripe payloads documentados
  - Accounts (`/api/accounts`): CRUD + fund + freeze + unfreeze
  - Transactions (`/api/transactions`): CRUD + reverse
- [ ] Para cada endpoint: request body, response 200/201, errores 4xx/5xx con ejemplos
- [ ] Campo `idempotencyKey` documentado: comportamiento de ventana automática 60s + key manual
- [ ] Error `REVERSAL_INSUFFICIENT_FUNDS` documentado con ejemplo
- [ ] Todos los códigos de error en inglés con código semántico (`"code": "ACCOUNT_FROZEN"`)
- [ ] Screenshot del `/docs` para el README

---

## DÍA 16 — Frontend: shell + shadcn/ui + dark mode

**Meta:** App Next.js con diseño profesional lista para agregar páginas.

- [ ] `npx shadcn@latest init`
- [ ] Componentes: `Button`, `Input`, `Card`, `Table`, `Badge`, `Dialog`, `Sheet`, `Skeleton`, `Sonner`
- [ ] Dark mode con `next-themes`
- [ ] Layout del dashboard: sidebar colapsable + header + área de contenido
- [ ] Responsive: verificar en 375px, 768px, 1280px

---

## DÍA 17 — Frontend: Login, registro y consentimiento

**Meta:** Flujo completo de autenticación con consentimiento de datos.

- [ ] Página `/login` con React Hook Form + Zod
- [ ] Página `/register` con validación en tiempo real
- [ ] **[E2]** Checkbox de consentimiento obligatorio en el registro (ya implementado en DÍA 3 en el backend — aquí va la UI)
- [ ] Página `/forgot-password` + reset por email
- [ ] Middleware Next.js: `/dashboard/**` redirige a `/login` sin sesión
- [ ] Loading states en todos los formularios (evitar doble submit)
- [ ] Mensajes de error específicos por campo

---

## DÍA 18 — Frontend: i18n + multi-moneda

**Meta:** Soporte español/inglés desde el inicio. Precios formateados por locale.

- [ ] `npm install next-intl`
- [ ] `messages/en.json` y `messages/es.json`
- [ ] Función `formatCurrency(amount: number, currency: string, locale: string)` con `Intl.NumberFormat`
- [ ] Selector de idioma en el header (persistido en cookie)

---

## DÍA 19 — Frontend: Checkout flow

**Meta:** Flujo de pago completo con manejo explícito de todos los estados.

```
/checkout/:orderId → POST /api/checkout → redirect a MP/Stripe/Mock
                   → /payment/success | /payment/failed | /payment/pending
```

- [ ] Página `/checkout/:orderId` con resumen del pago
- [ ] **[B3]** Mensaje claro en `/payment/pending`:
  - "Tu pago está siendo procesado. Recibirás confirmación en los próximos 5 minutos."
  - "**Si no recibes confirmación, tu tarjeta NO fue cargada.** Puedes intentarlo de nuevo."
  - Polling a `GET /api/payments/:id` cada 3s, máximo 30s
- [ ] Componente `<PaymentErrorMessage>` con mensajes específicos por código de error:
  - `insufficient_funds` → "Fondos insuficientes"
  - `card_declined` → "Tarjeta rechazada — contacta a tu banco"
  - `expired_card` → "Tu tarjeta está vencida"
  - `network_error` → "Problema de conexión — tu tarjeta NO fue cargada"
- [ ] Botón "Reintentar" en errores recuperables (con nuevo idempotency key)
- [ ] **[C1]** Si `orderId` ya tiene un pago en SUCCESS → mostrar "Este pago ya fue procesado" en vez de crear otro

---

## DÍA 20 — Emails transaccionales + PDF de comprobante

**Meta:** El usuario recibe confirmación por email con comprobante descargable. Sin esto el template parece poco profesional.

**[B1] Email de confirmación de pago exitoso:**
```
Asunto: "Confirmación de pago — PayFlow"
Cuerpo:
  ✅ Tu pago fue procesado exitosamente
  Monto: $10.50 USD
  ID de transacción: pay_abc123
  Fecha: 17 de abril de 2026
  [Descargar comprobante PDF]
```

**[B2] Email de pago fallido:**
```
Asunto: "Tu pago no pudo procesarse"
Cuerpo:
  ❌ Hubo un problema con tu pago
  Motivo: Fondos insuficientes en tu tarjeta
  Tu tarjeta NO fue cargada.
  [Intentar de nuevo]
```

**[B4] PDF de comprobante:**
- Número de transacción, fecha, monto, moneda, estado, datos del merchant
- Necesario para facturación — muy pedido en LATAM

- [ ] `npm install resend` para emails transaccionales
- [ ] `npm install @react-pdf/renderer` para generar PDFs en TypeScript
- [ ] Plantilla TypeScript para email de éxito (React Email)
- [ ] Plantilla TypeScript para email de fallo
- [ ] Plantilla TypeScript para PDF de comprobante
- [ ] Endpoint `GET /api/payments/:id/receipt` — descarga el PDF
- [ ] El email se envía desde el OutboxWorker (no bloquea el webhook handler)
- [ ] Variables: `RESEND_API_KEY`, `EMAIL_FROM`
- [ ] Tests: pago exitoso → email enviado + PDF generado correctamente

---

## DÍA 21 — Suscripciones: modelo base + planes

**Meta:** Planes y suscripciones funcionales con trials y cancelación.

- [ ] Modelo `Plan`: `{ id, name, price, currency, interval, intervalCount, trialDays }`
- [ ] Seed: Basic $9/mes, Pro $29/mes, Enterprise $99/mes
- [ ] `createSubscription`, `activateSubscription`, `cancelSubscription(immediately: boolean)`
- [ ] Endpoints: `POST /api/subscriptions`, `GET /api/subscriptions/:id`, `DELETE /api/subscriptions/:id`
- [ ] Página `/pricing` con comparación de planes

---

## DÍA 22 — Suscripciones: upgrades, downgrades y prorrateo

**Meta:** Cambio de plan con cobro o crédito proporcional al instante.

```
Upgrade día 15 de 30 ($29 → $99):
  Crédito: ($29 / 30) * 15 = $14.50
  Cargo:   ($99 / 30) * 15 = $49.50
  Cobro inmediato: $35.00 → llamada a MP o Stripe
```

- [ ] `changePlan(subscriptionId, newPlanId)` con prorrateo exacto
- [ ] Diff negativo → acumular en `subscription.creditBalance`
- [ ] Cambio el último día del ciclo → sin prorrateo, aplicar desde el siguiente ciclo
- [ ] Modal de preview del prorrateo antes de confirmar el cambio
- [ ] Tests: upgrade con cobro, downgrade con crédito, cambio el último día

---

## DÍA 23 — Suscripciones: dunning + webhooks + edge cases

**Meta:** Reintentos automáticos en pagos fallidos. Todos los edge cases cubiertos.

```
Pago falla → PAST_DUE, gracePeriodEndsAt = now() + 14 días
  Día  1: reintento silencioso
  Día  3: reintento + email de aviso
  Día  7: reintento + email urgente
  Día 14: CANCELED + email de cancelación
```

**Edge cases críticos:**
- Webhook de renovación duplicado → idempotency key: `(subscriptionId, periodStart)`
- Usuario cancela durante trial → `cancelAtPeriodEnd: true`, no cobrar
- Proveedor devuelve `pending` en renovación → esperar confirmación, no marcar como fallida

- [ ] `src/jobs/subscriptionDunning.ts` — cron diario
- [ ] Handlers para: `subscription.renewed`, `subscription.payment_failed`, `subscription.canceled`
- [ ] Todos con idempotencia (DÍA 11) y `SELECT FOR UPDATE` (DÍA 10)
- [ ] Tests: 4 fallos → CANCELED, 2 fallos + éxito → ACTIVE, webhook duplicado → procesado 1 vez

---

## DÍA 24 — Dashboard admin: pagos con SSE real-time

**Meta:** Admin ve pagos actualizarse en tiempo real. Las tres protecciones de SSE implementadas.

```typescript
// Las tres omisiones que destruyen SSE en producción:
// 1. Sin heartbeat → proxy corta la conexión a los 60s
// 2. Sin límite de conexiones → spike destruye el servidor
// 3. Sin cleanup → listeners huérfanos en Redis acumulan hasta crashear el proceso
const heartbeat = setInterval(() => controller.enqueue(': ping\n\n'), 25_000)
// cleanup en req.signal 'abort': clearInterval + unsubscribe + releaseSlot + close
```

- [ ] Endpoint SSE `GET /api/payments/stream` con heartbeat + límite (100 conexiones) + cleanup
- [ ] BullMQ publica en Redis cuando un job termina
- [ ] Cliente React con `EventSource` + fallback a `useSWR` con `refreshInterval: 3000`
- [ ] Tests: conectar SSE → actualizar pago → cliente recibe evento en < 1s

---

## DÍA 25 — Dashboard admin: filtros, CSV y audit de acciones admin

**Meta:** Admin puede encontrar, exportar y auditar todos los pagos. Toda acción queda registrada.

- [ ] Tabla con filtros: estado, proveedor, rango de fechas, monto, merchant
- [ ] Búsqueda por ID de pago o ID externo del proveedor
- [ ] Exportación CSV con los filtros activos
- [ ] Click en pago → drawer con historial de `PaymentAuditLog`
- [ ] Botón de reembolso manual con confirmación + razón obligatoria
- [ ] **[A6]** Verificar límite de tiempo antes de mostrar el botón de reembolso:
  - Si `daysSincePayment > merchant.refundWindowDays` → botón deshabilitado con tooltip explicativo
- [ ] **[D3]** Todo reembolso manual se registra en `PaymentAuditLog` con `changedBy: 'admin:userId'` y la razón ingresada
- [ ] Cards de métricas: ingresos del día/semana/mes, tasa de éxito, pagos pendientes

---

## DÍA 26 — Chargebacks y disputas

**Meta:** El sistema detecta chargebacks automáticamente y alerta al admin con tiempo para responder.

**Por qué es crítico:** sin handler de chargebacks, el merchant se entera por el banco, no por el sistema. Tiene un plazo para responder (típicamente 7–10 días) y si no lo hace, pierde el dinero automáticamente.

```typescript
// Webhook de MercadoPago: action = "payment.updated", status = "charged_back"
// Webhook de Stripe: type = "charge.dispute.created"
// → Crear registro en Dispute
// → Marcar Payment.status = 'DISPUTED'
// → Enviar email urgente al admin con dueDate (fecha límite para responder)
// → Mostrar alerta en el dashboard
```

- [ ] Handler TypeScript para webhook `charged_back` de MercadoPago
- [ ] Handler TypeScript para webhook `charge.dispute.created` de Stripe
- [ ] Crear registro en `Dispute` con `status: 'open'` y `dueDate` calculada
- [ ] Actualizar `Payment.status = 'DISPUTED'` en `$transaction` con outbox
- [ ] Email urgente al admin: "Tienes una disputa abierta. Fecha límite: [fecha]. [Ver disputa]"
- [ ] Sección en el dashboard: "Disputas abiertas" con badge rojo y contador
- [ ] Endpoint `POST /api/disputes/:id/respond` — el admin puede subir evidencia
- [ ] Handler para resolución: `charge.dispute.closed` (Stripe) / `status: "resolved"` (MP)
- [ ] Tests: webhook de disputa → Dispute creado + Payment.status = DISPUTED + email enviado

---

## DÍA 27 — Fraude avanzado

**Meta:** Reglas antifraude que bloquean antes de llamar a MP o Stripe.

**[A1] Validación de monto ya está en DÍA 5 — aquí van las reglas de comportamiento:**

```typescript
// [C1] orderId duplicado con SUCCESS → rechazar con 409 (ya está en REGLAS DE NEGOCIO)
// [C2] Montos sospechosos → flag para revisión manual (no bloquear, solo alertar)
const SUSPICIOUS_AMOUNTS = [50, 99, 100, 101]  // técnica de prueba de tarjetas robadas
if (SUSPICIOUS_AMOUNTS.includes(input.amount)) {
  await flagForManualReview(payment.id, 'suspicious_amount')
}
// [C3] Más de 3 tarjetas distintas por usuario en 24h
const distinctCards = await db.paymentAttempt.groupBy({
  by: ['cardFingerprint'],
  where: { userId, createdAt: { gt: oneDayAgo } }
})
if (distinctCards.length > 3) throw new FraudError('too_many_cards')

// [C4] Tasa de fallos > 10% en 10 minutos → alerta al admin
```

- [ ] `src/services/fraudService.ts`:
  - **[C1]** Verificar `@@unique([merchantId, orderId])` — rechazar 409 si ya existe SUCCESS
  - **[C2]** Flag automático en montos de prueba de tarjetas
  - **[C3]** Límite de 3 tarjetas distintas por usuario en 24h
  - **[C4]** Cron cada 10 minutos: si `failureRate > 10%` → email al admin + log de alerta
- [ ] `PaymentAttempt` guardado siempre, incluyendo bloqueados, con `blockReason`
- [ ] Rate limiting con Redis store: global 100/min por IP, `/api/checkout` 10/min por IP
- [ ] Tests: orderId duplicado → 409, 3 tarjetas → bloqueado, tasa de fallos alta → alerta

---

## DÍA 28 — Logging estructurado + CORS + headers de seguridad

**Meta:** Logs en JSON. CORS con lista blanca. Headers que protegen la app en producción.

**[A4] CORS con lista blanca explícita:**
```typescript
// ❌ Peligroso: app.use('/*', cors())  — acepta cualquier origen
// ✅ Correcto:
app.use('/*', cors({
  origin: (origin) => {
    const allowed = process.env.ALLOWED_ORIGINS?.split(',') ?? []
    return allowed.includes(origin) ? origin : null
  },
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true,
}))
```

- [ ] `npm install pino pino-pretty`
- [ ] `src/lib/logger.ts` con redaction de campos sensibles: `['password', 'accessToken', 'webhookSecret']`
- [ ] `requestId` (nanoid) en cada request, propagado en todos los logs
- [ ] **[A4]** CORS con `ALLOWED_ORIGINS` en `.env` — lista blanca explícita
- [ ] Headers de seguridad con `@hono/secure-headers`: `X-Frame-Options`, `X-Content-Type-Options`, `HSTS`, `CSP`
- [ ] `NODE_ENV=production` → sin stack traces en respuestas HTTP
- [ ] Variables de entorno no expuestas en mensajes de error

---

## DÍA 29 — Compliance LATAM

**Meta:** Cumplimiento mínimo de leyes de protección de datos de Argentina, México, Colombia y Chile.

**[E1] Derecho al olvido — DELETE /api/users/me:**
```typescript
// Ley 25.326 (Argentina), LFPDPPP (México), Ley 1581 (Colombia), Ley 19.628 (Chile)
// El usuario puede solicitar el borrado de TODOS sus datos
async function deleteUserData(userId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    // Anonimizar pagos (no borrar — necesarios para contabilidad)
    await tx.payment.updateMany({ where: { userId }, data: { metadata: null } })
    // Borrar datos personales
    await tx.userConsent.delete({ where: { userId } })
    await tx.user.update({ where: { id: userId }, data: {
      email: `deleted_${userId}@deleted.invalid`,  // anonimizar
      name: 'Usuario eliminado',
      deletedAt: new Date()
    }})
  })
  // Registrar en audit log que el usuario ejerció su derecho al olvido
}
```

- [ ] **[E1]** Endpoint `DELETE /api/users/me` con confirmación de contraseña
- [ ] Anonimizar datos del usuario (no borrar pagos — necesarios para contabilidad)
- [ ] Página `/dashboard/account/delete` con flujo de confirmación claro
- [ ] **[E2]** `UserConsent` ya implementado en DÍA 3 — verificar que funciona correctamente
- [ ] **[E3]** Nota en `README.md`: "PayFlow no almacena datos de tarjetas. Los datos de pago son manejados directamente por MercadoPago y Stripe, que cuentan con certificación PCI DSS. PayFlow es compatible con SAQ-A."
- [ ] Tests: `DELETE /api/users/me` → datos anonimizados, pagos intactos

---

## DÍA 30 — Pagos en efectivo: OXXO (México) + Rapipago/Pago Fácil (Argentina)

**Meta:** El template soporta pagos en efectivo, ampliando el mercado LATAM.

**Por qué importa:** en México, ~40% de la población no tiene tarjeta bancaria. OXXO es el método de pago más usado para compras online. En Argentina, Rapipago y Pago Fácil tienen millones de usuarios.

**Cómo funciona (igual que siempre, MP/Stripe hacen el trabajo):**
```
Usuario elige "Pagar en efectivo"
→ MP genera un código/voucher para imprimir o mostrar en pantalla
→ Usuario va a OXXO/Rapipago y paga en efectivo
→ MP envía webhook "payment.approved" cuando se confirma el pago (puede tardar horas)
→ Tu sistema actualiza el estado
```

- [ ] En `MercadoPagoService.createCheckout`: agregar `payment_methods.excluded_payment_methods` configurable
- [ ] Nuevo método en `PaymentService`: `createCashVoucher(input): Promise<{ voucherCode: string; instructions: string; expiresAt: Date }>`
- [ ] Página de instrucciones de pago en efectivo (`/payment/cash-instructions/:id`):
  - Muestra el código/voucher claramente
  - Instrucciones paso a paso para ir a pagar
  - Fecha de vencimiento del voucher
  - Botón "Enviar instrucciones por email"
- [ ] Email automático con las instrucciones de pago en efectivo
- [ ] La página de `/payment/pending` maneja este caso: "Tu voucher vence el [fecha]. Tienes hasta entonces para pagar en efectivo."
- [ ] **Stripe + OXXO:** `PaymentMethod` con `type: 'oxxo'` en México
- [ ] Tests: crear voucher → usuario "paga" en sandbox → webhook llega → pago confirmado

---

## DÍA 31 — Invoice por link + múltiples items por orden

**Meta:** El merchant puede generar un link de pago sin que el cliente tenga cuenta. Órdenes con múltiples productos.

**[F3] Invoice por link — caso de uso real:**
```
Freelancer quiere cobrarle a un cliente:
→ Crea invoice en el dashboard: $500 USD, "Diseño de logo"
→ El sistema genera: payflow.app/invoice/inv_abc123
→ Freelancer envía ese link por WhatsApp
→ Cliente abre el link, paga con MP o Stripe
→ Freelancer ve el pago confirmado en el dashboard
```

**[F1] Múltiples items:**
```typescript
// items: [{ name: 'Producto A', quantity: 2, price: 1000 }, { name: 'Producto B', quantity: 1, price: 500 }]
// amount total = sum(item.price * item.quantity) — verificado en el backend
// Se pasa a MP como 'items' array en la Preference
// Se pasa a Stripe como 'line_items' array en el Checkout Session
```

- [ ] **[F3]** Endpoint `POST /api/invoices` — crea invoice con monto, descripción e items opcionales
- [ ] Endpoint `GET /api/invoices/:id` — devuelve datos del invoice (público, sin auth)
- [ ] Página pública `/invoice/:id` — el cliente ve el invoice y paga sin necesitar cuenta
- [ ] Expiración configurable del invoice (`expiresAt`)
- [ ] **[F1]** Soporte a `items[]` en `CheckoutInput` — se pasa a MP y Stripe correctamente
- [ ] La suma de items debe coincidir con `amount` total — validación en el backend
- [ ] Tests: crear invoice → pagar por link → invoice marcado como pagado

---

## DÍA 32 — Página de estado pública (/status)

**Meta:** Los usuarios pueden verificar si el sistema está funcionando antes de contactar soporte.

**[B5] Por qué es importante para las ventas:**
Cuando algo falla (el proveedor de pagos tiene un incidente, el servidor está lento), los usuarios buscan una página de estado antes de escribir al soporte. Sin esta página, el soporte recibe 50 mensajes de "¿están caídos?". Con la página, los usuarios se auto-informan.

```
payflow.app/status
  ✅ API de pagos: Operacional
  ✅ MercadoPago: Operacional
  ✅ Stripe: Operacional
  ✅ Webhooks: Operacional
  ⚠️ Dashboard admin: Degradado (respuesta lenta)

Últimos 90 días: ██████████████████████████████ 99.8% uptime
```

- [ ] Página pública `apps/web/src/app/status/page.tsx` — sin autenticación requerida
- [ ] `GET /api/health` — endpoint que verifica: DB conectada, Redis conectado, MP responde, Stripe responde
- [ ] Cron cada 5 minutos que registra el resultado del health check en `StatusCheck { service, status, latencyMs, checkedAt }`
- [ ] La página lee los últimos 90 días de `StatusCheck` para calcular uptime
- [ ] Si algún servicio falla → badge amarillo/rojo + descripción del incidente
- [ ] Link a `/status` en el footer de la app y en el README

---

## DÍA 33 — Frontend: gestión de suscripciones

**Meta:** Usuario puede ver, cambiar y cancelar su suscripción con UX clara.

- [ ] `/dashboard/subscription`: estado actual, próximo cobro, plan activo
- [ ] Modal de cambio de plan con preview del prorrateo antes de confirmar
- [ ] Flujo de cancelación: "¿Estás seguro?" → "¿Por qué cancelas?" → confirmación
- [ ] Badge de estado con colores: ACTIVE (verde), PAST_DUE (amarillo), TRIALING (azul), CANCELED (gris)
- [ ] Historial de pagos de la suscripción (últimos 12 meses)
- [ ] `/pricing` con comparación de planes y botón de upgrade desde el plan actual

---

## DÍA 34 — Tests de integración completos

**Meta:** Cobertura >70% con Vitest + TypeScript usando DB real. Todos los nuevos features testeados.

- [ ] PostgreSQL separada para tests: `DATABASE_URL_TEST`
- [ ] `beforeEach`: limpiar tablas respetando foreign keys
- [ ] Tests de pagos: checkout → webhook → SUCCESS, webhook duplicado → 1 vez, concurrencia, reconciliación
- [ ] Tests de suscripciones: upgrade/downgrade, dunning, grace period, webhooks duplicados
- [ ] Tests de fraude: orderId duplicado → 409, montos sospechosos → flag, 3 tarjetas → bloqueado
- [ ] Tests de outbox: rollback completo si falla la DB
- [ ] Tests de chargebacks: webhook → Dispute creado + email enviado
- [ ] Tests de compliance: `DELETE /api/users/me` → datos anonimizados
- [ ] Tests de invoice: crear → pagar por link → marcado como pagado
- [ ] Tests de cash payments: voucher creado → webhook de confirmación
- [ ] Tests de admin security: 2FA, JWT revocado, acciones admin en audit log
- [ ] `npm run test:coverage` → >70%

---

## DÍA 35 — Docker + docker-compose

**Meta:** Todo el proyecto levanta con un solo comando desde cero.

```bash
docker-compose up
# PostgreSQL + Redis + API + Web — todo listo en un comando
```

- [ ] `docker-compose.yml`: PostgreSQL + Redis + api + web con healthchecks
- [ ] `Dockerfile` para `apps/api`: multi-stage (TypeScript builder → Node runner)
- [ ] `Dockerfile` para `apps/web`: multi-stage (Next.js builder → runner)
- [ ] `.dockerignore`: excluir `node_modules`, `.env`, `.git`, `dist`
- [ ] Entrypoint: `prisma migrate deploy` + seed antes de levantar
- [ ] Verificar desde cero: `docker-compose down -v && docker-compose up`

---

## DÍA 36 — GitHub Actions CI

**Meta:** Cada push corre type-check + tests automáticamente.

- [ ] `.github/workflows/ci.yml`: install → lint → type-check → test → coverage
- [ ] Servicios en CI: PostgreSQL + Redis
- [ ] Secrets: `DATABASE_URL_TEST`, `MP_ACCESS_TOKEN_TEST`, `STRIPE_SECRET_KEY_TEST`
- [ ] Badge de CI en README

---

## DÍA 37 — Deploy en Railway

**Meta:** App en producción con pagos reales funcionando.

- [ ] 4 servicios en Railway: PostgreSQL, Redis, API, Web
- [ ] `prisma migrate deploy` como release command
- [ ] Configurar webhooks de MercadoPago apuntando a la URL de producción
- [ ] Configurar webhooks de Stripe apuntando a la URL de producción
- [ ] `ALLOWED_ORIGINS` con la URL real del frontend en producción
- [ ] Verificar flujo completo con pago real mínimo ($1 o equivalente en ARS)
- [ ] Verificar SSE en producción
- [ ] Verificar email de confirmación en producción

---

## DÍA 38 — CLI de setup

**Meta:** El comprador pasa de cero a "funciona" en menos de 5 minutos.

```bash
npx payflow init
# ✔ Nombre del proyecto: my-saas
# ✔ Proveedor de pagos: MercadoPago / Stripe / Ambos
# ✔ Moneda base: ARS / USD / EUR / MXN
# ✔ Suscripciones: Sí / No
# ✔ Pagos en efectivo: Sí / No
# → Genera .env completo
# → npx prisma migrate deploy
# → Seed con datos de ejemplo
# → docker-compose up
# → Abre localhost:3000
```

- [ ] `packages/cli/` en TypeScript con `@clack/prompts`
- [ ] Genera `.env` completo con los valores elegidos
- [ ] Corre migraciones y seed automáticamente
- [ ] Publicar como `payflow-cli` en npm

---

## DÍA 39 — README profesional + SETUP.md + tag v1.0.0

**Meta:** Template listo para vender. El README es parte del producto.

- [ ] `README.md`:
  - Screenshot del dashboard, checkout y página de estado
  - Lista de features (incluyendo antifraude, 2FA, chargebacks, OXXO, invoice por link)
  - "Funcionando en 5 minutos" con `npx payflow init`
  - Stack: TypeScript, Next.js, Hono, Prisma, MercadoPago, Stripe
  - **[E3]** Nota de seguridad: "PayFlow no almacena datos de tarjetas. Compatible con PCI SAQ-A."
  - Badge de CI
- [ ] `SETUP.md` para compradores:
  - Cómo obtener `MP_ACCESS_TOKEN` (MercadoPago Developers)
  - Cómo obtener `STRIPE_SECRET_KEY` (Stripe Dashboard)
  - Cómo configurar webhooks en MP y Stripe
  - Cómo activar 2FA en el admin
  - Cómo hacer el primer pago de prueba con Mock
  - Cómo activar OXXO para México
  - Cómo personalizar colores y logo
- [ ] `.env.example` con comentario por cada variable
- [ ] Sin datos personales, keys reales ni emails reales en el código
- [ ] Sin `console.log`, `TODO` ni `FIXME`
- [ ] `npm run type-check` → 0 errores
- [ ] `npm run test:coverage` → >70%
- [ ] `git tag v1.0.0 && git push --tags`
- [ ] Listing en Gumroad / Lemon Squeezy

---

## VARIABLES DE ENTORNO COMPLETAS

```env
# DATABASE
DATABASE_URL=""              # PostgreSQL pooled
DATABASE_URL_UNPOOLED=""     # PostgreSQL directo (migraciones)
DATABASE_URL_TEST=""         # PostgreSQL para tests

# AUTH
NEXTAUTH_SECRET=""           # openssl rand -base64 32
NEXTAUTH_URL=""              # http://localhost:3000 o URL de prod
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""

# REDIS
REDIS_URL=""                 # redis://localhost:6379

# CORS — lista blanca de orígenes permitidos
ALLOWED_ORIGINS=""           # https://tuapp.com,https://www.tuapp.com

# MERCADO PAGO
# https://www.mercadopago.com/developers/panel/app
MP_ACCESS_TOKEN=""           # TEST-... (sandbox) o APP_USR-... (producción)
MP_WEBHOOK_SECRET=""         # para verificar firma x-signature

# STRIPE
# https://dashboard.stripe.com/apikeys
STRIPE_SECRET_KEY=""         # sk_test_... o sk_live_...
# https://dashboard.stripe.com/webhooks
STRIPE_WEBHOOK_SECRET=""     # whsec_...

# MOCK (solo dev/test, bloqueado en producción)
PAYMENT_PROVIDER=mock        # mercadopago | stripe | mock
MOCK_PAYMENT_BEHAVIOR=success  # success | fail | timeout | pending
MOCK_WEBHOOK_DELAY_MS=2000

# APP
NODE_ENV=development
PORT=3001
LOG_LEVEL=info
WEBHOOK_TIMEOUT_MS=8000

# EMAIL
RESEND_API_KEY=""            # https://resend.com
EMAIL_FROM="PayFlow <noreply@tudominio.com>"

# ENCRYPTION (para cifrar secrets en DB como el TOTP secret del 2FA)
ENCRYPTION_KEY=""            # openssl rand -base64 32
```

---

## LOG DE SESIONES

| Fecha | Día | Tarea completada | Notas |
|---|---|---|---|
| 2026-04-15 | Setup inicial | Proyecto base Hono + TypeScript + Prisma | Antes de este roadmap |
| 2026-04-20 | Día 1 | Monorepo Turborepo + apps/api + apps/web + packages/payment-providers + ESLint | TypeScript strict, 0 errores |
| 2026-04-25 | Días 5–11 | PaymentService interface, MockPaymentService, state machine, processPaymentUpdate, rutas /payments y /webhooks | Flujo PENDING→PROCESSING→SUCCESS probado manualmente |
| 2026-04-26 | Días 12–13 | OutboxWorker (SKIP LOCKED, backoff cap), reconciliación (thresholds distintos), Stripe adapter (sandbox OK), MercadoPago adapter (pendiente credenciales) | Fase 2 completa |
| 2026-04-26 | Días 14–15 | Plan de Fase 3 diseñado y aprobado: double-entry ledger (Account + Transaction + LedgerEntry), state machine, idempotencia con ventana 60s, locks determinísticos anti-deadlock, Swagger OpenAPI | Diseño revisado en profundidad con ChatGPT — nivel production real |
| 2026-04-27 | Días 14–15 | Fase 3 completada: migración aplicada, schemas Zod, accountService + transactionService, rutas /accounts y /transactions, spec OpenAPI 3.0 completa en /docs | double-entry ledger, state machine ACTIVE↔FROZEN→CLOSED, idempotencia P2002 race-safe, SELECT FOR UPDATE anti-deadlock, close endpoint con guard balance=0 |
| 2026-04-30 | CI | CI GitHub Actions: type-check en 2 jobs (payment-providers full + api solo schemas sin Prisma). Adapters Stripe v22 + MercadoPago v2 corregidos. Análisis de deuda técnica Fase 2/3 documentado. | Prisma 6 requiere >7 GB RAM para tsc completo — VS Code valida servicios/rutas en local, CI valida el resto |

---

*Roadmap actualizado: 2026-04-30*
*Objetivo: Template full-stack de pagos vendible en $149–199*
*Stack: TypeScript + Next.js 14 + Hono + Prisma + PostgreSQL + Turborepo*
*APIs de pago: MercadoPago + Stripe (intercambiables, el template nunca toca datos de tarjetas)*
*Total: 39 días de trabajo hasta v1.0.0*
