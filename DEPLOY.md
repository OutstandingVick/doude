# Feasibility3D — Deployment guide

This guide covers deploying the **engine** (FastAPI + SQLite) and the **app**
(Next.js) together. Two fully-tested topologies are described:

- **Option A** — a single VPS running everything with `docker compose`.
- **Option B** — the engine on **Render** (with a persistent disk) and the app
  on **Vercel**.

> **How the browser reaches the engine.** The browser only ever talks to the
> app's own domain. Every API call goes to `/api/*` on the app, and Next.js
> proxies it (a rewrite in `app/next.config.ts`) to `ENGINE_URL`, a
> **server-side** variable the browser never sees. Because the API is
> same-origin, the session cookie is first-party (`SameSite=Lax`, `Secure`),
> which Safari/iOS accept, and no CORS setup is needed. `ENGINE_URL` is read
> when the app is **built**, so set it before building/deploying.

> **Read this first — one worker.** The engine's audit log is a hash chain and
> is protected by a **process-wide** write lock (`engine/db.py:_WRITE_LOCK`).
> That lock only serialises writers *inside a single process*. If the engine
> runs with more than one uvicorn worker, each worker has its own lock and two
> workers can interleave their read-then-insert on the audit chain, silently
> corrupting it. **Always run the engine with exactly one worker.** The
> provided `Dockerfile.engine` and `docker-compose.yml` do this for you — do
> not add `--workers N` or a `WEB_CONCURRENCY`-style setting.

---

## Requirements

- **Option A (VPS):** a Linux VPS (2 GB RAM is comfortable), Docker Engine
  20.10+ with the Compose plugin (`docker compose`), and a domain (optional,
  recommended for HTTPS).
- **Option B (Render + Vercel):** a Render account (web service + persistent
  disk) and a Vercel account. No local Docker needed.
- A generated admin password and a long random `COOKIE_SECRET`
  (`openssl rand -hex 32`).

The repository is self-contained: the engine image builds the sensor feed
(`data/readings.csv`) at build time from `scenario.json`, so you do not need to
generate data separately.

---

## Option A — single VPS with docker compose

### 1. Install Docker (Ubuntu/Debian)

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER   # log out and back in
```

### 2. Clone and configure

```bash
git clone https://github.com/OutstandingVick/feasibility3d.git
cd feasibility3d
cp .env.example .env
```

Edit `.env`:

```dotenv
APP_ENV=production
COOKIE_SECRET=<openssl rand -hex 32>
ADMIN_EMAIL=you@yourorg.example
ADMIN_PASSWORD=<a strong password>
COOKIE_SECURE=true
```

- `APP_ENV=production` makes the engine **refuse to start** if
  `COOKIE_SECRET` or `ADMIN_PASSWORD` is missing. Open mode (no login) is only
  allowed with `APP_ENV=development`.
- `ENGINE_URL` is set by the compose file to `http://engine:8000` (the
  internal hostname). The engine has no public port; the browser reaches it
  only via the app's `/api` proxy.

### 3. (Recommended) HTTPS with a reverse proxy

The simplest way to serve both on one domain over HTTPS is **Caddy**. Add it to
`docker-compose.yml` as a third service (it auto-provisions TLS certificates):

```yaml
  proxy:
    image: caddy:2
    container_name: feasibility3d-proxy
    ports:
      - "80:80"
      - "443:443"
    environment:
      CADDR: your-domain.example
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
    depends_on:
      - app
      - engine

volumes:
  data:
  caddy_data:
```

And a `Caddyfile` at the repo root (the app itself proxies `/api/*` to the
engine, so Caddy only needs to front the app):

```
your-domain.example {
    reverse_proxy app:3000
}
```

Then remove the direct `ports` from the `app` service (it is only reached
through Caddy).

> HTTPS is required: the cookie is `Secure`, and service workers (installable
> PWA) only run on HTTPS. For a quick plain-http trial on `localhost` set
> `COOKIE_SECURE=false`.

### 4. Start

```bash
docker compose up -d --build
docker compose logs -f engine   # watch for "Bootstrapped first admin account"
```

### 5. Open it

Go to `https://your-domain.example` → you are redirected to `/login`. Sign in
with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

---

## Option B — Render (engine + disk) + Vercel (app)

### 1. Engine on Render

1. Render → **New → Web Service** → point at the repo.
2. **Root Directory:** `engine`
3. **Build Command:** `pip install -r requirements.txt`
4. **Start Command:** `uvicorn engine.main:app --host 0.0.0.0 --port $PORT`
   (Render sets `$PORT`; this is a single worker — do not add `--workers`.)
5. **Add a Persistent Disk** and mount it at `/data`.
6. Set environment variables:

   | Variable | Value |
   |---|---|
   | `FEASIBILITY3D_DB` | `/data/feasibility3d.db` |
   | `FEASIBILITY3D_EVIDENCE` | `/data/evidence` |
   | `FEASIBILITY3D_REPORTS` | `/data/reports` |
   | `FEASIBILITY3D_READINGS` | `/opt/render/src/data/readings.csv` (or generate at build) |
   | `APP_ENV` | `production` |
   | `COOKIE_SECRET` | `<openssl rand -hex 32>` |
   | `ADMIN_EMAIL` | `you@yourorg.example` |
   | `ADMIN_PASSWORD` | `<strong password>` |
   | `COOKIE_SECURE` | `true` |

   The browser never calls Render directly: Vercel proxies `/api/*` to it, so
   the cookie is set on the Vercel domain (first-party, `SameSite=Lax`).

   > Render's free tier spins down; use a paid instance (or a "spinning"
   > setting) so the engine stays up. The persistent disk keeps the DB and
   > evidence across deploys.

