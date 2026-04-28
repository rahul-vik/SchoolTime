# Changelog

All notable changes to SchoolTime are documented in this file.

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
