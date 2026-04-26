# Production Readiness Checklist

Use this checklist before promoting `develop` to `main`.

## Build And Runtime

- [ ] `npm ci`
- [ ] `npm run build`
- [ ] `npm run smoke:prod`
- [ ] API starts in production env
- [ ] `/api/health` returns `ok: true`

## Security

- [ ] `JWT_SECRET` is strong (32+ chars)
- [ ] `CORS_ORIGIN` is explicit (no wildcard)
- [ ] `npm run audit:security` passes or accepted risks documented
- [ ] HTTPS enabled at reverse proxy

## Data Safety

- [ ] Backup script executed successfully
- [ ] Restore drill executed at least once
- [ ] DB storage path persisted (`server/data`)

## Operations

- [ ] PM2/systemd process supervision configured
- [ ] Logs collection in place
- [ ] Alert plan defined (service down / repeated restarts)

## Release Controls

- [ ] CI workflow passed on PR
- [ ] PR checklist completed
- [ ] Release tag prepared

