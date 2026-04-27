# SchoolTime Implementation Backlog

This backlog tracks architecture-hardening work in execution order.

## Status Legend

- `[x]` Completed
- `[ ]` Planned / in progress

## Phase 1: DB Reliability (Current Sprint)

- [x] Add Postgres schema version metadata and startup guard.
- [x] Add Postgres integration check script validating DB adapter operations.
- [x] Add npm command for Postgres integration check.
- [ ] Wire Postgres integration check into CI for a Postgres-enabled pipeline target.
- [ ] Add SQLite schema metadata parity and compatibility guard.

## Phase 2: Test Depth And Regression Safety

- [ ] Add API integration tests for auth/state/timetable routes.
- [ ] Add export regression fixtures for PDF/Excel deterministic checks.
- [ ] Add coverage threshold for core backend modules.

## Phase 3: Observability And Ops

- [ ] Add structured request logging with request-id correlation.
- [ ] Add error-classification middleware and operational metrics.
- [ ] Define SLO/error-budget alerts for production incidents.

## Phase 4: Security Hardening

- [ ] Unify login failure message in production mode to avoid user enumeration.
- [ ] Add optional stricter rate limits for auth endpoints.
- [ ] Add secret scanning workflow gate before merge.

