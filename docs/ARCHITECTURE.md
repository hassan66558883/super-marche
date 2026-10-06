# TECHNOVA POS — Architecture, Database Design & Roadmap

*Smart Sales. Smart Stock. Smart Business.* — Default country: Chad · Currency: XAF (FCFA) · Languages: FR (default), AR (RTL), EN

---

## 1. Repository inspection

The project had **no repository attached and no existing code**, so there is nothing to preserve, no existing database to migrate, and no conflicts with prior work. The system is built from scratch as an npm-workspaces monorepo. If an existing codebase or database turns up later, it must be migrated with additive Prisma migrations only (never `migrate reset` / `DROP`).

## 2. High-level architecture

```
Internet ──HTTPS──▶ Nginx (TLS, gzip, static SPA, /api reverse proxy, rate limits)
                       │
          ┌────────────┴─────────────┐
          ▼                          ▼
   React SPA (static)        Express API (Node 22, TypeScript)
   Vite build                 routes → controllers → services → repositories
   IndexedDB offline cache        │            Prisma ORM
                                   ▼
                             PostgreSQL 16
```

**Principles**

- **Server is authoritative.** The browser computes cart totals for instant feedback, but the API recomputes prices, discounts, taxes, stock, permissions and invoice numbers inside a single DB transaction.
- **Layering.** Routes only wire middleware; controllers only parse/validate (Zod) and shape responses; services hold business rules; repositories hold reusable queries. React components never hold business logic: they call hooks → stores/services.
- **Money is never a float.** PostgreSQL `NUMERIC(15,2)`; `decimal.js` in both server and client. XAF is rounded to 0 decimals (configurable).
- **History is append-only.** Sales, payments, returns, stock movements, cash movements, ledgers and audit logs are never deleted. Postgres triggers enforce it, not just application code.
- **Every stock change writes an `inventory_movements` row** in the same transaction (`InventoryService.move` is the only code path that touches `inventory.quantity`).
- **RBAC is enforced on the server** (`requirePermission('sales.cancel')`), and mirrored in the UI only to hide actions.
- **Branch scoping.** Every transactional row carries `branch_id`. The active branch comes from the `X-Branch-Id` header, validated against the user's assigned branches (or `branches.all`). The user's default branch loads automatically after login.

## 3. Folder structure

```
technova-pos/
├─ package.json                # npm workspaces: server, client
├─ docker-compose.yml          # postgres, backend, frontend(nginx)
├─ nginx/                      # production reverse proxy + TLS config
├─ scripts/                    # backup.sh, restore.sh, cron examples
├─ docs/                       # ARCHITECTURE.md, API.md, DEPLOYMENT.md
├─ server/
│  ├─ prisma/
│  │  ├─ schema.prisma
│  │  ├─ migrations/           # SQL migrations (+ custom triggers/indexes)
│  │  └─ seed.ts               # realistic Chad demo data
│  ├─ src/
│  │  ├─ config/               # env (Zod-validated), permissions, constants
│  │  ├─ middleware/           # auth, permissions, branch, validate, errors, rate limit
│  │  ├─ validators/           # Zod schemas per module
│  │  ├─ routes/               # express routers per module
│  │  ├─ controllers/          # HTTP ⇄ service adapters
│  │  ├─ services/             # business logic (sales, inventory, cash, pricing…)
│  │  ├─ repositories/         # shared Prisma queries
│  │  ├─ providers/            # payment providers (MobileMoneyProvider…), printers
│  │  ├─ utils/                # money, errors, pagination, numbering, export
│  │  ├─ app.ts                # express app factory (used by tests)
│  │  └─ index.ts              # bootstrap
│  └─ tests/                   # vitest + supertest against a real test database
└─ client/
   └─ src/
      ├─ components/           # ui/ (shadcn-style primitives), pos/, layout/, shared/
      ├─ pages/                # one folder per module
      ├─ layouts/              # AppLayout (sidebar), PosLayout (full-screen)
      ├─ hooks/                # useHotkeys, useBarcodeScanner, useDebounce, queries
      ├─ stores/               # zustand: auth, cart, ui/theme, offline queue
      ├─ services/             # api client, per-module API functions, sync service
      ├─ i18n/                 # fr.json, ar.json, en.json + RTL switching
      ├─ types/
      ├─ utils/                # money formatting, pricing engine (mirrors server)
      └─ routes/               # router + permission guards
```

