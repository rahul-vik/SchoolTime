# CP-SAT sidecar on Render

SchoolTime on Render is normally **one Node Web Service** + **Postgres**. CP-SAT is a **second Web Service** (Python + OR-Tools). The Node API calls it over HTTP; existing users are unchanged until you set env vars.

## Overview

| Service | Runtime | Role |
|---------|---------|------|
| `schooltime-api` (existing) | Node | API + SQLite/Postgres |
| `schooltime-cpsat` (new) | Docker / Python | OR-Tools solver (`POST /solve`) |
| `schooltime-db` (existing) | Postgres | Data |

```text
Browser → schooltime-api.onrender.com
              ↓  CP_SAT_SOLVER_URL (HTTPS or Internal)
         schooltime-cpsat.onrender.com
```

## 1) Create the CP-SAT Web Service

In [Render Dashboard](https://dashboard.render.com) → **New +** → **Web Service**.

| Setting | Value |
|---------|--------|
| **Name** | `schooltime-cpsat` (used in URL `schooltime-cpsat.onrender.com`) |
| **Region** | Same as your API (lower latency) |
| **Branch** | Same repo as API |
| **Root directory** | (repo root) |
| **Runtime** | **Docker** |
| **Dockerfile path** | `solver/cpsat/Dockerfile` |
| **Docker context** | `.` (repository root) |
| **Plan** | **Starter** minimum; use **Standard** if large schools hit memory limits during solve |

Render sets **`PORT`** automatically; the sidecar reads it (and binds `0.0.0.0`).

**Health check path:** `/health`

Deploy and wait until status is **Live**. Open:

`https://schooltime-cpsat.onrender.com/health`

You should see: `{"ok":true,"service":"schooltime-cpsat"}`

## 2) Wire the API service

Open your existing **`schooltime-api`** service → **Environment**.

Add or update:

```env
CP_SAT_SOLVER_URL=https://schooltime-cpsat.onrender.com/solve
CP_SAT_SOLVER_SECRET=<generate a long random string>
TIMETABLE_SOLVER_TIMEOUT_MS=90000
```

On **`schooltime-cpsat`**, set the **same** `CP_SAT_SOLVER_SECRET` value.

Optional default when the UI does not send a mode:

```env
TIMETABLE_SOLVER=hybrid
```

**Save** → Render redeploys the API.

### Internal URL (paid workspaces)

If both services are in the same region and your workspace supports [private networking](https://render.com/docs/private-network), you can use the **Internal URL** from the CP-SAT service page instead of the public URL, for example:

```env
CP_SAT_SOLVER_URL=http://schooltime-cpsat:10000/solve
```

Use the port shown in the Render dashboard (matches the sidecar `PORT`). Still set `CP_SAT_SOLVER_SECRET` on both services.

## 3) Blueprint (new stack from scratch)

Repo includes `render.yaml` for API + Postgres + CP-SAT. In Render: **New +** → **Blueprint** → connect repo.

After deploy, set manually on **schooltime-api**:

- `CORS_ORIGIN` — your frontend origin(s)
- `VITE_API_BASE_URL` — your public API URL (for static site builds if applicable)
- `CP_SAT_SOLVER_URL` — `https://<schooltime-cpsat-host>/solve`

`CP_SAT_SOLVER_SECRET` is generated on the API service and synced to the sidecar via the blueprint.

## 4) Verify Hybrid / CP-SAT

1. Open the app → **Create** → choose **Hybrid** → generate.
2. In logs (**schooltime-api**), you should **not** see `cp_sat_url_missing`.
3. In the run report (or export last run), `report.solver` should show:
   - `requested: "hybrid"`
   - `applied: "cp_sat"` or `legacy` with `hybridStage` (not only `legacy_preflight` from missing URL).

## 5) Render-specific tips

| Topic | Guidance |
|-------|----------|
| **Cold start** | Free/Starter services sleep; first Hybrid generate after idle can take 30–60s. Raise `TIMETABLE_SOLVER_TIMEOUT_MS` (e.g. 90000–120000). |
| **Memory** | OR-Tools is heavy; upgrade **schooltime-cpsat** if the service restarts with OOM in logs. |
| **Security** | Do not expose the sidecar without `CP_SAT_SOLVER_SECRET`; the public `.onrender.com` URL is fine with Bearer auth. |
| **Rollback** | Remove `CP_SAT_SOLVER_URL` from the API env → everyone uses legacy greedy again. |
| **SQLite on Render** | If you still use SQLite + disk on API, CP-SAT does not need the DB; only the API does. |

## 6) Local vs Render

| | Local | Render |
|--|--------|--------|
| Sidecar start | `npm run solver:cpsat` | Docker Web Service |
| URL | `http://127.0.0.1:8790/solve` | `https://schooltime-cpsat.onrender.com/solve` |
| Bind address | `127.0.0.1` or `0.0.0.0` | `0.0.0.0` (required) |

Local `.env` is unchanged; production uses the Render URL on the API service only.
