# TECHNOVA POS — REST API

Base URL: `https://<SERVER_NAME>/api` (development: `http://localhost:4000/api`). All bodies are JSON.

## Conventions

**Success**

```json
{ "success": true, "data": { ... }, "meta": { "page": 1, "pageSize": 25, "total": 240, "totalPages": 10 } }
```

`meta` is present on paginated lists only. Money and quantities are **strings** (`"6500"`, `"1.5"`), never floats;
dates are ISO 8601 UTC. Password and token hashes are stripped from every payload.

**Errors**

```json
{ "success": false, "message": "Données invalides", "code": "VALIDATION_ERROR", "details": [{ "path": "identifier", "message": "Required" }] }
```

Clients should branch on `code`; `message` is translated text for display. Common codes:

| Status | Code | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Body or query failed validation (`details` lists the fields) |
| 401 | `UNAUTHORIZED`, `TOKEN_EXPIRED` | Missing or expired access token: call `/auth/refresh` |
| 401 | `REFRESH_RACE` | Two tabs refreshed at once: retry once after a short delay |
| 403 | `FORBIDDEN` | Missing permission, or branch not assigned to the user |
| 404 | `NOT_FOUND` | |
| 400 | business codes | e.g. `CASH_REQUIRED`, and `OFFLINE_CREDIT`, `OFFLINE_DATE_INVALID` for a refused offline sale (see Sales) |
| 409 | business codes | Conflicting state, e.g. `REGISTER_CLOSED` |
| 422 | business codes | Rule violated, e.g. `INSUFFICIENT_STOCK` |
| 423 | `ACCOUNT_LOCKED` | Too many failed sign-ins |
| 429 | `RATE_LIMITED` | Too many requests (Nginx also returns 429) |
| 502 | `PRINTER_UNREACHABLE` | ESC/POS printer did not answer |

**Lists** accept `page` (default 1), `pageSize` (default 25, max 200), `search`, `sort` (whitelisted per resource)
and `order` (`asc`/`desc`). Date filters use `from` and `to` as `YYYY-MM-DD`, inclusive, in the business time zone.

**Branch.** Branch-scoped endpoints read the active branch from the `X-Branch-Id` header. The server checks it against
the user's assigned branches (or the `branches.all` permission); without the header the user's default branch is used.

## Authentication