## 4. Database design

43 tables, UUID keys, `created_at`/`updated_at`, snake_case. Full definition: `server/prisma/schema.prisma`; custom SQL (triggers, trigram and partial indexes) in the `init` migration.

| Domain | Tables | Notes |
|---|---|---|
| Identity | `users`, `roles`, `permissions`, `role_permissions`, `user_roles`, `user_branches`, `user_sessions`, `password_reset_tokens` | Argon2id hashes; refresh tokens stored as SHA-256 hashes and rotated; per-role `max_discount_percent`; account lockout after N failures |
| Organisation | `branches`, `settings`, `document_sequences` | `branches.code` (NDJ, NDS, MOU) drives invoice numbers; settings are key/JSON, optionally per branch |
| Catalog | `categories` (tree), `brands`, `units`, `taxes`, `products`, `product_variants`, `product_barcodes` | multiple barcodes per product/variant; retail + wholesale prices; tax resolved product → category → branch; price mode INCLUSIVE/EXCLUSIVE |
| Inventory | `inventory`, `inventory_movements`, `stock_transfers`, `stock_transfer_items` | one stock row per (branch, product, variant) with `NULLS NOT DISTINCT`; signed movements with `balance_after`; atomic conditional decrement prevents overselling |
| Sales | `sales`, `sale_items`, `payments`, `payment_methods`, `returns`, `return_items`, `held_sales` | item snapshots (name, price, cost, tax rate) survive catalog edits; split payments; `client_ref` idempotency key for offline sync; held carts are not financial records |
| Parties | `customers`, `customer_accounts`, `suppliers`, `supplier_accounts` | `customer_accounts`/`supplier_accounts` are immutable ledgers; `balance` is a denormalised running total updated in the same transaction |
| Purchasing | `purchase_orders`, `purchase_items` | DRAFT → PENDING → APPROVED → RECEIVED (partial receipt supported) / CANCELLED |
| Cash | `cash_registers`, `cash_register_sessions`, `cash_movements`, `expense_categories`, `expenses` | session OPEN/CLOSE with expected vs counted vs difference; every cash effect is a movement |
| Control | `audit_logs`, `notifications` | audit is append-only (trigger blocks UPDATE/DELETE) |

**Key indexes:** `product_barcodes.barcode` (unique), `products.sku` (unique) + trigram on name/sku, `customers.phone`, `sales.invoice_number` (unique), `(branch_id, created_at)` on every transactional table.

**Integrity enforced in the database:** append-only triggers on audit/stock/cash/ledger tables; no-DELETE triggers on sales, sale items, payments, returns, expenses, register sessions; CHECK constraints on quantities and amounts.

### Sale transaction (`POST /api/sales`)

One `prisma.$transaction` (READ COMMITTED + row-level conditional updates):

1. Validate user, permission, branch access and open register session
2. Load products/variants, resolve prices, taxes, cost snapshots
3. Enforce price-override and discount limits (role `max_discount_percent`)
4. Compute line discounts → cart discount (pro-rata) → tax → totals with `decimal.js`
5. Validate payments: sum ≥ total for non-credit; credit requires customer, `sales.credit`, and `balance + credit ≤ credit_limit`
6. Next invoice number: `INSERT … ON CONFLICT DO UPDATE SET last_value = last_value + 1 RETURNING` on `document_sequences` (gap-free per branch/year, e.g. `NDJ-2026-000001`)
7. Insert sale, items, payments
8. For each tracked item: `UPDATE inventory SET quantity = quantity - q WHERE … AND quantity >= q` (fails → `INSUFFICIENT_STOCK`, whole transaction rolls back) + movement row
9. Credit → customer ledger entry + balance; cash → `cash_movements` row (net of change)
10. Audit log; commit; post-commit: low-stock / large-discount notifications

