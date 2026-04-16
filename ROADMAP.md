# ROADMAP — payflow-api
**Fintech REST API Template | TypeScript + Hono + Prisma + PostgreSQL**

> Roadmap de construcción sesión por sesión. Al inicio de cada sesión: leer en qué sesión quedamos, ejecutar la tarea, marcar como completado.
> **La app (código, README, comentarios, docs) estará 100% en inglés.**

---

## RESUMEN DEL PROYECTO

**Qué es:** Una API backend que simula una billetera virtual con cuentas, transacciones, webhooks y prevención de duplicados. Lista para vender como template.

**Para qué sirve:** Base para apps de pagos internos, marketplaces, billeteras virtuales, sistemas de créditos, loyalty points, o cualquier MVP fintech.

**Lo que NO hace:** No procesa dinero real de banco. No requiere licencias financieras.

**Precio objetivo:** $49–99 en Gumroad/Lemonsqueezy.

**Idioma del código:** Inglés — variables, comentarios, README, mensajes de error, Swagger, todo.

---

## ESTADO

| Métrica | Ahora | Meta |
|---|---|---|
| Setup del proyecto | ⏳ | ✅ |
| Schema de base de datos | ⏳ | ✅ |
| Autenticación por API keys | ⏳ | ✅ |
| CRUD de cuentas | ⏳ | ✅ |
| Transacciones con state machine | ⏳ | ✅ |
| Idempotency keys | ⏳ | ✅ |
| Webhooks | ⏳ | ✅ |
| Swagger / OpenAPI | ⏳ | ✅ |
| Tests (cobertura >70%) | ⏳ | ✅ |
| GitHub Actions CI | ⏳ | ✅ |
| Docker para dev local | ⏳ | ✅ |
| README profesional | ⏳ | ✅ |
| Deploy en Render/Railway | ⏳ | ✅ |

---

## SESIÓN ACTUAL

**Fecha:** ___________
**Sesión:** ___________
**Tarea activa:** ___________
**Bloqueantes:** ___________

---

## SESIÓN 1 — Setup del proyecto

**Meta:** Proyecto inicializado, TypeScript configurado, servidor corriendo en localhost:3000.

- [ ] Inicializar proyecto Node.js con TypeScript
- [ ] Instalar dependencias: Hono, Prisma, Zod, Vitest, Supertest, tsx, swagger-ui
- [ ] Configurar `tsconfig.json` estricto
- [ ] Configurar scripts en `package.json`: dev, build, start, test, db:push, db:seed
- [ ] Crear estructura de carpetas completa
- [ ] Crear `src/index.ts` y `src/app.ts` con servidor Hono básico
- [ ] Verificar que `npm run dev` levanta en `localhost:3000`
- [ ] Inicializar git y crear repo en GitHub
- [ ] Crear `.env.example` con todas las variables

---

## SESIÓN 2 — Base de datos y schema

**Meta:** Schema completo en Prisma, DB conectada, seed funcionando.

**Modelos:**
```
User           — owner of accounts and API keys
ApiKey         — authentication credential (stores hash, never the real key)
Account        — virtual wallet with balance
Transaction    — movement between accounts (with state machine)
IdempotencyKey — prevents duplicate transactions
Webhook        — external URL to notify on events
WebhookDelivery — log of each delivery attempt
```

**Transaction state machine:**
```
PENDING → PROCESSING → COMPLETED
                    ↘ FAILED
                    ↘ REVERSED
```

- [ ] Escribir `prisma/schema.prisma` con todos los modelos
- [ ] Definir enums: `TransactionStatus`, `TransactionType`, `AccountStatus`
- [ ] Agregar índices en campos de búsqueda frecuente
- [ ] Correr `npx prisma db push`
- [ ] Escribir `prisma/seed.ts` — 2 usuarios, 3 cuentas, 5 transacciones de ejemplo
- [ ] Verificar datos en Prisma Studio
- [ ] Crear `src/lib/db.ts` con singleton de PrismaClient

---

## SESIÓN 3 — Autenticación por API Keys

