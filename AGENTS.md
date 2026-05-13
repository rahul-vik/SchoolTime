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
   - Timetable generation
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

## Export Fidelity

- Maintain parity between in-app timetable intent and PDF/Excel visuals (including inactive period days: no lesson content in those cells).
- Use shared schedule context when possible.
- Preserve break/lunch/free and category styling semantics.
- Class-teacher **CT** is black, subject row: code left / CT right; teacher exports add medium **code** under **Std …-Div** when set.
- Report bundle subject-hour labels stay aligned via `shared/reportHoursLabels.js`.

## Data/DB Safety

- Use additive schema evolution.
- Guard migrations with column-existence checks.
- Avoid destructive startup mutations.

## Branching And Delivery

- `main` production, `develop` staging, feature/fix branches from `develop`.
- Hotfixes from `main`, then back-merge into `develop`.
- All changes via PR with validation checklist.

## Required Validation Before Finalizing

- Verify changed files for lint/readability.
- Smoke-check impacted user flow(s).
- Update docs when behavior/config/API changes.

