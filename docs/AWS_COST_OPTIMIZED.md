# AWS — most economical hosting (SchoolTime)

Goal: **lowest steady monthly cost**, while keeping **GitHub Pages** (free) for the UI and **Postgres** for production data.

---

## Best option for **12-month AWS Free Tier** (new account)

Use services that map to **750 hours/month** (enough for one instance running 24/7 all year):

| Piece | Free Tier choice | Notes |
|-------|------------------|--------|
| **Frontend** | **GitHub Pages** | Not AWS; stays $0 |
| **API** | **EC2 `t3.micro`** (or `t2.micro`) Linux | 750 h/mo included |
| **Database** | **RDS PostgreSQL `db.t3.micro`** or **`db.t4g.micro`** (if offered in your region) | 750 h/mo + 20 GB storage |
| **CP-SAT** | **Do not run** in AWS | Saves RAM and a second billable service |

**Best 1-year layout:** **EC2 (API) + RDS (Postgres)**, single-AZ, **no** NAT Gateway, **no** ALB, **no** App Runner.

**Alternative (one free EC2 only):** **Single `t3.micro`** with API + Postgres in Docker on the same VM. Uses only EC2 free hours (no RDS instance). Cheapest slot count; **1 GB RAM is tight** when generating timetables—OK for one small school, watch memory.

**Avoid during free tier year:** App Runner, ECS + ALB, NAT Gateway, second EC2 for CP-SAT, Multi-AZ RDS.

After 12 months, RDS + micro EC2 become paid (~$15–25/mo)—then switch to the **Lightsail** plan in the table below or stay on micro instances.

