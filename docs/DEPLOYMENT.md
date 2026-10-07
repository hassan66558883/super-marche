# Deploying TECHNOVA POS

One Linux server per company (in a shop back office, or a VPS) runs everything; the tills are browsers on the same
network or on the internet. Recommended: 2 vCPU, 4 GB RAM, 40 GB SSD, Ubuntu 24.04 or Debian 12, Docker Engine 26+
with the Compose plugin.

```
Tills (browser) ──HTTPS 443──▶ web: Nginx (TLS, static app, rate limits) ──▶ api: Node (Express, Prisma)
                                                                               │  internal network only
                                                                               ▼
                                                                         db: PostgreSQL 16 ◀── backup (daily pg_dump)
```

The database has no published port and sits on an internal Docker network; only Nginx is reachable from outside.

## 1. First installation

```bash
git clone <your repository> technova-pos && cd technova-pos
cp .env.example .env
chmod 600 .env
```

Edit `.env`:

| Setting | Value |
|---|---|
| `SERVER_NAME` | The address the tills use, e.g. `pos.mon-supermarche.td` (or the server's LAN name) |
| `POSTGRES_PASSWORD` | `openssl rand -hex 24` |
| `JWT_ACCESS_SECRET` | `openssl rand -base64 48` |
| `BOOTSTRAP_ADMIN_PASSWORD` | Temporary password for the first administrator (at least 8 characters, a letter and a digit) |
| `BOOTSTRAP_COMPANY_NAME`, `BOOTSTRAP_BRANCH_*` | Company name and head office |
| `BACKUP_DIR` | Where daily backups are written on the host |

The API refuses to start with a placeholder secret, a secret shorter than 32 characters, or insecure cookies.

```bash
docker compose up -d --build
docker compose ps                                     # db, api and web should become "healthy"
docker compose exec api node dist/cli/bootstrap.js    # creates roles, settings, head office and the administrator
```

Sign in at `https://<SERVER_NAME>` as `superadmin`, change the password (avatar menu → profile), then delete
`BOOTSTRAP_ADMIN_PASSWORD` from `.env`. Running the bootstrap again is safe: it never changes an existing password or
existing settings, and it restores missing permissions after an upgrade.

Then, in the app:

1. **Paramètres → Entreprise**: legal name, NIF/RCCM, address, logo.
2. **Paramètres → Agences**: branches and their registers.
3. **Paramètres → Taxes, Modes de paiement, Ticket, Facture**: check the defaults (TVA 18%, FCFA without decimals).
4. **Utilisateurs**: create accounts for managers and cashiers, assign roles and branches.
5. **Produits**: import or create the catalog, then set opening stock with an inventory adjustment.

## 2. HTTPS certificate

Nginx reads `fullchain.pem` and `privkey.pem` from `CERTS_DIR` (default `./nginx/certs`). If the folder is empty, the
web container generates a temporary self-signed certificate so the site starts.

The tills must trust the certificate: browsers refuse to install the offline service worker on an untrusted
certificate, so **offline mode only works with a trusted certificate**.

- **Server reachable from the internet** (public DNS name): use Let's Encrypt, for example with certbot on the host:
  ```bash
  docker compose stop web
  sudo certbot certonly --standalone -d pos.mon-supermarche.td
  sudo cp /etc/letsencrypt/live/pos.mon-supermarche.td/{fullchain,privkey}.pem nginx/certs/
  docker compose start web
  ```
  Renew with a monthly cron job that stops `web`, runs `certbot renew`, copies the files and starts `web` again.
- **Shop network only**: create a small local certificate authority (for example with `mkcert`), issue a certificate for
  the server's name, put it in `nginx/certs/`, and install the authority's root certificate on each till.

When certificates are always mounted, set `SELF_SIGNED_CERT=0` so the web image does not need to install OpenSSL.

## 3. Updating

```bash
./scripts/backup-now.sh            # always back up first
git pull
docker compose up -d --build       # migrations are applied automatically by the api container
docker compose exec api node dist/cli/bootstrap.js   # adds any new permissions
```

Migrations only add tables, columns and indexes; they never drop data. To disable automatic migrations, set
`RUN_MIGRATIONS=false` in `.env` and run `docker compose exec api npx prisma migrate deploy` yourself.

The tills pick up the new version on their next page load (the service worker and `index.html` are never cached).

## 4. Backups and restore

The `backup` service takes a compressed, verified `pg_dump` every day at `BACKUP_HOUR` (business time zone) and keeps
`BACKUP_KEEP_DAYS` days in `BACKUP_DIR`. A backup on the same disk does not protect against disk loss or theft: copy
`BACKUP_DIR` elsewhere every day (external disk, another site, encrypted cloud storage).

```bash
docker compose logs backup         # "Backup OK" lines
./scripts/backup-now.sh            # manual backup into ./backups
./scripts/restore.sh backups/technova-20261007-020000.dump
```

`restore.sh` restores into a **new** database (`technova_restore_<date>`) and prints its sales count; the live database
is never dropped or overwritten. To switch to the restored copy, set `POSTGRES_DB=<new name>` in `.env` and run
`docker compose up -d api backup`. Test a restore every few months.

## 5. Operations

| Task | Command |
|---|---|
| Status | `docker compose ps` |
| Logs | `docker compose logs -f api` (JSON; passwords, tokens and cookies are redacted) |
| Restart | `docker compose restart api web` |
| Stop / start | `docker compose down` / `docker compose up -d` (data stays in the `pgdata` volume) |
| Database shell | `docker compose exec db psql -U technova technova` |

Never run `docker compose down -v`: `-v` deletes the database volume.

## 6. Network printers and tills

- **Thermal printers (ESC/POS over TCP 9100)**: give each printer a fixed IP and enter it in Paramètres → Imprimante for
  its branch. The API container must be able to reach that IP (same LAN, or VPN for a hosted server).
- **Barcode scanners** act as keyboards; nothing to install.
- **Tills**: Chrome or Edge, full screen. For silent receipt printing with browser printing, start Chrome with
  `--kiosk-printing`.

## 7. Building images behind a restricted network

The Dockerfiles install OpenSSL with `apt-get`/`apk` only when the base image lacks it. Where package mirrors are
blocked, build with `NODE_IMAGE=node:22-bookworm` (ships OpenSSL) and `SELF_SIGNED_CERT=0` (certificates mounted), and
point `NODE_IMAGE` at an internal registry mirror if Docker Hub is unreachable.
