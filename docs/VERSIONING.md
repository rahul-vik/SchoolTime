# SchoolTime Versioning Policy

This project follows strict **SemVer** (`MAJOR.MINOR.PATCH`) for every production-facing release.

## Numbering Rules

- **PATCH** (`x.y.Z`): bug fixes, small UX improvements, safe behavior corrections.
- **MINOR** (`x.Y.z`): backward-compatible features, new pages/cards/flows, non-breaking API additions.
- **MAJOR** (`X.y.z`): breaking API/behavior/data contract changes requiring migration or explicit rollout planning.

## Branch-to-Version Contract

- `release/x.y.z`
  - `package.json` version **must exactly equal** `x.y.z`.
  - `CHANGELOG.md` release entry is required.
- `hotfix/x.y.z`
  - `package.json` version **must exactly equal** `x.y.z`.
  - `CHANGELOG.md` release entry is required.
- `feature/*`, `fix/*`
  - Must not bump `package.json` version.
  - Must not add release entries to `CHANGELOG.md`.

## Release Progression

- For PRs into `main` from `release/*` or `hotfix/*`:
  - `package.json` version must be valid SemVer.
  - version must be **greater than** `origin/main` version.
  - `CHANGELOG.md` must be updated for that version.

## Build Identity Visibility

App sidebar shows:

- `V<package.json-version> (<build-number>)` (for example `V1.0.2 (32)`)
- In local dev mode only: ` · LOCAL · DEV`
- In production builds: no environment tag suffix

This makes local/staging/prod builds immediately distinguishable.

## Validation Commands

- Local check before push:
  - `npm run check:versioning`
- Validation/auto-fix safety unit checks:
  - `npm run test:backend:validation`
- CI governance check on PR:
  - `npm run check:release-governance`

## Practical Workflow

1. Do regular work on `feature/*` or `fix/*` from `develop`.
2. Create `release/x.y.z` from `develop` for stabilization.
3. Set `package.json` to `x.y.z`, update `CHANGELOG.md`.
4. Merge release PR into `main`.
5. Back-merge release branch into `develop`.

## Integrating `develop` into `main` (avoid `AUTO_*` merge conflicts)

`docs/AUTO_CHANGELOG.md` and `docs/AUTO_RULES_INTELLIGENCE.md` are **generated**. If `main` and `develop` each updated them (for example via `[skip ci]` chores), GitHub will show conflicts on a **`develop` → `main`** PR.

**Before you open or finalize that PR**, sync `develop` with `main` and regenerate:

```bash
git checkout develop
git pull origin develop
npm run release:sync-develop
```

Review `git status`, then commit (if anything changed) and `git push origin develop`. After this, the merge into `main` should proceed without hand-editing conflict markers.

If conflicts remain only in those two files mid-merge, finish with:

`npm run docs:auto` → `git add docs/AUTO_CHANGELOG.md docs/AUTO_RULES_INTELLIGENCE.md` → commit — **never** paste conflict markers manually.

Release branches already run a similar pre-sync via `npm run release:prepare` (merges `origin/main` and `origin/develop`, then `docs:auto`).
