# SchoolTime Autonomous Autofix Policy

This policy defines where autonomous bug detection and fixing is allowed, blocked, or escalated.

## Goal

Reduce human effort without risking production integrity.

## Autonomy Levels

- **Low risk**: autonomous PR creation is allowed.
- **Medium risk**: autonomous detection + issue/PR draft only.
- **High risk**: autonomous fix blocked; human intervention required.

## Risk Classification

### High-risk paths (no autonomous fix)

- `server/routes/auth*`
- `server/routes/license*`
- `server/routes/apiKey*`
- `server/db*`
- `server/config/env*`
- `server/middleware/*`
- `scripts/migrate*`
- `docs/POSTGRES_MIGRATION.md`
- `.github/workflows/*deploy*`

### Medium-risk paths

- Any `server/*` file not listed in high risk
- Any `.github/workflows/*` file
- Any `.cursor/rules/*` file

### Low-risk paths

- Frontend UI text/layout changes
- Documentation-only changes
- Lockfile/dependency patch changes without risky file impact

## Mandatory Guardrails

1. Autonomous jobs never push directly to production logic files.
2. Auto-created fixes must be pull requests (no direct branch overwrite).
3. High-risk or oversized change sets are blocked and converted into issues.
4. All autonomous changes must pass build, smoke, and security checks.
5. Human-reviewed merge remains mandatory for blocked/high-risk cases.

## Workflow Enforcement

Enforced by `.github/workflows/daily-health-autofix.yml` and `scripts/autofix-risk-gate.mjs`.

- Daily run attempts safe dependency fixes.
- Risk gate evaluates modified files.
- If `safe_autofix=true`, an automated PR can be created.
- If blocked, an issue is created with run metadata and escalation labels.

## Human Approval Requirements

Human review is required for:

- Authentication, authorization, API key, billing/license changes
- Database engine/config/migration changes
- Deployment workflow or infrastructure changes
- Any change above size threshold or with uncertain blast radius
