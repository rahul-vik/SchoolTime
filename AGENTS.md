# SchoolTime Agent Guide

This file defines the project "structure and soul" for AI/code assistants across editors.

## Mission

Build a reliable, practical school timetable system with clear UX, predictable exports, and safe backend behavior.

## Non-Negotiables

1. Keep architecture clean:
   - Frontend: `src/`
   - Backend: `server/`
   - Docs: `docs/`
   - Shared minimal helpers: `shared/` (importable by server and Vite client when dependency-free), including **`shared/periodSlotDays.js`** for period-slot weekday activity (keep engine, exports, validation, and UI in sync)
2. Do not break core flows:
   - Auth/session
   - Timetable generation (legacy greedy: phased placement, multi-restart, hardest-first ordering, backtracking, lock repair — see `docs/ARCHITECTURE.md`)
   - Timetable manual edits (division view: swap/move/add; engine-parity validation; optional repair plans from `valid-add-options`)
   - Live report recompute after edits (`shared/recomputeTimetableReport.js` on server and client)
   - Reports
   - PDF/Excel downloads
3. Keep changes backward-compatible unless explicitly approved.
4. Keep user-facing language simple and actionable.
5. Never commit secrets.

## Coding Conventions

- Prefer small helper functions over dense nested logic.
- Keep route handlers thin; business logic belongs in services/engine helpers.
- Reuse existing UI primitives/components before adding new ones.
- Keep naming domain-based (`division`, `subject`, `teacher`, `slot`, `timetable`).

## Timetable Manual Edits

- **`entries`** on the active run are authoritative; **`timetable.sourceState`** supplies period grid and entity lists for validation and labels.
- Shared validation: `shared/timetablePlacementValidator.js` (`validateManualEdit`, `validateAddLesson`). Server routes: `valid-edit-targets`, `valid-add-options`, `apply-edit` (see `docs/API.md`).
- After apply, recompute shortage metrics with `shared/recomputeTimetableReport.js` (`withLiveTimetableReport`); do not require a full regenerate for Reports/Dashboard alignment.
- Repair suggestions: bounded MOVE/SWAP plans from `valid-add-options` → apply via `apply-edit` → retry add.
- Keep teacher view read-only; only division/class grid supports edit mode.

## Export Fidelity

- Maintain parity between in-app timetable intent and PDF/Excel visuals (including inactive period days: no lesson content in those cells).
- **Timetable screen:** prefer **`timetable.sourceState`** (`periodSlots`, `workingDays`, and entity lists used for report labels) when rendering a generated run so slot columns and shortage badges match persisted **`entries`** and `report.unscheduled` ids (see `src/features/shared/idLookups.js`).
- Use shared schedule context when possible.
- Preserve break/lunch/free and category styling semantics.
- Class-teacher **CT** is black, subject row: code left / CT right; teacher exports add medium **code** under **Std …-Div** when set.
- Report bundle subject-hour labels stay aligned via `shared/reportHoursLabels.js`.

## Data/DB Safety

- Use additive schema evolution.
- Guard migrations with column-existence checks.
- Avoid destructive startup mutations.

## Branching And Delivery

- Production hosting: **GitHub Pages** (SPA) + **AWS EC2 Docker** (API) + **RDS PostgreSQL** + **Caddy HTTPS** (DuckDNS or custom domain). **Render is not used.** Walkthrough: `docs/AWS_FREE_TIER_SETUP.md`. Reference: `docs/AWS_DEPLOYMENT.md`, `docs/AWS_COMPLETE_SETUP.md`, `.cursor/rules/schooltime-production-aws.mdc`.
- `main` production, `develop` staging, feature/fix branches from `develop`.
- Hotfixes from `main`, then back-merge into `develop`.
- All changes via PR with validation checklist.

## Required Validation Before Finalizing

- Verify changed files for lint/readability.
- Smoke-check impacted user flow(s).
- Update docs when behavior/config/API changes.

