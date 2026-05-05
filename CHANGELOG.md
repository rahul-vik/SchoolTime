# Changelog

All notable changes to SchoolTime are documented in this file.

## [1.0.8] - 2026-05-05

- Enforced single-teacher lock for each division-subject during generation so one division cannot receive the same subject from multiple teachers in a run.
- Updated docs and core rules to clarify deterministic division-subject teacher assignment expectations.

## [1.0.7] - 2026-05-05

- Added automated post-generation timetable validation with structured findings, safe low-risk auto-fixes, approval-gated handling for higher-risk findings, and audit trail events.
- Added new school and creator portal Auto Fixing views/APIs to list findings and trigger approved apply actions, with improved mobile-adaptive creator UX and sidebar navigation.
- Added tenant state migration/backfill tooling, IST timestamp consistency improvements, and release governance/docs updates including backend validation unit coverage.

## [1.0.6] - 2026-05-01

- Timetable PDF/Excel and grid: **CT** for class-teacher periods (black, subject left / CT right); teacher exports show division **medium code** under Std–Div when configured.
- Summary reports bundle: division completion **CT** inline after subject name; weekly subject hours use short category labels and language **codes**; shared `shared/reportHoursLabels.js` kept in sync with exports and Reports UI.
- Pre-push CI parity via Husky (`npm run verify:push`); docs/rules/README updates; export helper cleanup.

## [1.0.5] - 2026-04-30

- Fixed PostgreSQL compatibility for usage analytics (`/api/usage`) by avoiding `GROUP BY` on the reserved alias `day`; responses keep the same `{ day, count }` shape.

## [1.0.4] - 2026-04-29

- Added class-teacher uniqueness enforcement so a class can be assigned as class teacher to only one teacher at a time.
- Locked already-assigned class-teacher divisions in teacher edit/add UI and added conflict-safe save validation.
- Added pre-release conflict prevention flow (`npm run release:prepare`) to pre-merge main and regenerate generated docs before release pushes.

## [1.0.3] - 2026-04-28

- Improved timetable reliability by enforcing teacher morning/evening free-period limits as strict session-wise capacity rules.
- Added clearer coverage and diagnostics UX, including actionable rejection fixes, class-context shortage labels, and guidance links.
- Hardened state persistence for latest timetable and download history across login/logout sessions.
- Introduced stricter release/version governance with SemVer checks, branch-version validation, and visible sidebar build labels (`Vx.y.z (build)` with local dev tags).

## [1.0.2] - 2026-04-27

- Added a dedicated Role Access section in the platform portal to manage permissions per role and add custom roles.
- Enforced role permissions end-to-end across tenant APIs and school app UI using policy-driven runtime checks.
- Improved platform portal session handling so stale creator tokens auto-clear and return users to sign in cleanly.
- Implemented SMTP-based password reset email delivery and reset-link token prefill in the user app.

## [1.0.1] - 2026-04-27

- Replaced direct credit top-up with a purchase-request workflow: schools submit requests and platform admins approve/reject in the creator portal before credits are added.
- Added creator portal capabilities for organization-level purchase approvals, richer platform operations, and safer org lifecycle handling.
- Improved school-app UX with clearer auth errors, settings-integrated purchase flow, cleaner balance/profile UI, and better human-readable activity/audit logs.
- Added smarter onboarding defaults from organization data (school name/code and live-date academic year window) and improved placeholder logo behavior.
- Updated API/docs/runtime wiring for platform settings, approval routes, and audit clarity across setup sections.

## [1.0.0] - 2026-04-27

- Initial production baseline, deployment automation, and governance setup.
- Postgres runtime support and migration tooling.
- Export and dashboard improvements.
