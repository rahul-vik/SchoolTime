# CP-SAT sidecar on AWS

The CP-SAT solver is a **separate container** from the Node API. Deploy it only if you use **Hybrid** or **CP-SAT** timetable modes.

## Build and push

From repository root:

```bash
docker build -f solver/cpsat/Dockerfile -t schooltime-cpsat .
```

Push to **Amazon ECR** (same flow as the API image in `docs/AWS_DEPLOYMENT.md`).

## Run on App Runner

1. Create a second App Runner service from `schooltime-cpsat` image.
2. **Environment:**
   - `HOST=0.0.0.0`
   - `CP_SAT_SOLVER_SECRET` — long random string (same value on API)
3. **Health check path:** `/health`
4. **Memory:** at least **1 GB** (OR-Tools is heavy).

## Wire the API

On the **schooltime-api** service:

```env
CP_SAT_SOLVER_URL=https://<cpsat-service-url>/solve
CP_SAT_SOLVER_SECRET=<shared secret>
TIMETABLE_SOLVER_TIMEOUT_MS=90000
```

Verify:

```bash
curl https://<cpsat-service-url>/health
# {"ok":true,...}

curl https://<api-url>/api/health
# timetableSolver.cpsatConfigured: true when URL is set
```

## Security

- Always set `CP_SAT_SOLVER_SECRET` on both services.
- Prefer placing CP-SAT in the same VPC as the API and calling an **internal** URL if your network setup allows.
- Do not expose `/solve` without Bearer auth when the secret is set.

## Local development

Unchanged:

```bash
npm run solver:cpsat
# CP_SAT_SOLVER_URL=http://127.0.0.1:8790/solve
```

## Deprecated

`docs/RENDER_CP_SAT.md` — Render hosting removed; use this file or `docs/AWS_LAMBDA_CPSAT.md`.