**Meta:** Todas las rutas protegidas. Solo peticiones con API key válida pasan.

**Cómo funciona:**
```
Client sends:  Authorization: Bearer pk_live_abc123xyz
Server:        hash(pk_live_abc123xyz) → lookup in DB → authorize or reject
```

- [ ] `POST /api/keys` — crear API key (devuelve la key en texto plano UNA sola vez)
- [ ] `GET /api/keys` — listar keys del usuario (sin exponer la key real)
- [ ] `DELETE /api/keys/:id` — revocar key
- [ ] Middleware `src/middlewares/auth.ts` — valida `Authorization: Bearer <key>`
- [ ] Guardar solo hash SHA-256 en DB (nunca la key en texto plano)
- [ ] Prefijos: `pk_live_` para producción, `pk_test_` para testing
- [ ] Tests: valid key ✅, invalid key → 401, revoked key → 401

---

## SESIÓN 4 — Accounts

**Meta:** CRUD completo de cuentas con validaciones de negocio.

**Endpoints:**
```
POST   /api/accounts              — create account
GET    /api/accounts              — list user accounts
GET    /api/accounts/:id          — account detail with balance
POST   /api/accounts/:id/fund     — add funds to account
POST   /api/accounts/:id/freeze   — freeze account
POST   /api/accounts/:id/unfreeze — unfreeze account
```

**Reglas de negocio:**
- Balance never goes negative
- Frozen account cannot send or receive
- Balance stored in cents (integers) — never floats

- [ ] `src/schemas/accounts.ts` — Zod validation schemas
- [ ] `src/services/accountService.ts` — business logic
- [ ] `src/controllers/accountController.ts` — req/res handling
- [ ] `src/routes/accounts.ts` — route definitions
- [ ] Registrar rutas en `app.ts`
- [ ] Tests: create, list, fund, freeze/unfreeze
- [ ] Documentar en `docs/openapi.yaml`

---

## SESIÓN 5 — Transactions (el núcleo)

**Meta:** Transacciones entre cuentas con state machine completa.

**Endpoints:**
```
POST  /api/transactions           — create transaction (send money)
GET   /api/transactions           — list with filters + cursor pagination
GET   /api/transactions/:id       — detail with state history
POST  /api/transactions/:id/reverse — reverse a COMPLETED transaction
```

**Reglas de negocio:**
- Validar saldo suficiente antes de procesar
- Descontar saldo al crear (PENDING), no al completar
- Si falla: revertir el saldo automáticamente
- Solo COMPLETED transactions pueden revertirse
- Cursor pagination (no offset) para listas grandes

**Transaction types:** `TRANSFER`, `DEPOSIT`, `WITHDRAWAL`, `REFUND`

- [ ] `src/schemas/transactions.ts`
- [ ] `src/services/transactionService.ts` — state machine + balance logic
- [ ] `src/controllers/transactionController.ts`
- [ ] `src/routes/transactions.ts`
- [ ] Cursor pagination en `GET /api/transactions`
- [ ] Tests: successful transfer, insufficient funds, reversal, state transitions
- [ ] Documentar en `openapi.yaml`

---

## SESIÓN 6 — Idempotency Keys

**Meta:** Ninguna transacción puede crearse dos veces con la misma key.

**Cómo funciona:**
```
1. Client sends POST /api/transactions with Idempotency-Key: order-789
2. Server checks if that key was already processed
3. If YES → return original response, create nothing
4. If NO  → process, store key + response, return result
```

- [ ] Middleware `src/middlewares/idempotency.ts`
- [ ] Guardar: key, userId, endpoint, response body, status, expiresAt (24h)
- [ ] Devolver header `Idempotency-Key-Status: HIT` en duplicados
- [ ] Aplicar solo a métodos de escritura (POST, PATCH)
- [ ] Tests: same key → same response, different key → new transaction
- [ ] Documentar comportamiento en Swagger y README

---

## SESIÓN 7 — Webhooks

**Meta:** Notificaciones automáticas en cada cambio de estado de transacción.

