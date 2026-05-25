# AWS Free Tier setup — hand-holding guide (SchoolTime)

This guide walks you through **year 1** hosting:

| Piece | Where |
|-------|--------|
| Web app | **GitHub Pages** (free) |
| API | **EC2 `t3.micro`** (750 h/mo free tier) |
| Database | **RDS PostgreSQL `db.t3.micro` or `db.t4g.micro`** (750 h/mo + 20 GB) |

**Time:** about 2–3 hours the first time.  
**You need:** AWS account, GitHub repo access, a **domain name** (or free Dynamic DNS) for HTTPS.

> GitHub Pages uses **HTTPS**. The browser will **block** calls to a plain `http://` API. Use **Caddy** on EC2 with either a **custom domain** or free **DuckDNS** (e.g. `https://schooltime-api.duckdns.org/api`) — Part 5 below.

Repo helpers: `infra/aws/`, `scripts/aws/install-api-on-ec2.sh`, `scripts/aws/verify-aws-deploy.mjs`.

---

## Part 0 — Checklist before you start

- [ ] AWS account (new accounts get 12-month Free Tier on eligible services)
- [ ] GitHub repo: `SchoolTime` (you already have this)
- [ ] **API hostname** — paid domain **or** free **DuckDNS** (e.g. `schooltime-api.duckdns.org`) for HTTPS via Caddy
- [ ] **Email for SMTP** (password reset) — Gmail app password, SendGrid, Amazon SES, etc.
- [ ] Strong secrets ready to paste (do not commit):
  - `JWT_SECRET` — 32+ random characters
  - `CREATOR_PORTAL_PASSWORD_HASH` — bcrypt (see Part 5.5)
  - RDS master password

Pick **one region** (e.g. **US East (N. Virginia) `us-east-1`**) and use it for RDS and EC2.

---

## Part 1 — Create RDS PostgreSQL (database)

### 1.1 Open RDS

