# SchoolTime Project Standards (Master Handbook)

This handbook is the single source of truth for how the team builds, reviews, releases, and operates SchoolTime.

Use it for onboarding, daily development, and release decisions.

## 1) Operating Principles

- Keep architecture clean:
  - Frontend in `src/`
  - Backend in `server/`
  - Docs in `docs/`
  - Small cross-runtime helpers in `shared/` (e.g. report label strings imported by both `exportService.js` and the client; **`shared/periodSlotDays.js`** for period-slot weekday activity used by engine, exports, validation, and UI—keep them aligned)
- Keep changes minimal, focused, and backward-compatible unless explicitly approved.
- Never commit secrets. Use `.env` locally and keep `.env.example` current.
- Preserve deterministic timetable/export behavior across runs.
- Preserve deterministic teacher assignment within a run: do not mix multiple teachers for the same division-subject unless explicitly introducing and documenting a team-teaching rule.
- Keep user-facing language simple and action-oriented.
- For operational timestamps shown in admin/creator views (for example "Last activity"), source from real activity records (audit/session actions) rather than creation timestamps.
- Session refresh/resume should be auditable when it materially represents user activity (for example refresh-token driven app reopen).

## 2) Branch Model And Workflow

### Branches

- `main` -> production/live
- `develop` -> integration/staging
- `feature/*`, `fix/*` -> branch from `develop`
- `release/*` -> branch from `develop`
- `hotfix/*` -> branch from `main`

### Default Working Mode

- Default local branch: `develop`
- Default run mode: development (`npm start` or `npm run dev:all`)
- Switch to production branch only when explicitly required.
- After production/hotfix work, return to `develop`.

### Merge Rules

- No direct push to `main` or `develop`
- Pull request required
- Required checks must pass
- Review conversations must be resolved
- Hotfix merged to `main` must be back-merged to `develop`

## 3) PR And Issue Governance

### PR templates

- Default PR: `.github/pull_request_template.md`
- Release PR: `.github/PULL_REQUEST_TEMPLATE/release.md`
- Hotfix PR: `.github/PULL_REQUEST_TEMPLATE/hotfix.md`

### Issue templates

- Bug report: `.github/ISSUE_TEMPLATE/bug_report.md`
- Feature request: `.github/ISSUE_TEMPLATE/feature_request.md`

### Minimum PR expectations

- Clear summary and reason for change
- Build/runtime impact validated
- Timetable generation checked if impacted
- PDF/Excel export checked if impacted
- API/docs/env updated when behavior changes
- No secrets committed

## 4) CI And Quality Gates

CI workflow:

- `.github/workflows/ci.yml`

Required checks:

1. `npm ci`
2. `npm run build`
3. `npm run smoke:prod`
4. `npm run audit:security`

Pre-merge quality gate (developer responsibility):

- Verify changed files are readable and coherent
- Confirm no linter errors in edited files
- For release-impacting changes, pass build + smoke checks
- For dependency/security-sensitive changes, review security audit output

## 5) Production Readiness Gate

Before merging release branch into `main`, complete:

### Build and Runtime

- `npm ci`
- `npm run build`
- `npm run smoke:prod`
- API starts in production env
- `/api/health` returns `ok: true`

### Security

- Strong `JWT_SECRET` (32+ chars)
- Explicit `CORS_ORIGIN` (no wildcard in prod)
- `npm run audit:security` reviewed
- HTTPS enabled

### Data Safety

- Backup created successfully
- Restore drill completed at least once
- DB persistence configured for `server/data`
- If moving to cloud database, Postgres migration runbook completed (`docs/POSTGRES_MIGRATION.md`)
- Runtime DB target confirmed (`DB_CLIENT=sqlite` or `DB_CLIENT=postgres`) and verified in deployed environment.

### Operations

- PM2/systemd supervision configured
- Logs collection in place
- Alert plan defined

### Release Controls

- CI passed on PR
- PR checklist complete
- Release tag prepared

Reference: `docs/PRODUCTION_READINESS.md`

## 6) Release And Hotfix Procedure

### Release

1. Create `release/x.y.z` from `develop`
2. Stabilize with blocker fixes only
3. Merge to `main`, tag, deploy
4. Post-deploy smoke:
   - `/api/health`
   - login
   - timetable generation
   - PDF export
   - Excel export
5. Back-merge release branch into `develop`

### Hotfix

1. Branch `hotfix/*` from `main`
2. Apply minimal targeted fix
3. Merge to `main`, deploy fast
4. Create back-merge PR to `develop`

## 7) Runtime, Security, And Operations Standards

- Backend security headers via Helmet are enabled in API server.
- API health endpoint includes uptime/timestamp for monitoring.
- Use PM2 config: `ecosystem.config.cjs`
- Keep dependency audit discipline (`npm run audit:security`)
- Restrict CORS and run behind HTTPS

## 8) Backup And Restore Standard

### Windows

- Backup: `scripts/backup-db.ps1`
- Restore: `scripts/restore-db.ps1`

### Linux/macOS

- Backup: `scripts/backup-db.sh`
- Restore: `scripts/restore-db.sh`

Always perform a restore drill before production launch windows.

## 9) Rule System (Cursor + AI assistants)

Persistent project rules are stored in `.cursor/rules/`:

- `schooltime-core.mdc`
- `schooltime-default-dev-branch.mdc`
- `schooltime-branch-release-policy.mdc`
- `schooltime-backend-api.mdc`
- `schooltime-frontend-react.mdc`
- `schooltime-exports.mdc`
- `schooltime-autonomous-ops-policy.mdc`

Cross-editor AI guidance:

- `AGENTS.md`

When standards evolve, update:

1. This handbook (`docs/PROJECT_STANDARDS.md`)
2. Specific policy docs (`docs/BRANCH_POLICY.md`, `docs/DEPLOYMENT.md`, `docs/PRODUCTION_READINESS.md`)
   and migration docs (`docs/POSTGRES_MIGRATION.md`) when DB strategy changes.
3. Rule files under `.cursor/rules/`
4. Templates under `.github/`
5. Autonomous guardrail policy in `docs/AUTONOMOUS_AUTOFIX_POLICY.md`

## 10) Daily Developer Quick Start

1. Ensure branch is `develop` (`git checkout develop`)
2. Start app in dev mode (`npm start` or `open-dev.bat` on Windows)
3. Implement focused change
4. Run relevant checks:
   - `npm run build`
   - `npm run smoke:prod` (if backend/engine/export impacted)
5. Raise PR using project template