**Endpoints:**
```
POST   /api/webhooks                      — register webhook URL
GET    /api/webhooks                      — list user webhooks
DELETE /api/webhooks/:id                  — delete webhook
GET    /api/webhooks/:id/deliveries       — delivery history
POST   /api/webhooks/:id/test             — send test event
```

**Cómo funciona el envío:**
```
1. Transaction changes to COMPLETED
2. System finds active webhooks for the user
3. Sends POST to registered URL with event payload
4. Logs result (200 = success, other = failure)
5. On failure: retry 3 times with exponential backoff (1s, 5s, 25s)
```

**Event payload:**
```json
{
  "event": "transaction.completed",
  "timestamp": "2026-04-15T10:30:00Z",
  "data": { "id": "txn_123", "amount": 5000, "status": "COMPLETED" }
}
```

**Seguridad:** Cada payload firmado con HMAC-SHA256 usando un secret único por webhook.

- [ ] `src/lib/webhookSender.ts` — envío + firma + reintentos
- [ ] `src/services/webhookService.ts` — CRUD de webhooks
- [ ] `src/controllers/webhookController.ts`
- [ ] `src/routes/webhooks.ts`
- [ ] Integrar envío en `transactionService.ts`
- [ ] Tests: successful delivery, failure + retry, signature verification
- [ ] Documentar en `openapi.yaml`

---

## SESIÓN 8 — Tests y cobertura

**Meta:** Cobertura >70%, tests de integración con DB real (no mocks).

- [ ] Setup de Vitest con base de datos de test separada
- [ ] Tests de integración: accounts, transactions, webhooks, auth
- [ ] Test crítico: idempotency (duplicado detectado correctamente)
- [ ] Test de state machine (cada transición)
- [ ] Test de saldo negativo (debe rechazar con 422)
- [ ] Test de cuenta congelada (debe rechazar con 403)
- [ ] Correr `npm run test:coverage` → verificar >70%

---

## SESIÓN 9 — CI/CD y Docker

**Meta:** GitHub Actions corre tests en cada push. Docker levanta el proyecto en un comando.

- [ ] `.github/workflows/ci.yml` — instalar deps + correr tests en cada push a main
- [ ] `docker-compose.yml` — PostgreSQL local para desarrollo
- [ ] `Dockerfile` para el servidor
- [ ] Badge de CI en el README
- [ ] Verificar que el pipeline pasa en GitHub Actions

---

## SESIÓN 10 — README, deploy y polish final

**Meta:** Template listo para vender.

- [ ] Screenshot de Swagger UI para el README
- [ ] README profesional: badges, highlights, endpoints, setup, env vars
- [ ] `SETUP.md` — guía paso a paso para compradores
- [ ] `.env.example` completo y documentado
- [ ] Deploy en Render o Railway
- [ ] Verificar Swagger UI en producción
- [ ] Revisar que no hay datos personales en el código
- [ ] Tag de versión: `git tag v1.0.0`
- [ ] Listing en Gumroad junto con authkit

---

## ARQUITECTURA DE REFERENCIA

```
HTTP Request
     │
     ▼
Hono Router
     │
     ├─ Auth Middleware     → validates API key
     ├─ Idempotency Check   → detects duplicate requests
     ▼
Controller                  → handles req/res, no business logic
     │
     ▼
Service                     → business logic, state machine, balance
     │
     ▼
Prisma                      → PostgreSQL queries
     │
     ▼
Webhook Sender              → async, does not block the response
```

---

## VARIABLES DE ENTORNO

```env
DATABASE_URL=""           # PostgreSQL connection string (pooled)
DATABASE_URL_UNPOOLED=""  # Direct URL for migrations
PORT=3000
NODE_ENV="development"
WEBHOOK_TIMEOUT_MS=5000
```

---

## LOG DE SESIONES

| Fecha | Sesión | Completado |
|---|---|---|
| | | |

---

*Roadmap creado: 2026-04-15*
*Objetivo: Template fintech vendible en $49–99*