1. Sign in to [AWS Console](https://console.aws.amazon.com/).
2. Top search bar → type **RDS** → open **RDS**.
3. Confirm region (top right) = **us-east-1** (or your chosen region).

### 1.2 Create database

1. Click **Create database**.
2. **Creation method:** Standard create.
3. **Engine:** PostgreSQL.
4. **Engine version:** 16.x (or latest 15+).
5. **Templates:** **Free tier** (if shown). Otherwise:
   - **Instance class:** **db.t3.micro** or **db.t4g.micro**
   - **Storage:** 20 GiB, gp3
   - **Single-AZ** only (no Multi-AZ)
6. **DB instance identifier:** `schooltime-db`
7. **Master username:** `schooltime`
8. **Master password:** choose a strong password → save in a password manager.
9. **Database name:** `schooltime` (important).
10. **Connectivity:**
    - **VPC:** default VPC is fine
    - **Public access:** **Yes** (simplest for Free Tier + EC2 in default VPC)
    - **VPC security group:** **Create new** → name `schooltime-rds-sg`
    - **Availability Zone:** no preference
11. **Authentication:** Password.
12. **Monitoring:** disable **Performance Insights** (cost).
13. **Backup:** 1–7 days is fine for free tier.
14. Click **Create database**.
15. Wait until **Status** = **Available** (5–15 minutes).

### 1.3 Note the endpoint

1. Click the database **`schooltime-db`**.
2. Under **Connectivity & security**, copy **Endpoint**, e.g.  
   `schooltime-db.xxxxx.us-east-1.rds.amazonaws.com`
3. Build your connection string (save locally, not in git):

```text
postgresql://schooltime:YOUR_PASSWORD@endpoint:5432/postgres
```

This is **`DATABASE_URL`** for the API.

### 1.4 Allow EC2 to reach RDS (temporary; tighten in Part 3)

1. **EC2** console → **Security groups** → open **`schooltime-rds-sg`**.
2. **Inbound rules** → **Edit inbound rules** → **Add rule**:
   - Type: **PostgreSQL**, Port **5432**
   - Source: **Anywhere-IPv4** `0.0.0.0/0` *(temporary for first connect; in Part 3 we restrict to EC2 security group only)*
3. Save.

---

## Part 2 — Create EC2 (API server)

### 2.1 Launch instance

1. **EC2** → **Instances** → **Launch instances**.
2. **Name:** `schooltime-api`
3. **AMI:** **Ubuntu Server 26.04 LTS** (or 22.04 LTS), 64-bit x86
4. **Instance type:** **t3.micro** (should show **Free tier eligible**)
5. **Key pair:** **Create new** → name `schooltime-key` → download **`.pem`** file → store safely.
6. **Network settings:**
   - VPC: same as RDS (default)
   - **Auto-assign public IP:** Enable
   - **Security group:** Create **`schooltime-api-sg`**
   - Allow **SSH (22)** from **My IP**
   - Allow **HTTP (80)** from **0.0.0.0/0**
   - Allow **HTTPS (443)** from **0.0.0.0/0**
   - Add **Custom TCP 8787** from **0.0.0.0/0** *(optional; for testing before Caddy)*
7. **Storage:** 8–30 GiB gp3 (within free tier EBS limits).
8. **Launch instance**.

### 2.2 Elastic IP (recommended)

1. **EC2** → **Elastic IPs** → **Allocate**.
2. **Associate** to instance **`schooltime-api`**.
3. Note the **Elastic IP**, e.g. `3.15.xxx.xxx` — used for DNS.

### 2.3 Point your domain to EC2

In your DNS provider (Cloudflare, Route 53, etc.):

| Type | Name | Value |
|------|------|--------|
| **A** | `api` | Your **Elastic IP** |

Example: `api.yourdomain.com` → `3.15.xxx.xxx`

Wait a few minutes; verify:

```bash
ping api.yourdomain.com
```

---

## Part 3 — Lock down RDS security group

1. **EC2** → **Security groups** → **`schooltime-rds-sg`**.
2. **Edit inbound** — remove `0.0.0.0/0` on 5432 if you added it.
3. **Add rule:** PostgreSQL **5432**, Source = **`schooltime-api-sg`** (security group ID of the API).
4. Only the API server can reach the database.

---

## Part 4 — Connect to EC2 and install the API

### 4.1 SSH (Windows PowerShell)

```powershell
cd path\to\folder\with\schooltime-key.pem
ssh -i schooltime-key.pem ubuntu@YOUR_ELASTIC_IP
```

First time: type `yes` for fingerprint.

### 4.2 Install Docker on Ubuntu

On the EC2 instance:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
exit
```

SSH in again so `docker` works without sudo:

```bash
ssh -i schooltime-key.pem ubuntu@YOUR_ELASTIC_IP
docker --version
```

### 4.3 Clone the repo (or copy files)

**Option A — Git clone (if repo is public):**

```bash
git clone https://github.com/YOUR_USER/SchoolTime.git
cd SchoolTime
```

**Option B — copy from your PC:**

```powershell
# On your Windows machine (from project root)
scp -i schooltime-key.pem -r "C:\Users\...\Time Table" ubuntu@YOUR_ELASTIC_IP:~/SchoolTime
```

### 4.4 Create production env file on EC2

```bash
cd ~/SchoolTime
nano .env
```

Paste (edit every value):

```env
NODE_ENV=production
PORT=8787
HOST=0.0.0.0

DB_CLIENT=postgres
DATABASE_URL=postgresql://schooltime:YOUR_RDS_PASSWORD@YOUR_RDS_ENDPOINT:5432/postgres

JWT_SECRET=your-long-random-secret-at-least-32-chars
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_DAYS=30
RATE_LIMIT_MAX=120

CORS_ORIGIN=https://YOUR_USER.github.io
APP_BASE_URL=https://YOUR_USER.github.io/SchoolTime

CREATOR_PORTAL_PASSWORD_HASH=your-bcrypt-hash

SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
```

Save: `Ctrl+O`, Enter, `Ctrl+X`.

**`CORS_ORIGIN`:** exact GitHub Pages origin, no trailing slash, e.g. `https://rahul-vik.github.io`  
**`APP_BASE_URL`:** full path to the app if using project Pages URL, e.g. `https://rahul-vik.github.io/SchoolTime`

### 4.5 Build and run API container

```bash
cd ~/SchoolTime
docker build -t schooltime-api .
docker run -d --name schooltime-api --restart unless-stopped \
  -p 127.0.0.1:8787:8787 \
  --env-file .env \
  schooltime-api
```

Check logs:

```bash
docker logs -f schooltime-api
```

Look for:

- `[db] using postgres`
- `[tenant_state] startup migration...`
- `API server running on http://0.0.0.0:8787`

Test from the server:

```bash
curl -s http://127.0.0.1:8787/api/health | head
```

From your PC (if port 8787 is open):

```bash
curl -s http://YOUR_ELASTIC_IP:8787/api/health
```

---

## Part 5 — HTTPS with Caddy (required for GitHub Pages)

GitHub Pages is **HTTPS**; the API must be **HTTPS** too.

### 5.1 Install Caddy on EC2

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

### 5.2 HTTPS hostname (no paid domain)

Use **[DuckDNS](https://www.duckdns.org)** (free):

1. Sign in → create subdomain **`schooltime-api`** → `schooltime-api.duckdns.org`
2. Set IP to your EC2 **public IP** (Elastic IP if you use one)
3. EC2 security group: inbound **80** and **443** from `0.0.0.0/0`

With your **own domain**, use `api.yourdomain.com` instead and point an **A** record to the EC2 IP.

### 5.3 Configure Caddy

```bash
sudo nano /etc/caddy/Caddyfile
```

**DuckDNS example** (matches a typical SchoolTime deploy):

```text
schooltime-api.duckdns.org {
    reverse_proxy 127.0.0.1:8787
}
```

Reload:

```bash
sudo systemctl reload caddy
```

Caddy obtains a **Let's Encrypt** certificate automatically (ports 80/443 must be open).

Test:

```bash
curl -s https://schooltime-api.duckdns.org/api/health
```

**RDS note:** Easy Create often sets the database name to **`postgres`**, not `schooltime`. If the API logs `3D000` (database does not exist), fix the path in `DATABASE_URL` or run `CREATE DATABASE schooltime;` from `psql`.

**SSL note:** Do **not** put `?sslmode=require` on `DATABASE_URL` for the Docker API — it causes `SELF_SIGNED_CERT_IN_CHAIN` with Node `pg` v8+.

### 5.4 Bcrypt hash for creator portal (optional)

On your PC in the project folder:

```bash
node -e "import bcrypt from 'bcryptjs'; console.log(await bcrypt.hash('YourStrongPortalPassword', 10));"
```

If `bcryptjs` is not installed locally, use an online bcrypt generator for a **strong** password and put the hash in `CREATOR_PORTAL_PASSWORD_HASH`, then restart the container:

```bash
docker restart schooltime-api
```

---

## Part 6 — GitHub Pages (frontend)

### 6.1 Set API URL variable

1. GitHub → your **SchoolTime** repo → **Settings** → **Secrets and variables** → **Actions** → **Variables**.
2. **New repository variable:**
   - Name: `VITE_API_BASE_URL`
   - Value: `https://schooltime-api.duckdns.org/api` (or your API hostname; must include `/api`, must be **https**)

### 6.2 Deploy Pages

1. **Settings** → **Pages** → Source: **GitHub Actions**.
2. Merge or push to **`main`** (workflow `.github/workflows/deploy-pages.yml` runs).
3. Open your site, e.g. `https://YOUR_USER.github.io/SchoolTime/`

### 6.3 Match CORS

On EC2 `.env`, `CORS_ORIGIN` must match the browser origin exactly (check DevTools → address bar origin).

After changing `.env`:

```bash
docker rm -f schooltime-api
docker run -d --name schooltime-api --restart unless-stopped \
  -p 127.0.0.1:8787:8787 \
  --env-file .env \
  schooltime-api
```

---

## Part 7 — First use of the app

1. Open GitHub Pages URL in the browser.
2. **Register** a new school (fresh RDS — no old data).
3. Complete setup (standards, teachers, periods).
4. **Create timetable** → check Reports and export PDF.

---

## Part 8 — Verify from your PC

In the project folder on Windows:

```bash
npm run deploy:verify-aws -- https://schooltime-api.duckdns.org/api
```

Or:

```bash
node scripts/aws/verify-aws-deploy.mjs https://schooltime-api.duckdns.org/api
```

---

## Part 9 — Updates (new code later)

On EC2:

```bash
cd ~/SchoolTime
git pull
docker build -t schooltime-api .
docker rm -f schooltime-api
docker run -d --name schooltime-api --restart unless-stopped \
  -p 127.0.0.1:8787:8787 \
  --env-file .env \
  schooltime-api
```

Push to **`main`** on GitHub to refresh Pages.

---

## Part 10 — Free Tier reminders

| Resource | Limit |
|----------|--------|
| EC2 t3.micro | 750 hours/month (one instance 24/7 OK) |
| RDS db.t3.micro / db.t4g.micro | 750 hours/month, 20 GB |
| After 12 months | Starts billing — see `docs/AWS_COST_OPTIMIZED.md` |

**Save RAM on EC2:**

- Leave `CP_SAT_SOLVER_URL` empty (legacy engine only), **or**
- Use **CP-SAT on Lambda** (no Python on EC2) — **`docs/AWS_LAMBDA_CPSAT.md`**

**Avoid:** NAT Gateway, ALB, App Runner, 24/7 CP-SAT Docker on a 1 GB `t3.micro`.

---

## Optional — CP-SAT on Lambda (Hybrid, generate-only)

1. Follow **`docs/AWS_LAMBDA_CPSAT.md`** (build `Dockerfile.lambda`, ECR, Lambda, Function URL).
2. On EC2 `.env`:

```env
CP_SAT_SOLVER_URL=https://YOUR-ID.lambda-url.us-east-1.on.aws/solve
CP_SAT_SOLVER_SECRET=your-secret
TIMETABLE_SOLVER_TIMEOUT_MS=120000
```

3. Restart API container. Use **Hybrid** on Create; first invoke after idle may be slow (cold start).

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Pages load, API fails in Network tab | `VITE_API_BASE_URL` must be **https**; rebuild Pages after changing variable |
| CORS error | `CORS_ORIGIN` must match `https://user.github.io` exactly |
| DB connection timeout | RDS SG must allow **schooltime-api-sg** on 5432; check `DATABASE_URL` host and DB name (`postgres`) |
| DB `SELF_SIGNED_CERT_IN_CHAIN` | Remove `?sslmode=` from `DATABASE_URL`; use `NODE_ENV=production` |
| DB `3D000` | Wrong database name in URL — use RDS **DB name** from console |
| `docker logs` shows JWT error | Set strong `JWT_SECRET` |
| Creator portal 503 | Set `CREATOR_PORTAL_PASSWORD_HASH` |
| Caddy no certificate | DNS A record must point to Elastic IP; ports 80/443 open |

---

## Related docs

- `docs/AWS_COST_OPTIMIZED.md` — costs after free tier
- `docs/AWS_DEPLOYMENT.md` — App Runner / full AWS path
- `infra/aws/env.production.template` — all env vars
- `infra/aws/Caddyfile.example` — copy for Caddy
- `docs/AWS_LAMBDA_CPSAT.md` — CP-SAT on Lambda