### 2. App on Vercel

1. Vercel → **New Project** → import the repo.
2. **Root Directory:** `app`
3. Framework preset: **Next.js**.
4. Set the environment variable (server-side; not exposed to the browser):
   - `ENGINE_URL` = `https://<your-engine>.onrender.com`
5. Deploy.

The `/api` rewrite is resolved at build time, so after changing `ENGINE_URL`
in **Project → Settings → Environment Variables**, **redeploy**.

---

## Creating the first admin

On a **fresh database**, the engine creates the first admin at startup from
`ADMIN_EMAIL` + `ADMIN_PASSWORD` (see the log line
`Bootstrapped first admin account: …`). This is idempotent: once any user
exists, those variables are ignored and restarts never overwrite or duplicate
the admin.

- **To change the first admin before the DB exists:** set the env vars, then
  start the engine once against an empty DB.
- **To create additional users later** (not covered by bootstrap): insert into
  the `users` table with a PBKDF2 hash, e.g.
  ```bash
  docker compose exec engine python -c "from engine import db, auth; c=db.connect(); print(db.create_user(c,'ops@org.example','secret','regulator'))"
  ```
  (For Render, run the same in a shell on the instance.)

## HTTPS and cookies

- **HTTPS** is mandatory in production: the session cookie is `Secure` and the
  service worker (offline/installable app) needs a secure origin. Option A uses
  Caddy's automatic TLS; Render and Vercel provide TLS for free.
- **Same origin, no CORS:** the browser calls `/api/*` on the app's domain and
  Next proxies to `ENGINE_URL`. The engine's `CORS_ORIGINS` setting is no longer
  needed for the app.
- **Cookie:** `feasibility3d_session`, `HttpOnly`, `Path=/`, `SameSite=Lax`,
  `Secure` (set `COOKIE_SECURE=false` only for plain-http local testing).
- **Production safety:** with `APP_ENV=production` the engine exits at startup
  with `Refusing to start: … COOKIE_SECRET … not set` (or `ADMIN_PASSWORD`).
  Without `COOKIE_SECRET` it also refuses unless `APP_ENV=development`.

## Backups

Everything persistent lives in one place:

- **Option A:** the `data` Docker volume (DB, evidence, generated reports).
- **Option B:** the Render persistent disk mounted at `/data`.

Back it up with:

```bash
# Option A — dump the volume to a timestamped tar on the host
docker run --rm -v feasibility3d_data:/data -v "$PWD":/backup alpine \
  tar czf /backup/feasibility3d-backup-$(date +%Y%m%d-%H%M).tar.gz -C /data .

# Option B — on the Render instance (or via its disk snapshot feature)
tar czf /tmp/feasibility3d-backup.tar.gz -C /data .
```

The SQLite DB is the most important file (`feasibility3d.db`); the `evidence/`
and `reports/` folders hold uploaded files and generated PDFs. Render also
offers **disk snapshots** you can take from the dashboard.

## Updating

- **Option A:**
  ```bash
  git pull
  docker compose up -d --build
  ```
  The `data` volume is preserved, so the DB and evidence survive the update.
- **Option B:** push to `main` (or redeploy) on Render and Vercel. The
  persistent disk keeps the data.

After any engine update, confirm the audit chain is still valid:
`GET /audit/verify` → `{"ok": true, …}`.

---

## Post-deploy checklist

Run these against the live deployment (substitute your URL). All should pass.

1. **Health check** — engine responds and reports auth is on:
   ```bash
   curl https://your-domain.example/api/health
   # → {"status":"ok","method_version":"feasibility3d-method v0.1","auth_enabled":true}
   ```
2. **Login** — sign in with the first admin:
   ```bash
   curl -i -c /tmp/cj -X POST https://your-domain.example/api/login \
     -H 'Content-Type: application/json' \
     -d '{"email":"you@yourorg.example","password":"<password>"}'
   # → 200, Set-Cookie: feasibility3d_session=…
   ```
   In the browser: open the app URL → you land on `/login` → sign in → dashboard.
3. **Run an analysis** — records a spill and appends to the audit log:
   ```bash
   curl -b /tmp/cj -X POST https://your-domain.example/api/analyze -o /dev/null -w "%{http_code}\n"
   # → 200
   ```
4. **Verify** — the report is repeatable:
   ```bash
   curl -b /tmp/cj https://your-domain.example/api/verify
   # → {"repeatable": true, "report_hash": "sha256:…"}
   ```
   And the audit chain is intact:
   ```bash
   curl -b /tmp/cj https://your-domain.example/api/audit/verify
   # → {"ok": true, "entries": N, "broken_at": null}
   ```
5. **Download a report** — the PDF endpoint streams a real PDF:
   ```bash
   curl -b /tmp/cj -o /tmp/report.pdf -w "%{http_code} %{content_type}\n" \
     https://your-domain.example/api/report.pdf
   # → 200 application/pdf
   ```

If step 2 fails, check `ENGINE_URL` was set when the app was built (a 404 or
502 on `/api/health` means the proxy can't reach the engine) and that the site
is served over HTTPS (the cookie is `Secure`). See "HTTPS and cookies".
