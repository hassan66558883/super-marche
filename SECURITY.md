# Security

This file describes how TECHNOVA POS protects accounts and financial data, what the October 2026 security review
changed, and the risks that remain for the operator to manage.

Report a vulnerability privately to the project owner, not in a public issue.

## Controls in place

**Accounts and sessions**
- Passwords hashed with Argon2id (19 MiB memory, 2 passes). Minimum 8 characters with a letter and a digit.
- Sign-in by username or email. Accounts lock after `LOGIN_MAX_ATTEMPTS` failures for `LOGIN_LOCK_MINUTES`; sign-in and
  password-reset routes are rate limited in the API and again in Nginx (10 per minute per IP, burst 5).
- Access token: JWT valid 15 minutes, kept in memory only (never in localStorage).
- Refresh token: random opaque value, stored only as a SHA-256 hash, sent in an `HttpOnly; Secure; SameSite=Strict`
  cookie limited to `/api/auth`, rotated on every use. Reusing an old token revokes the session (theft detection),
  except inside a 10-second window that covers two tabs refreshing at once.
- Changing a password signs out the user's other sessions; an administrator reset or a password-reset link signs out
  all of them. Users can see and revoke their own sessions.
- Password-reset tokens are single-use, hashed, valid 30 minutes, and the endpoint answers the same way whether or not
  the account exists.

**Authorization**
- Role-based permissions checked on the server for every route; the UI only hides what the user cannot do.
- Branch isolation: the `X-Branch-Id` header is checked against the user's assigned branches.
- No privilege escalation: a user can only grant roles and permissions they hold themselves; the super administrator
  role cannot be edited, and users cannot disable, demote or delete themselves.
- Discounts above the role's limit, price overrides and cost or profit figures each need their own permission.

**Financial data**
- Sales, sale lines, payments, returns, cash sessions and expenses cannot be deleted, and stock movements, cash
  movements, customer and supplier ledgers and the audit log cannot be modified or deleted. PostgreSQL triggers enforce
  this, so it holds even against direct SQL. Corrections are cancellations, voids and reversing entries.
- All totals, taxes, discounts, stock and invoice numbers are recomputed by the server in one database transaction.
- Money is stored as `NUMERIC`, never floating point.
- Every sensitive action (sign-in, user and role changes, cancellations, adjustments, exports, settings) is written to
  the audit log with user, branch, IP address, device and details of the change.

**Application and transport**
- All input validated with Zod; Prisma parameterizes every query; sort fields are whitelisted.
- Password hashes and token hashes are stripped from every API response; logs redact passwords, tokens and cookies.
- Helmet headers on the API. Nginx adds HSTS, a strict Content-Security-Policy (`script-src 'self'`, no inline script),
  `X-Frame-Options: DENY`, `nosniff` and a referrer policy; TLS 1.2 and 1.3 only; HTTP redirects to HTTPS.
- The database is on an internal Docker network with no published port. Containers run as non-root users.
- The API refuses to start in production with a missing, short or placeholder JWT secret, or without secure cookies.
- No credentials in the code: everything comes from `.env`, which is git-ignored. Demo accounts exist only in the
  development seed, which refuses to run in production.
- The ESC/POS print endpoint only connects to the printer address saved in the branch settings, with a size limit and
  timeout, so it cannot be used to reach arbitrary hosts.

## Changes from the security review

| Finding | Fix |
|---|---|
| Production could start with `COOKIE_SECURE=false` | Refused unless `ALLOW_INSECURE_COOKIES=true` (closed LAN only) |
| Placeholder JWT secrets such as `CHANGE_ME` were not detected | Production refuses secrets matching common placeholders |
| Request logs could include cookies and tokens | Logger redacts `Authorization`, cookies, tokens and password fields |
| Company logo accepted any URL scheme | Limited to `http(s)` or inline PNG, JPEG, WebP or SVG images, max 300 KB |
| Two tabs refreshing together looked like token theft and logged the user out | 10-second grace window returning `REFRESH_RACE`; the client retries once |
| Inline theme script would require `'unsafe-inline'` in the CSP | Moved to `/theme-init.js` |
| Security headers were lost on locations that set their own headers in Nginx | Headers included in every such location |
| Vulnerable transitive dependencies (`uuid` via exceljs, `deepmerge-ts` via Prisma) | Overridden to fixed versions; `npm audit` reports 0 vulnerabilities |
| Production setup relied on the demo seed | New idempotent `db:bootstrap` takes the first administrator's password from the environment; the seed refuses production |

## Residual risks and operator duties

- **Offline sales** are trusted after the fact: while offline the till cannot check stock or customer credit, so stock
  may go negative and credit is refused offline. Offline sales are limited to 7 days old and marked with their offline
  time for review.
- **Offline sign-in**: a signed-in user's profile is cached on the till for up to 7 days so it keeps working without the
  server; no password or token is stored. Sign out on shared tills and lock the device.
- **Password reset by email or SMS** is not wired to a provider yet. In production, administrators reset passwords from
  the Users screen.
- **Two-factor authentication** is not implemented. Use strong passwords for administrator accounts.
- **Backups** are not encrypted by the application. Store copies off the server on encrypted media and restrict access
  to `BACKUP_DIR` and `.env` (`chmod 600 .env`).
- **Certificates**: use a trusted certificate (Let's Encrypt or a local authority). A self-signed certificate works for
  a first start, but tills then cannot use offline mode and users learn to click through warnings.
- Keep the server patched, pull updates regularly, run `npm audit` before releases, and review the audit log.