**Account note:** Free Tier applies to **new AWS accounts** for eligible services/regions; confirm current limits in [AWS Free Tier](https://aws.amazon.com/free/).

**Step-by-step setup:** **`docs/AWS_FREE_TIER_SETUP.md`** (EC2 + RDS + GitHub Pages + HTTPS).

---

## Without Free Tier (ongoing minimal cost)

Rough US-region estimates (no free tier, single school / low traffic):

| Stack | About / month | Notes |
|-------|----------------|--------|
| **Cheapest (recommended)** | **~$12–20** | Lightsail API + small managed Postgres **or** one slightly larger Lightsail with API + Postgres on the same VM |
| **Separate RDS + small compute** | **~$20–28** | RDS `db.t4g.micro` + Lightsail $7 / small EC2 |
| **App Runner + RDS** | **~$30–45+** | Easiest ops, **not** the cheapest |
| **ECS + ALB + RDS** | **~$45+** | ALB alone is costly for a tiny app |
| **+ CP-SAT always on** | **+$15–30+** | Second container; skip unless you need Hybrid daily |
| **+ CP-SAT on Lambda** | **Often $0** in Free Tier (per generate) | See `docs/AWS_LAMBDA_CPSAT.md` |

Prices vary by region and usage; treat this as planning, not a quote.

---

## What to use (minimal bill)

### 1. Frontend — GitHub Pages ($0 on AWS)

Keep `.github/workflows/deploy-pages.yml`. No S3/CloudFront required unless you outgrow Pages.

### 2. API — **Amazon Lightsail** (not App Runner)

| Lightsail plan | RAM | Typical use |
|----------------|-----|-------------|
| **$5** | 512 MB | Tight; OK for API only, few concurrent users |
| **$7** | 1 GB | **Sweet spot** for Node API + light traffic |
| **$12** | 2 GB | API + **Postgres on the same instance** (self-managed) |

Deploy with the repo **`Dockerfile`** (Container service) or install Node 20 + `pm2` on a Lightsail instance.

- **No NAT Gateway** (saves ~$32+/mo).
- **No Application Load Balancer** (saves ~$16+/mo).
- Static IP included on Lightsail.

### 3. Database — pick one

**Option A — Lowest total (~$12–20/mo): Postgres on the same Lightsail as the API**

- Use **$12 (2 GB)** Lightsail instance.
- Run Postgres in Docker (or native) on `localhost`; API uses `DATABASE_URL=postgresql://...@127.0.0.1:5432/schooltime`.
- You manage backups (`pg_dump` cron → Lightsail object storage or download).
- Good for: one school, low traffic, you accept single-box risk (no separate DB HA).

**Option B — Managed DB, still cheap (~$20–22/mo): Lightsail managed PostgreSQL + $7 API**

- **Lightsail database** smallest PostgreSQL bundle (~$15/mo).
- **$7** Lightsail instance for API only.
- Private networking between Lightsail resources in the same region (simple, no NAT).

**Option C — RDS micro (~$20–28/mo): `db.t4g.micro` + $7 Lightsail API**

- RDS **single-AZ**, **db.t4g.micro** (Graviton), **20 GiB** gp3 (minimum).
- Disable **Multi-AZ**, skip **Performance Insights** paid tier, minimal backup retention (1 day if policy allows).
- API on Lightsail with security group allowing API → RDS:5432 only.
- Avoid **public RDS + 0.0.0.0/0** in production; use Lightsail/RDS in same VPC or Lightsail DB instead.

**Do not use** Aurora, Multi-AZ, or large instance classes unless you need them.

### 4. CP-SAT solver — **off by default**

- Leave **`CP_SAT_SOLVER_URL` unset** → legacy greedy engine (fine for most schools).
- Running a **second** service (App Runner / second Lightsail / ECS) for OR-Tools is the largest optional cost.
- If you need Hybrid occasionally: run CP-SAT **locally** for experiments, or start a small sidecar **only during generate windows** (manual start/stop), not 24/7.

### 5. Other cost traps to avoid

| Avoid | Why |
|-------|-----|
| NAT Gateway | Fixed hourly + per-GB; common “bill surprise” with private RDS + Fargate |
| Application Load Balancer | Fixed cost poor fit for one small API |
| Two App Runner services | Base + memory charges × 2 |
| ECS Fargate + ALB | Overkill for one Node process |
| CloudWatch log volume | Set short retention; don’t log bodies in prod |
| Large RDS storage | Start at 20 GiB; grow when needed |
| Hybrid + CP-SAT 24/7 | Heavy RAM; not needed for economy |

---

## Recommended “economy” architecture

```text
GitHub Pages (free)
    → HTTPS → Lightsail $7 — Node API (Dockerfile)
                  → Postgres:
                       same instance ($12 plan)  OR
                       Lightsail managed DB ($15)  OR
                       RDS db.t4g.micro (~$13–16)
```

**Env (same as full guide):** `DB_CLIENT=postgres`, `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN`, `APP_BASE_URL`, `HOST=0.0.0.0`, `PORT=8787`.

---

## Step-by-step (economy path)

### A. Lightsail API ($7)

1. **Lightsail** → **Create instance** → OS: Ubuntu 22.04 **or** **Container** → push image from `Dockerfile`.
2. Open port **8787** (or 443 behind Lightsail load balancer — optional extra cost; many use :8787 + HTTPS via Lightsail certificate on instance with Caddy).
3. Simpler: attach **Lightsail static IP**, run **Caddy** or nginx reverse proxy with **Let’s Encrypt** on 443 → proxy to `127.0.0.1:8787`.
4. Set env from `infra/aws/env.production.template`.

### B. Database

**Same box (cheapest):**

```bash
# On the Lightsail instance (example — adjust versions)
docker run -d --name pg -e POSTGRES_PASSWORD=... -e POSTGRES_DB=schooltime \
  -v pgdata:/var/lib/postgresql/data -p 127.0.0.1:5432:5432 postgres:16
```

Start API once to migrate schema; register schools in the app.

**Managed Lightsail DB:** create **PostgreSQL** database in console, copy connection string into `DATABASE_URL`, allow access from API instance.

### C. GitHub Pages

Repo variable: `VITE_API_BASE_URL=https://<your-lightsail-domain-or-ip>/api`  
(use HTTPS URL if you configured Caddy)

`CORS_ORIGIN` = your `https://<user>.github.io` origin.

### D. Backups (required on economy self-hosted DB)

Weekly cron on the instance:

```bash
pg_dump "$DATABASE_URL" -F c -f /home/ubuntu/backups/schooltime-$(date +%F).dump
```

Rotate old files; optionally copy to Lightsail object storage.

---

## Sizing guidance (SchoolTime)

- **CPU:** timetable generate is bursty; 1 vCPU is enough for small/medium schools.
- **RAM:** Node API ~100–300 MB idle; Postgres ~200–400 MB; **1 GB** instance works if CP-SAT is off; **2 GB** if Postgres is co-located.
- **Disk:** 20–40 GiB enough for years of one-school data; monitor `timetable_runs` growth.

---

## When to spend more

Move to **RDS + App Runner** (see `docs/AWS_DEPLOYMENT.md`) when you need:

- Separate DB operations / automated RDS backups
- VPC-only database (no public IP)
- Multiple schools with higher concurrent generate load
- CP-SAT Hybrid in production 24/7

---

## Checklist (minimal monthly cost)

- [ ] GitHub Pages for frontend  
- [ ] Lightsail **$7** (API) or **$12** (API + Postgres on one box)  
- [ ] **No** App Runner, **no** ALB, **no** NAT Gateway  
- [ ] **No** CP-SAT service in prod (legacy solver)  
- [ ] RDS only if you want managed DB — **db.t4g.micro**, single-AZ  
- [ ] Short log retention; minimal backup retention on RDS  
- [ ] Region: **us-east-1** (often cheapest; pick one region and stay there)

---

## Related

- Full AWS steps: `docs/AWS_DEPLOYMENT.md`
- Env template: `infra/aws/env.production.template`
