# SchoolTime Branch Policy

## Branches

- `main`: production/live
- `develop`: integration/staging
- `feature/*`, `fix/*`: from `develop`
- `hotfix/*`: from `main`
- `release/*`: from `develop`

## Default Working Mode

- Keep local workspace on `develop` as the default branch.
- Default run command is development mode: `npm start` (mapped to `npm run dev:all`).
- Switch to production branch only when explicitly required.
- After production work, return to `develop`.

## Merge Rules

- No direct push to `main`/`develop`
- PR required with approval(s)
- Required checks must pass
- Resolve all review conversations
- Hotfix merges to `main` must be back-merged to `develop`
- Keep `package.json` version bumps and release `CHANGELOG.md` entries on `release/*` or `hotfix/*` branches only (not normal `feature/*` or `fix/*` PRs into `develop`)
- Enforce strict SemVer (`x.y.z`) and branch-version match for `release/*` and `hotfix/*`.
- For PRs into `main`, release/hotfix version must be greater than current `main` version.
- Use PR templates:
  - default: `.github/pull_request_template.md`
  - release: `.github/PULL_REQUEST_TEMPLATE/release.md`
  - hotfix: `.github/PULL_REQUEST_TEMPLATE/hotfix.md`

## PR Checklist

- Clear summary and why change is needed
- Build and runtime sanity checked
- Timetable generation verified (if impacted)
- PDF/Excel export verified (if impacted)
- API/docs/env updates documented (if changed)
- No secrets committed

## Release Checklist

1. Create `release/x.y.z` from `develop`
2. Set `package.json` version to `x.y.z` and update `CHANGELOG.md`
3. Stabilize with bug fixes only
4. Merge to `main`, tag, deploy (or run `.github/workflows/release.yml`)
5. Smoke test:
   - `/api/health`
   - login
   - timetable generation
   - PDF and Excel export
6. Merge release branch back into `develop`

## Versioning Commands

- Local validation: `npm run check:versioning`
- PR governance validation: `npm run check:release-governance`
- Full policy: `docs/VERSIONING.md`

