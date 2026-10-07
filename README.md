# TECHNOVA POS

*Smart Sales. Smart Stock. Smart Business.*

Point-of-sale and retail management for supermarkets and shops, multi-branch.
Defaults: Chad, currency XAF (FCFA), French first, plus Arabic (right-to-left) and English.

- **Point of sale**: barcode scanning, quick products, held sales, discounts within role limits, split payments
  (cash, card, Airtel Money, Moov Money, transfer, customer credit), returns, 80 mm receipts and A4 invoices,
  direct ESC/POS printing to a network thermal printer.
- **Works offline**: the till keeps selling when the network or the server is down and sends the sales when it comes back.
- **Stock**: per-branch inventory, every change recorded as a movement, adjustments, transfers between branches,
  purchase orders and receptions, low-stock alerts.
- **Money**: cash sessions with opening float, cash in/out, Z report and counted-vs-expected close; customer and
  supplier ledgers; expenses.
- **Reports**: sales, profit, tax, payment methods, stock valuation and movements, purchases, returns, expenses,
  cash registers. Export to PDF, Excel and CSV.
- **Administration**: users, roles with a permission matrix, branches and registers, settings, read-only audit log.

| Part | Stack |
|---|---|
| `client/` | React 18, TypeScript, Vite, Tailwind, shadcn/ui, TanStack Query and Table, Zustand, React Hook Form, Recharts, i18next |
| `server/` | Node 22, Express, TypeScript, Prisma, PostgreSQL 16, JWT + rotating refresh cookie, Argon2id, Zod |
| Deployment | Docker Compose, Nginx (HTTPS, HSTS, CSP, rate limits), daily verified backups |

More detail: [Architecture](docs/ARCHITECTURE.md) · [API](docs/API.md) · [Deployment](docs/DEPLOYMENT.md) · [Security](SECURITY.md)

---

## Install on a server (production)

Short version; the full guide with certificates, updates and restore is in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

```bash
cp .env.example .env
# Edit .env: SERVER_NAME, POSTGRES_PASSWORD, JWT_ACCESS_SECRET (openssl rand -base64 48),
# BOOTSTRAP_ADMIN_PASSWORD, company and head-office names
docker compose up -d --build                         # database migrations run automatically
docker compose exec api node dist/cli/bootstrap.js   # first run only: roles, settings, head office, admin
```

Open `https://<SERVER_NAME>`, sign in as `superadmin` with the password from `.env`, then change it from your profile
and remove `BOOTSTRAP_ADMIN_PASSWORD` from `.env`. Configure the company, branches, taxes and printer under **Paramètres**.

The production stack never loads demo data.

## Develop locally

Requirements: Node 22, npm 10, PostgreSQL 16.

```bash
npm install
cp server/.env.example server/.env        # set DATABASE_URL and JWT_ACCESS_SECRET
npm run db:migrate                        # apply migrations
npm run db:seed                           # demo data (refuses to run when NODE_ENV=production)
npm run db:demo-history --workspace server # optional: ~90 days of demo sales for reports
npm run dev                               # API on :4000, web on :5173
```

Demo accounts created by the seed (development only, never in production):

| User | Password | Role |
|---|---|---|
| `admin` | `Admin@2026` | Super administrator |
| `manager` | `Manager@2026` | Branch manager |
| `cashier`, `cashier2` | `Caisse@2026` | Cashier |
| `stock` | `Stock@2026` | Stock keeper |
| `comptable` | `Compta@2026` | Accountant |

### Commands

| Command | What it does |
|---|---|
| `npm run dev` | API (tsx watch) and Vite dev server |
| `npm run build` | Compiles the API to `server/dist` and the client to `client/dist` |
| `npm run lint` / `npm run typecheck` | ESLint and TypeScript for both workspaces |
| `npm test` | Server integration tests (Vitest + Supertest, needs a database) and client unit tests (offline outbox, ESC/POS, translations) |
| `npm run db:migrate` | Applies migrations in development |
| `npm run db:migration:new --workspace server -- --name <name>` | Creates a migration without applying it (see note below) |
| `npm run db:deploy --workspace server` | Applies migrations in production (`prisma migrate deploy`) |
| `npm run db:bootstrap --workspace server` | Production bootstrap (idempotent, see [Deployment](docs/DEPLOYMENT.md)) |

