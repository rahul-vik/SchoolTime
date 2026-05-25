# Complete AWS setup — SchoolTime

**Repository:** [https://github.com/rahul-vik/SchoolTime.git](https://github.com/rahul-vik/SchoolTime.git)  
**Branch:** `main` (production)  
**Frontend:** GitHub Pages → `https://rahul-vik.github.io/SchoolTime/`  
**Backend:** EC2 (Node API) + RDS (PostgreSQL) + Lambda (CP-SAT, optional)

Work through the parts **in order**. Use one AWS region everywhere (example: **US East `us-east-1`**).

| Part | What you build | Time (approx.) |
|------|----------------|----------------|
| [0](#part-0--before-you-start) | Prerequisites | 15 min |
| [1](#part-1--rds-postgresql) | RDS database | 20 min |
| [2](#part-2--ec2-api-server) | EC2 API server | 45 min |
| [3](#part-3--https-caddy) | HTTPS (required) | 20 min |
| [4](#part-4--lambda-cp-sat) | Lambda CP-SAT (optional) | 30 min |
| [5](#part-5--github-pages) | GitHub Pages + env | 15 min |
| [6](#part-6--go-live-checklist) | Go-live checks | 10 min |

---

## Architecture

```text
                    https://rahul-vik.github.io/SchoolTime/
                              (GitHub Pages)
                                    │
                                    ▼
              https://api.YOURDOMAIN.com/api/...
                              (EC2 + Caddy)
                         ┌──────┴──────┐
                         ▼             ▼
                   RDS Postgres    Lambda CP-SAT
                   (schooltime)    (only on generate)
```

- **No Render.** Fresh RDS — schools **register** in the app.
- **One database** (RDS). Lambda has **no** database.

---

## Part 0 — Before you start

### Accounts and tools

- [ ] [AWS account](https://aws.amazon.com/) (Free Tier eligible if new)
- [ ] Admin access to [github.com/rahul-vik/SchoolTime](https://github.com/rahul-vik/SchoolTime)
- [ ] PC with **Git**, **Docker Desktop**, **Node 20+** (for local checks)
- [ ] Optional: [AWS CLI](https://aws.amazon.com/cli/) installed and `aws configure`

### Domain (required for HTTPS)

GitHub Pages is **HTTPS**. The API must be **HTTPS** too.

- Buy a domain (e.g. Cloudflare / Namecheap), **or** use a subdomain you control.
- You will create: **`api.yourdomain.com`** → EC2 Elastic IP.

Example used below: **`api.yourdomain.com`**

### Secrets (generate now; never commit to git)

| Secret | How |
|--------|-----|
| **RDS password** | Strong password for user `schooltime` |
| **JWT_SECRET** | 32+ random characters |
| **CP_SAT_SOLVER_SECRET** | 32+ random characters (Lambda + EC2 same value) |
| **CREATOR_PORTAL_PASSWORD_HASH** | bcrypt of portal password (see [Part 2.8](#28-creator-portal-password-hash)) |

### GitHub Pages URLs (this repo)

| Setting | Value |
|---------|--------|
| Site URL | `https://rahul-vik.github.io/SchoolTime/` |
| **CORS_ORIGIN** (on EC2) | `https://rahul-vik.github.io` |
| **APP_BASE_URL** (on EC2) | `https://rahul-vik.github.io/SchoolTime` |

---

## Part 1 — RDS PostgreSQL

### 1.1 Create the database

1. AWS Console → search **RDS** → open **RDS**.
2. Region: **us-east-1** (top right).
3. **Create database**.
4. Settings:

| Field | Value |
|-------|--------|
| Creation method | **Standard create** |
| Engine | **PostgreSQL** |
| Version | **16** (or latest 15+) |
| Template | **Free tier** (if available) |
| DB instance identifier | `schooltime-db` |
| Master username | `schooltime` |
| Master password | *(your RDS password)* |
| DB name | `schooltime` |
| Instance class | **db.t3.micro** or **db.t4g.micro** |
| Storage | 20 GiB gp3 |
| Multi-AZ | **No** |
| Public access | **Yes** *(simplest with EC2; tighten later)* |
| VPC security group | **Create new** → `schooltime-rds-sg` |
| Initial database name | `schooltime` |

5. **Create database** → wait until status **Available**.

### 1.2 Save the endpoint

1. Open **`schooltime-db`**.
2. Copy **Endpoint**, e.g. `schooltime-db.xxxxx.us-east-1.rds.amazonaws.com`.

**DATABASE_URL** (save locally):

```text
postgresql://schooltime:YOUR_RDS_PASSWORD@schooltime-db.xxxxx.us-east-1.rds.amazonaws.com:5432/postgres
```

### 1.3 Bootstrap schema (first time only)

**Option A — from your PC** (if RDS is reachable from your IP temporarily):

1. Clone the repo:

```bash
git clone https://github.com/rahul-vik/SchoolTime.git
cd SchoolTime
git checkout main
npm install
```

2. Create `.env` with `DB_CLIENT=postgres` and `DATABASE_URL` above.
3. Run once:

```bash
node server/index.js
```

Stop when logs show `[db] using postgres` and migrations finished (Ctrl+C).

**Option B — after EC2 is up:** run the same `node server/index.js` once on EC2 (Part 2).

---

## Part 2 — EC2 API server

### 2.1 Launch instance

1. AWS Console → **EC2** → **Launch instances**.

| Field | Value |
|-------|--------|
| Name | `schooltime-api` |
| AMI | **Ubuntu Server 26.04 LTS** (or 22.04 LTS) — 64-bit x86 |
| Instance type | **t3.micro** (Free tier eligible) |
| Key pair | **Create** `schooltime-key` → download **`.pem`** |
| Security group | **Create** `schooltime-api-sg` |
| Inbound rules | SSH **22** ← **My IP** |
| | HTTP **80** ← **0.0.0.0/0** |
| | HTTPS **443** ← **0.0.0.0/0** |
| Storage | 20–30 GiB |

2. **Launch instance**.

### 2.2 Elastic IP

1. **EC2** → **Elastic IPs** → **Allocate** → **Associate** with `schooltime-api`.
2. Note the IP, e.g. `3.15.xxx.xxx`.

### 2.3 DNS for API

At your DNS provider:

| Type | Name | Value |
|------|------|--------|
| **A** | `api` | Elastic IP |

Wait until `api.yourdomain.com` resolves to that IP.

### 2.4 Restrict RDS to EC2 only

1. **EC2** → **Security groups** → **`schooltime-rds-sg`** → **Inbound rules**.
2. Remove any `0.0.0.0/0` on port 5432.
3. **Add rule:** Type **PostgreSQL**, port **5432**, Source = **`schooltime-api-sg`**.

### 2.5 SSH into EC2

**Windows PowerShell:**

```powershell
ssh -i "C:\path\to\schooltime-key.pem" ubuntu@YOUR_ELASTIC_IP
```

### 2.6 Install Docker

On the EC2 instance:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
exit
```

SSH in again:

```bash
ssh -i "C:\path\to\schooltime-key.pem" ubuntu@YOUR_ELASTIC_IP
```

### 2.7 Deploy the app from GitHub

```bash
git clone https://github.com/rahul-vik/SchoolTime.git
cd SchoolTime
git checkout main
```

Create **`.env`** (use `nano .env`):

```env
NODE_ENV=production
PORT=8787
HOST=0.0.0.0

DB_CLIENT=postgres
DATABASE_URL=postgresql://schooltime:YOUR_RDS_PASSWORD@YOUR_RDS_ENDPOINT:5432/postgres

JWT_SECRET=YOUR_LONG_JWT_SECRET
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_DAYS=30
RATE_LIMIT_MAX=120

CORS_ORIGIN=https://rahul-vik.github.io
APP_BASE_URL=https://rahul-vik.github.io/SchoolTime

CREATOR_PORTAL_PASSWORD_HASH=YOUR_BCRYPT_HASH

SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM=

# Part 4 — after Lambda is ready:
# CP_SAT_SOLVER_URL=https://YOUR-LAMBDA-URL.lambda-url.us-east-1.on.aws/solve
# CP_SAT_SOLVER_SECRET=YOUR_CP_SAT_SECRET
# TIMETABLE_SOLVER_TIMEOUT_MS=120000
```

Build and run:

```bash
bash scripts/aws/install-api-on-ec2.sh
```

Or manually:

```bash
docker build -t schooltime-api .
docker run -d --name schooltime-api --restart unless-stopped \
  -p 127.0.0.1:8787:8787 \
  --env-file .env \
  schooltime-api
docker logs -f schooltime-api
```

Test on the server:

```bash
curl -s http://127.0.0.1:8787/api/health
```

### 2.8 Creator portal password hash

On your PC (in the cloned repo):

```bash
node -e "import('bcryptjs').then(b=>b.default.hash('YourPortalPassword',10).then(console.log))"
```

Put the hash in `CREATOR_PORTAL_PASSWORD_HASH` on EC2, restart container.

---

## Part 3 — HTTPS (Caddy)

Install on EC2:

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
sudo nano /etc/caddy/Caddyfile
```

Paste (change domain):

```text
api.yourdomain.com {
    reverse_proxy 127.0.0.1:8787
}
```

```bash
sudo systemctl reload caddy
curl -s https://api.yourdomain.com/api/health
```

You should see JSON with `"ok": true`.

---

## Part 4 — Lambda CP-SAT

CP-SAT runs **only when generating** a timetable (Hybrid mode). Skip Part 4 if you only use **legacy** solver.

### 4.1 IAM role for Lambda (one-time)

1. **IAM** → **Roles** → **Create role**.
2. Trusted entity: **Lambda**.
3. Policy: **AWSLambdaBasicExecutionRole**.
4. Role name: `schooltime-cpsat-lambda-role` → **Create**.

Note the role ARN: `arn:aws:iam::ACCOUNT_ID:role/schooltime-cpsat-lambda-role`.

### 4.2 Build and push image

On your PC (Docker running), in the repo:

```bash
git clone https://github.com/rahul-vik/SchoolTime.git
cd SchoolTime
git checkout main
npm run lambda:cpsat:docker-build
```

Get AWS account ID:

```bash
aws sts get-caller-identity --query Account --output text
```

Set variables (PowerShell example):

```powershell
$REGION = "us-east-1"
$ACCOUNT = "123456789012"
```

```bash
aws ecr create-repository --repository-name schooltime-cpsat-lambda --region $REGION

aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin "$ACCOUNT.dkr.ecr.$REGION.amazonaws.com"

docker tag schooltime-cpsat-lambda:latest "$ACCOUNT.dkr.ecr.$REGION.amazonaws.com/schooltime-cpsat-lambda:latest"
docker push "$ACCOUNT.dkr.ecr.$REGION.amazonaws.com/schooltime-cpsat-lambda:latest"
```

### 4.3 Create Lambda function

**Console:**

1. **Lambda** → **Create function**.
2. **Author from scratch** → Name: `schooltime-cpsat-lambda`.
3. **Container image** → **Browse images** → ECR → `schooltime-cpsat-lambda:latest`.
4. **Architecture:** x86_64.
5. **Execution role:** `schooltime-cpsat-lambda-role`.
6. **Create function**.

**Configuration:**

| Setting | Value |
|---------|--------|
| **General → Memory** | **2048 MB** |
| **General → Timeout** | **5 min** (300 s) |
| **Environment variables** | `CP_SAT_SOLVER_SECRET` = your secret |

### 4.4 Function URL

1. **Configuration** → **Function URL** → **Create function URL**.
2. **Auth type:** **NONE**.
3. **Save** → copy URL, e.g.  
   `https://abc123.lambda-url.us-east-1.on.aws/`

### 4.5 Wire EC2 API

On EC2, edit `~/SchoolTime/.env`:

```env
CP_SAT_SOLVER_URL=https://abc123.lambda-url.us-east-1.on.aws/solve
CP_SAT_SOLVER_SECRET=your-secret-same-as-lambda
TIMETABLE_SOLVER_TIMEOUT_MS=120000
```

Restart API:

```bash
cd ~/SchoolTime
docker rm -f schooltime-api
docker run -d --name schooltime-api --restart unless-stopped \
  -p 127.0.0.1:8787:8787 \
  --env-file .env \
  schooltime-api
```

Test Lambda:

```bash
curl -s https://abc123.lambda-url.us-east-1.on.aws/health
```

### 4.6 CLI checklist (optional)

```bash
npm run lambda:cpsat:deploy-checklist
```

More detail: **`docs/AWS_LAMBDA_CPSAT.md`**.

---

## Part 5 — GitHub Pages

### 5.1 Enable Pages

1. [github.com/rahul-vik/SchoolTime](https://github.com/rahul-vik/SchoolTime) → **Settings** → **Pages**.
2. **Build and deployment** → Source: **GitHub Actions**.

### 5.2 Repository variable (API URL)

1. **Settings** → **Secrets and variables** → **Actions** → **Variables** tab.
2. **New repository variable:**

| Name | Value |
|------|--------|
| `VITE_API_BASE_URL` | `https://api.yourdomain.com/api` |

Must be **https** and include **`/api`**.

### 5.3 Deploy frontend

Push to **`main`** (or run workflow manually):

```bash
git push origin main
```

Workflow: `.github/workflows/deploy-pages.yml` builds and publishes to Pages.

Open: **https://rahul-vik.github.io/SchoolTime/**

### 5.4 Confirm CORS

EC2 `.env` must have:

```env
CORS_ORIGIN=https://rahul-vik.github.io
```

If you change it, restart the API container.

---

## Part 6 — Go-live checklist

| Step | Command / action | Expected |
|------|------------------|----------|
| RDS | Connect with `psql` or API start | Schema exists |
| API health | `curl https://api.yourdomain.com/api/health` | `"ok": true` |
| Lambda health | `curl https://....lambda-url..../health` | `"ok": true` (if using CP-SAT) |
| Pages | Open GitHub Pages URL | App loads |
| Register | Create a new school | Success |
| Generate | Create timetable | Completes (legacy or Hybrid) |
| Export | Download PDF | File downloads |

From your PC:

```bash
npm run deploy:verify-aws -- https://api.yourdomain.com/api
```

---

## Updating the app later

### API (EC2)

```bash
ssh -i schooltime-key.pem ubuntu@YOUR_ELASTIC_IP
cd ~/SchoolTime
git pull origin main
docker build -t schooltime-api .
docker rm -f schooltime-api
docker run -d --name schooltime-api --restart unless-stopped \
  -p 127.0.0.1:8787:8787 --env-file .env schooltime-api
```

### Frontend

Push to **`main`** on GitHub → Pages redeploys automatically.

### Lambda CP-SAT

```bash
npm run lambda:cpsat:docker-build
docker push ACCOUNT.dkr.ecr.REGION.amazonaws.com/schooltime-cpsat-lambda:latest
aws lambda update-function-code --function-name schooltime-cpsat-lambda \
  --image-uri ACCOUNT.dkr.ecr.REGION.amazonaws.com/schooltime-cpsat-lambda:latest
```

---

## Free Tier summary (12 months)

| Service | Free allowance | Your use |
|---------|----------------|----------|
| EC2 t3.micro | 750 h/mo | 1 API server 24/7 |
| RDS micro | 750 h/mo + 20 GB | 1 database 24/7 |
| Lambda | 1M requests + 400k GB-s | Per timetable generate |
| GitHub Pages | Free | Frontend |

**Avoid:** NAT Gateway, Application Load Balancer, second EC2 24/7 for CP-SAT.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Pages work, API red in Network | `VITE_API_BASE_URL` wrong or not https; re-run Pages workflow after fixing variable |
| CORS error | `CORS_ORIGIN=https://rahul-vik.github.io` exactly |
| Cannot connect to RDS | Check `schooltime-rds-sg` allows `schooltime-api-sg` on 5432 |
| 502 on API domain | `docker logs schooltime-api`; Caddy running? |
| Hybrid always legacy | Lambda URL must end with `/solve`; secrets must match |
| Lambda timeout | Increase timeout to 300s; `TIMETABLE_SOLVER_TIMEOUT_MS=120000` |

---

## Related files in the repo

| Path | Purpose |
|------|---------|
| `docs/AWS_FREE_TIER_SETUP.md` | EC2 + RDS detail (subset of this guide) |
| `docs/AWS_LAMBDA_CPSAT.md` | Lambda-only deep dive |
| `docs/AWS_COST_OPTIMIZED.md` | Costs after Free Tier |
| `infra/aws/env.free-tier.example` | `.env` template |
| `infra/aws/Caddyfile.example` | Caddy template |
| `Dockerfile` | API image |
| `solver/cpsat/Dockerfile.lambda` | Lambda image |

---

**Repository:** [https://github.com/rahul-vik/SchoolTime.git](https://github.com/rahul-vik/SchoolTime.git) — branch **`main`**.
