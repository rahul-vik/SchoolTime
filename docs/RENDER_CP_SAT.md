# Render hosting (removed)

**Render is no longer used** for SchoolTime production. Decommission any Render Web Services, Postgres, and blueprints (`render.yaml` is a stub only).

## Current production stack

| Component | Platform |
|-----------|----------|
| Frontend | **GitHub Pages** |
| API | **AWS EC2** (Docker, root `Dockerfile`) |
| Database | **Amazon RDS PostgreSQL** |
| HTTPS API | **Caddy** on EC2 (custom domain or free **DuckDNS**) |
| CP-SAT (optional) | **AWS Lambda** or second container — not on Render |

## CP-SAT on AWS

- **Lambda (generate-only, recommended for Free Tier):** `docs/AWS_LAMBDA_CPSAT.md`
- **Second Docker service on EC2 / App Runner:** `docs/AWS_CP_SAT.md`

## Setup guides

- **Free Tier walkthrough:** `docs/AWS_FREE_TIER_SETUP.md`
- **Full AWS + GitHub:** `docs/AWS_COMPLETE_SETUP.md`
- **Architecture reference:** `docs/AWS_DEPLOYMENT.md`
