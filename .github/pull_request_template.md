## Summary

- What changed:
- Why this is needed:

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

