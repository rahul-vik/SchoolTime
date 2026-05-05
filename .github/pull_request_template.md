## Summary

- What changed:
- Why this is needed:

### Before merging **`develop` → `main`**

On branch **`develop`**, run **`npm run release:sync-develop`** (then commit/push) so auto-generated docs stay aligned with **`main`** and PRs do not stall on `AUTO_*` conflicts. Details: `docs/VERSIONING.md`.

### If GitHub reports conflicts only on auto-docs (`docs/AUTO_CHANGELOG.md`, `docs/AUTO_RULES_INTELLIGENCE.md`)

Regenerate—do not edit conflict markers by hand:

`npm run docs:auto` → `git add docs/AUTO_CHANGELOG.md docs/AUTO_RULES_INTELLIGENCE.md` → commit (finish merge).

## Scope

- [ ] Frontend (`src/`)
- [ ] Backend/API (`server/`)
- [ ] Timetable engine (`server/engine.js`)
- [ ] Exports (PDF/Excel)
- [ ] Auth/security
- [ ] Docs/ops

## Validation

- [ ] `npm ci` (or `npm install`)
- [ ] `npm run build`
- [ ] `npm run smoke:prod`
- [ ] (If relevant) verified generate timetable flow in UI
- [ ] (If relevant) verified PDF + Excel download opens correctly

## Security And Config

- [ ] No secrets added to repo
- [ ] Env changes reflected in `.env.example` and docs
- [ ] `npm run audit:security` reviewed
- [ ] Role/auth boundaries preserved for changed endpoints

## Data And Migration Safety

- [ ] DB/schema impact reviewed (`server/db.js`)
- [ ] Additive migration approach used (no destructive startup changes)
- [ ] Backup/restore impact considered

## Production Readiness

- [ ] Relevant items from `docs/PRODUCTION_READINESS.md` checked
- [ ] Monitoring/logging impact considered
- [ ] Rollback plan included

## Rollback Plan

- How to revert safely:

## Screenshots / Evidence (if UI/export changed)

- Attach screenshots or sample output details.

