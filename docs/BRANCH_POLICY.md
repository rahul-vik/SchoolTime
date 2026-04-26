# SchoolTime Branch Policy

## Branches

- `main`: production/live
- `develop`: integration/staging
- `feature/*`, `fix/*`: from `develop`
- `hotfix/*`: from `main`
- `release/*`: from `develop`

## Merge Rules

- No direct push to `main`/`develop`
- PR required with approval(s)
- Required checks must pass
- Resolve all review conversations
- Hotfix merges to `main` must be back-merged to `develop`

## PR Checklist

- Clear summary and why change is needed
- Build and runtime sanity checked
- Timetable generation verified (if impacted)
- PDF/Excel export verified (if impacted)
- API/docs/env updates documented (if changed)
- No secrets committed

## Release Checklist

1. Create `release/x.y.z` from `develop`
2. Stabilize with bug fixes only
3. Merge to `main`, tag, deploy
4. Smoke test:
   - `/api/health`
   - login
   - timetable generation
   - PDF and Excel export
5. Merge release branch back into `develop`