Access tokens are short-lived JWTs sent as `Authorization: Bearer <token>`. The refresh token is an opaque value in an
`HttpOnly; Secure; SameSite=Strict` cookie scoped to `/api/auth`, rotated on every refresh; reusing an old one revokes
the whole session (except within a 10-second window, which returns `REFRESH_RACE`).

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/login` | `{ identifier, password, rememberMe? }` → `{ accessToken, user }` + refresh cookie. `identifier` is a username or email |
| POST | `/auth/refresh` | Uses the cookie → new `accessToken` |
| POST | `/auth/logout` | Revokes the current session |
| POST | `/auth/forgot-password`, `/auth/reset-password` | Single-use token valid 30 minutes; the response never reveals whether an account exists. No email or SMS provider is wired yet, so in production an administrator resets passwords from Users |
| GET | `/auth/me` | Profile, roles, permissions, branches |
| PATCH | `/auth/me/preferences` | Language, theme |
| POST | `/auth/change-password` | `{ currentPassword, newPassword }`; signs out other sessions |
| GET / DELETE | `/auth/sessions`, `/auth/sessions/:id` | List and revoke own sessions |

## Endpoints

Permissions are shown in brackets. "any of" means one of the listed permissions is enough.

### Catalog

| Method | Path | Permission |
|---|---|---|
| GET | `/products` (filters: `categoryId`, `brandId`, `status`, `quick`, `stock=low\|out\|in`) | products.view |
| GET | `/products/:id`, `/products/code/:code` (SKU or barcode) | products.view |
| POST / PUT / DELETE | `/products`, `/products/:id` (delete archives, never erases history) | products.create / edit / delete |
| GET | `/products/next-sku`, `/products/generate-barcode` | products.create |
| GET | `/products/pos?q=` | sales.create — fast POS search with branch stock |
| GET | `/products/pos/catalog` | sales.create — whole active catalog of the branch for offline use (`{ syncedAt, items }`, no cost prices) |
| GET, POST, PUT, DELETE | `/categories`, `/brands`, `/units` | read: signed in; write: categories.manage |
| GET, POST, PUT | `/taxes` | write: settings.manage |

### Customers and suppliers

| Method | Path | Permission |
|---|---|---|
| GET | `/customers`, `/customers/:id`, `/customers/:id/ledger`, `/customers/:id/invoices` | customers.view |
| POST / PUT | `/customers`, `/customers/:id` | customers.create / edit |
| POST | `/customers/:id/payments` | customers.payment — allocates to the oldest unpaid invoices |
| GET | `/suppliers`, `/suppliers/:id`, `/suppliers/:id/ledger`, `/suppliers/:id/purchases` | suppliers.view |
| POST / PUT | `/suppliers`, `/suppliers/:id`, `/suppliers/:id/payments` | suppliers.manage |

### Sales

| Method | Path | Permission |
|---|---|---|
| GET | `/sales` (filters: `status`, `paymentStatus`, `cashierId`, `customerId`, `unpaid`, `overdue`, `registerSessionId`) | sales.view |
| GET | `/sales/:id`, `/sales/invoice/:number` | sales.view (invoice lookup also sales.return) |
| POST | `/sales` | sales.create |
| POST | `/sales/:id/cancel` `{ reason }` | sales.cancel — reverses stock and payments; the sale stays in history |
| POST | `/sales/:id/returns` | sales.return |
| GET | `/returns`, `/returns/:id` | sales.return or sales.view |
| GET, POST | `/held-sales`, `/held-sales/:id/resume` | signed in |
| GET | `/payment-methods` | signed in (active methods) |

`POST /sales` body:

```json
{
  "clientRef": "a1b2c3d4-…",
  "customerId": null,
  "items": [{ "productId": "…", "variantId": null, "quantity": 2, "discountType": "PERCENT", "discountValue": 5 }],
  "cartDiscount": { "type": "FIXED", "value": 500 },
  "payments": [{ "method": "CASH", "amount": 10000 }, { "method": "AIRTEL_MONEY", "amount": 3000, "reference": "TX123" }],
  "priceList": "RETAIL",
  "dueDate": null,
  "note": null,
  "offlineCreatedAt": null
}
```

The server recomputes prices, discounts, taxes and change; client totals are ignored. `unitPrice` and `taxId` on a line
need `sales.price_override`; discounts above the role's limit are refused. A register session must be open for the
cashier. `clientRef` makes the call idempotent: sending the same sale twice returns the first one.
With `offlineCreatedAt` (offline sync) the sale may push stock negative, cannot use customer credit, and the date must be
within the last 7 days.

### Cash registers

| Method | Path | Permission |
|---|---|---|
| GET | `/cash/registers`, `/cash/sessions`, `/cash/sessions/:id` (Z report summary) | any of cash.operate, cash.view |
| GET | `/cash/current` | any of cash.operate, sales.create |
| POST | `/cash/open` `{ registerId, amount }` (opening float) | cash.operate |
| POST | `/cash/sessions/:id/cash-in`, `/cash-out` `{ amount, note }`, `/close` `{ amount, note }` (counted cash) | any of cash.operate, cash.manage |

### Stock

| Method | Path | Permission |
|---|---|---|
| GET | `/inventory/summary`, `/inventory/movements` | inventory.view |
| POST | `/inventory/adjust` | inventory.adjust — writes a movement with a reason |
| GET | `/transfers`, `/transfers/:id` | transfers.view |
| POST / PUT | `/transfers`, `/transfers/:id` | transfers.create |
| POST | `/transfers/:id/approve`, `/ship` | transfers.approve |
| POST | `/transfers/:id/receive` | transfers.receive |
| POST | `/transfers/:id/cancel` | any of transfers.create, transfers.approve |
| GET | `/purchases`, `/purchases/:id` | purchases.view |
| POST / PUT | `/purchases`, `/purchases/:id`, `/purchases/:id/submit` | purchases.create |
| POST | `/purchases/:id/approve` | purchases.approve |
| POST | `/purchases/:id/receive` (partial receptions allowed) | purchases.receive |
| POST | `/purchases/:id/cancel` | any of purchases.create, purchases.approve |

### Expenses

| Method | Path | Permission |
|---|---|---|
| GET | `/expenses`, `/expenses/:id` | expenses.view |
| POST | `/expenses` | expenses.create |
| POST | `/expenses/:id/void` `{ reason }` | expenses.void — voided, never deleted |
| GET / POST / PUT | `/expenses/categories` | read: expenses.view or expenses.create; write: settings.manage |

### Reports and dashboard

| Method | Path | Permission |
|---|---|---|
| GET | `/dashboard` | dashboard.view |
| GET | `/reports` | reports.view — list of available reports and their filters |
| GET | `/reports/:type?from=&to=&branchId=…` | reports.view |
| GET | `/reports/:type/export?format=pdf\|xlsx\|csv` | reports.export — every export is written to the audit log |

Report types include `daily-sales`, `monthly-sales`, `sales-by-cashier`, `sales-by-branch`, `sales-by-product`, `sales-by-category`, `profit`, `tax`,
`payment-methods`, `customer-balances`, `supplier-balances`, `inventory-valuation`, `stock-movement`, `low-stock`,
`out-of-stock`, `purchases`, `returns`, `expenses`, `cash-register`. Cost and profit columns require the
corresponding permission.

### Administration

| Method | Path | Permission |
|---|---|---|
| GET | `/users`, `/users/:id` | users.view |
| POST / PUT | `/users`, `/users/:id` | users.create / users.edit |
| POST | `/users/:id/status` (disable, enable, unlock) | users.delete |
| POST | `/users/:id/password` (admin reset; signs the user out everywhere) | users.edit |
| GET | `/roles`, `/roles/permissions` | any of users.view, roles.manage |
| POST / PUT / DELETE | `/roles`, `/roles/:id` (system roles cannot be deleted) | roles.manage |
| GET | `/audit`, `/audit/meta` | audit.view — read-only; the table rejects UPDATE and DELETE at database level |
| GET | `/branches` | signed in (the user's branches) |
| GET | `/branches/manage` | any of branches.manage, settings.manage |
| POST / PUT | `/branches`, `/branches/:id`, `/branches/:id/registers`, `/branches/:id/registers/:registerId` | branches.manage |
| GET / POST / PUT | `/admin/payment-methods` | settings.manage — at least one active cash method is always kept |
| GET | `/settings` | signed in (merged global + branch settings) |
| PUT | `/settings/:key[?scope=branch]` | settings.manage |
| GET / POST | `/notifications`, `/notifications/:id/read`, `/notifications/read-all` | signed in |
| POST | `/print/escpos` `{ data: <base64> }` | any of sales.create, sales.view, cash.operate, settings.manage — sent only to the printer saved for the branch (max 256 KB) |

### Health

`GET /health` → `{ status: "ok", time }` (no authentication; used by Docker health checks).