### Returns

Partial or full, per sale item, never more than `quantity - returned_quantity`. Creates `returns`/`return_items`, refund `payments` (direction OUT), restocks (`RETURN` movement) or writes off (`DAMAGE`) per product `return_to_stock`, reduces customer balance for credit sales, updates sale status to `PARTIALLY_REFUNDED`/`REFUNDED`. The original sale is never altered except status and counters.

### Offline POS

- Product catalog + categories cached in IndexedDB (`idb`), refreshed incrementally by `updatedAt`.
- When offline, completed sales go to an IndexedDB outbox with a client UUID (`client_ref`) and a provisional receipt number.
- `SyncService` drains the outbox in order when back online; the server treats `client_ref` as an idempotency key, so a retried sync never creates a duplicate sale. Conflicts (e.g. stock insufficient) are kept in the outbox, flagged, and surfaced to the manager instead of being silently dropped.

### Payment providers

`PaymentProvider` interface (`initiate`, `getStatus`, `refund`) with a registry keyed by `payment_methods.provider`. Ships with `ManualProvider` (cashier confirms reference). Airtel Money / Moov Money adapters plug in later without touching the sale service.

### Printing

Receipts render as HTML (80 mm thermal and A4 invoice templates) and print through the browser. A `ReceiptRenderer` abstraction keeps an ESC/POS renderer possible later (raw bytes via a local print bridge).

## 5. Roles

SUPER_ADMIN, ADMIN, MANAGER, CASHIER, STOCK_MANAGER, PURCHASING, ACCOUNTANT, AUDITOR with ~50 granular permissions (`server/src/config/permissions.ts`). Discount ceilings per role: cashier 5 %, manager 30 %, admin 100 %; above the limit requires `sales.discount_override`.

## 6. Roadmap

| Phase | Scope | Exit criteria |
|---|---|---|
| 1 | Monorepo, env config, Prisma schema + migration, auth (login/refresh/logout/password change/reset architecture), RBAC middleware, branch scoping, error format, audit, app layout (sidebar, header, theme, i18n FR/AR/EN + RTL) | login works end-to-end, tests + build green |
| 2 | Products (variants, barcodes, prices, images placeholder, barcode generation), categories, brands, units, taxes, customers | CRUD with permissions, paginated tables |
| 3 | POS screen (3-column / tablet drawer / mobile views), search + keyboard nav, barcode scanner, quick products, cart, discounts, customer picker, split payments, change calc, hold/resume, sale transaction, 80 mm receipt + A4 invoice | full demo flow login → receipt |
| 4 | Inventory, adjustments, movements, transfers workflow, purchase orders, receiving, suppliers + ledger | stock always reconciles with movements |
| 5 | Cash register sessions, cash in/out, expenses, returns/refunds, credit payments | closing shows expected vs counted |
| 6 | Dashboard, 19 reports with PDF/Excel/CSV export, audit log viewer, notifications | |
| 7 | Security hardening, tests (incl. failed sale leaves stock untouched), offline sync, Docker, Nginx, backups, README | `docker compose up -d` runs the whole stack |

## 7. Conflicts / open points

- No existing code → no conflicts.
- The reference screenshot was not attached; the design follows the written layout spec with an original blue/green identity.
- Mobile Money provider APIs are not integrated (no credentials); the provider interface and a manual provider ship instead, as requested.
- Email (receipts, password reset) is architected but has no SMTP provider configured; reset tokens are logged in development.
