## Release PR - SchoolTime

Target branch: `main`  
Source branch: `release/x.y.z`

## Release Summary

- Version:
- Scope of release:
- Key user-visible changes:

## Required Validation

- [ ] `npm ci`
- [ ] `npm run build`
- [ ] `npm run smoke:prod`
- [ ] `npm run audit:security` reviewed

## Production Readiness

- [ ] All applicable checks in `docs/PRODUCTION_READINESS.md` completed
- [ ] Reverse proxy / HTTPS config validated
- [ ] PM2/process supervision ready
- [ ] Backup created before deploy
- [ ] Restore drill previously verified

## Functional Sign-off

- [ ] Login + token refresh
- [ ] Timetable generation
- [ ] Dashboard and reports
- [ ] PDF export
- [ ] Excel export

## Migration / Data Impact

- [ ] DB changes reviewed (`server/db.js`)
- [ ] Additive migration only
- [ ] Backward compatibility confirmed

## Deployment Plan

- Planned deployment window:
- Rollout steps:
- Who is responsible:

## Rollback Plan

- Tag/commit to rollback to:
- Rollback steps:

## Post-Deploy Smoke

- [ ] `/api/health` OK
- [ ] Core flows verified on production
- [ ] Logs clean (no repeated server errors)

