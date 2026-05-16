# Production Readiness Checklist

Use this checklist before promoting `develop` to `main` or deploying a release tag.

## One-command preflight (recommended)

From repo root (with dependencies installed):

```bash
npm run prod:preflight
```

This runs `build`, `smoke:prod`, backend engine + validation tests, shared unit tests, a **dry-run** of tenant/timetable-run JSON migrations, and `audit:security`.

To fail when migrations are still pending locally (optional gate before copying a DB to prod):

```bash
node scripts/prod-deploy-preflight.mjs --strict-migrations
```

CI on `develop` / `main` / release branches runs build, smoke, audit, and backend tests (see `.github/workflows/ci.yml`).

## Build And Runtime

- [ ] `npm ci` (or `npm install` on a pinned lockfile)
- [ ] `npm run prod:preflight` (or at minimum `npm run build` + `npm run smoke:prod`)
- [ ] API starts with `NODE_ENV=production`
- [ ] `/api/health` returns `ok: true` and expected `release.version`
- [ ] Frontend `dist/` served with SPA fallback (`index.html` / `404.html` for `/creator`)

## Security

- [ ] `JWT_SECRET` is strong (32+ chars), not the example value
- [ ] `CORS_ORIGIN` lists only trusted frontend origins (no wildcard in production)
- [ ] `CREATOR_PORTAL_PASSWORD_HASH` set (plain portal password rejected when `NODE_ENV=production`)
- [ ] `npm run audit:security` passes or accepted risks documented
- [ ] HTTPS enabled at reverse proxy
- [ ] `CP_SAT_SOLVER_SECRET` set if the CP-SAT sidecar is public

## Data Safety (existing users)

Deploying a new API version should **not** require manual SQL or tenant fixes for normal schools.

| Step | When | What happens |
|------|------|----------------|
| SQLite / Postgres schema | API `initDb()` | Additive columns only (`users.is_active`, `timetable_runs.state_json`, `schema_metadata`). No table drops. |
| Tenant JSON | API startup + load/save/generate | `migrateTenantState`: period `activeWeekdays`, rule pruning, canonical ordering, **class-teacher `enabled` preserved** when legacy CT days/assignments exist. |
| Timetable runs | API startup | Missing `state_json` backfilled from current `tenant_state` (grid alignment only; does not change `entries`). |

**Before deploy**

- [ ] Backup `server/data/app.db` (+ `-wal` / `-shm`) or Postgres snapshot
- [ ] Restore drill executed at least once (`scripts/backup-db.ps1` / `.sh`)
- [ ] Optional: `npm run migrate:all:check` on a **copy** of production DB; `npm run migrate:all` only if you must migrate without starting the API

**After deploy**

- [ ] Logs show `[db] using sqlite` or `[db] using postgres`
- [ ] If startup migrated data: `[tenant_state] startup migration persisted for N/…` (expected once per org with legacy JSON)
- [ ] Smoke: login → load state → open Timetable / Downloads → generate (if credits) → export PDF + Excel

## Timetable engine (no surprise behavior)

- [ ] **`TIMETABLE_SOLVER=legacy`** (default) unless you intentionally run CP-SAT
- [ ] **`CP_SAT_SOLVER_URL` unset** → Hybrid / CP-SAT UI choices still fall back to legacy greedy (existing schedules unchanged until users regenerate)
- [ ] Class-teacher schools: confirm Preferences still show CT enabled after first `GET /state` post-deploy (legacy rows without `enabled` stay on when CT was in use)

## Operations

- [ ] PM2/systemd (`ecosystem.config.cjs`) or host supervisor configured
- [ ] Logs collection in place
- [ ] Alert plan defined (service down / repeated restarts)
- [ ] SMTP configured if password reset email is required

## Release Controls

- [ ] PR checklist completed (`.github/pull_request_template.md`)
- [ ] `npm run check:versioning` on `release/x.y.z` / `hotfix/x.y.z`
- [ ] `CHANGELOG.md` and `package.json` version match branch
- [ ] `npm run release:sync-develop` before `develop` → `main` PR (reduces `AUTO_*` merge conflicts)
- [ ] Release tag prepared after merge to `main`

## Rollback

- [ ] Previous `dist/` and API build artifact retained
- [ ] DB backup from immediately before deploy available
- [ ] Rollback = restore DB backup + redeploy previous release (tenant migrations are forward-only but safe; restoring DB is the reliable undo)

See also: `docs/DEPLOYMENT.md`, `docs/VERSIONING.md`, `docs/BRANCH_POLICY.md`.
