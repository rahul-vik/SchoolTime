# Changelog

All notable changes to SchoolTime are documented in this file.

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