**Writing migrations.** Migrations are additive: never `migrate reset`, never drop a table that holds data.
Some indexes are managed by hand in SQL (the `pg_trgm` search indexes and `inventory_branch_product_variant_key`),
so Prisma proposes to drop them in every new migration. After `db:migration:new`, delete those `DROP INDEX` lines
from the generated `migration.sql` before applying it.

Server tests run against the database in `DATABASE_URL`; use a dedicated test database.

## Offline mode

The point of sale keeps working when the till loses the network or the server stops answering.

- The app shell is cached by a service worker (production build only, served over trusted HTTPS).
- The branch catalog (prices, barcodes, stock) is copied to the browser (IndexedDB) when the POS opens and every 10 minutes.
- Offline sales are numbered locally (`HL-NDJ-0610-3981`), printed as provisional receipts and kept in an outbox.
  They are sent automatically when the server is reachable again (at sign-in, every 30 seconds, and on reconnect).
- The server deduplicates by the sale's client reference, so a sale is never recorded twice. It keeps the original
  offline time in `offlineCreatedAt` and gives the sale its real invoice number.
- Offline, only payment methods without an external provider are allowed (cash, card on a standalone terminal...);
  customer credit is refused because the balance cannot be checked. Stock may go negative for offline sales.
- A sale the server refuses stays in the outbox marked as refused, with its reason; it can be retried or downloaded.
  A register cannot be closed while sales from its branch are still waiting to be sent.
- A signed-in user stays signed in offline for up to 7 days (their profile is cached; nothing is cached for anonymous users).

## Printing

- **Browser printing** (default): 80 mm or 58 mm receipts, A4 invoices and Z reports through the print dialog.
  Use the browser's kiosk printing mode for silent printing.
- **Network thermal printer (ESC/POS)**: in Paramètres → Imprimante, choose ESC/POS and enter the printer's IP and port
  (usually 9100) for the branch. Receipts go through the API to the printer; if it cannot be reached the app falls back
  to the browser dialog. The API only connects to the address saved in the branch settings.

## Backups

The `backup` service writes a compressed `pg_dump` every day at `BACKUP_HOUR` into `BACKUP_DIR`, checks that each file
can be read back, and keeps `BACKUP_KEEP_DAYS` days. Copy that folder off the server (USB disk, another machine or cloud storage).

```bash
./scripts/backup-now.sh                      # manual backup into ./backups
./scripts/restore.sh backups/<file>.dump     # restores into a NEW database; the current one is never dropped
```

## Environment variables

Production settings live in the root `.env` (template: [.env.example](.env.example)); development settings in
`server/.env` (template: [server/.env.example](server/.env.example)).

| Variable | Purpose |
|---|---|
| `SERVER_NAME` | Public host name, used for the certificate and allowed browser origin |
| `POSTGRES_PASSWORD`, `POSTGRES_USER`, `POSTGRES_DB` | Database credentials (password required) |
| `JWT_ACCESS_SECRET` | Signing key for access tokens (required, at least 32 characters; placeholders are refused) |
| `JWT_ACCESS_TTL`, `REFRESH_TTL_HOURS`, `REFRESH_TTL_REMEMBER_DAYS` | Token lifetimes |
| `LOGIN_MAX_ATTEMPTS`, `LOGIN_LOCK_MINUTES` | Account lock after failed sign-ins |
| `COOKIE_SECURE` | Refresh cookie only over HTTPS (production refuses `false` unless `ALLOW_INSECURE_COOKIES=true`) |
| `TRUST_PROXY` | `1` behind Nginx so client IPs and rate limits are correct |
| `CORS_ORIGINS` | Allowed browser origins (comma-separated) |
| `BOOTSTRAP_*` | First administrator, company name and head office used by the bootstrap |
| `BACKUP_DIR`, `BACKUP_HOUR`, `BACKUP_KEEP_DAYS` | Backup folder, time and retention |
| `CERTS_DIR`, `SELF_SIGNED_CERT` | TLS certificate folder; whether the web image may generate a temporary self-signed one |
| `HTTP_PORT`, `HTTPS_PORT`, `TZ`, `NODE_IMAGE` | Published ports, time zone, base Node image for builds |

## License and branding

TECHNOVA POS uses its own name, logo and visual design. Do not ship it with another vendor's branding or assets.
