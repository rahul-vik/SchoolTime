# CP-SAT on AWS Lambda

Run the OR-Tools solver **only when the API calls it** (timetable generate). No 24/7 Python server on EC2.

| Piece | Where |
|-------|--------|
| Web app | GitHub Pages |
| API | EC2 (Free Tier) + RDS |
| CP-SAT | **Lambda** (container image) |

The Node API still uses `CP_SAT_SOLVER_URL` — set it to your **Lambda Function URL** ending with `/solve`.

---

## 1. Build the Lambda image

From the **repository root**:

```bash
docker build -f solver/cpsat/Dockerfile.lambda -t schooltime-cpsat-lambda .
```

Local test (optional):

```bash
docker run --rm -p 9000:8080 \
  -e CP_SAT_SOLVER_SECRET=test-secret \
  schooltime-cpsat-lambda

# Another terminal:
curl -s http://127.0.0.1:9000/2015-03-31/functions/function/invocations \
  -d '{"requestContext":{"http":{"method":"GET"}},"rawPath":"/health"}'
```

---

## 2. Push to Amazon ECR

Replace `ACCOUNT`, `REGION`:

```bash
aws ecr create-repository --repository-name schooltime-cpsat-lambda --region REGION

aws ecr get-login-password --region REGION | docker login --username AWS --password-stdin ACCOUNT.dkr.ecr.REGION.amazonaws.com

docker tag schooltime-cpsat-lambda:latest ACCOUNT.dkr.ecr.REGION.amazonaws.com/schooltime-cpsat-lambda:latest
docker push ACCOUNT.dkr.ecr.REGION.amazonaws.com/schooltime-cpsat-lambda:latest
```

---

## 3. Create the Lambda function

**Console:** Lambda → **Create function** → **Container image** → select ECR image `schooltime-cpsat-lambda`.

| Setting | Value |
|---------|--------|
| **Architecture** | x86_64 |
| **Memory** | **2048 MB** (3072 if large schools) |
| **Timeout** | **5 min** (300 s); max 15 min if you raise app timeout |
| **Ephemeral storage** | 512 MB default |

**Environment variables:**

| Key | Value |
|-----|--------|
| `CP_SAT_SOLVER_SECRET` | Long random string (same on EC2 API `.env`) |

---

## 4. Function URL (required)

Lambda → **Configuration** → **Function URL** → **Create**:

| Setting | Value |
|---------|--------|
| **Auth type** | **NONE** (app sends `Authorization: Bearer` secret) |
| **CORS** | Optional; API is server-to-server |

Copy the URL, e.g.:

```text
https://abcdefghij.lambda-url.us-east-1.on.aws/
```

Your API env must POST to **`/solve`**:

```env
CP_SAT_SOLVER_URL=https://abcdefghij.lambda-url.us-east-1.on.aws/solve
CP_SAT_SOLVER_SECRET=same-secret-as-lambda-env
TIMETABLE_SOLVER_TIMEOUT_MS=120000
```

> Use **Function URL**, not API Gateway HTTP API, for long solves (API Gateway sync timeout ~29 s).

---

## 5. EC2 API security

- EC2 calls Lambda over **public HTTPS** (no NAT required on EC2).
- Do **not** expose Lambda without `CP_SAT_SOLVER_SECRET` set on both sides.
- Optional: restrict Lambda resource policy to your AWS account / VPC (advanced).

---

## 6. Verify

From your PC:

```bash
curl -s https://YOUR-FUNCTION-URL.lambda-url.REGION.on.aws/health
```

From EC2 after updating `.env` and restarting API:

```bash
curl -s https://YOUR-API/api/health
# timetableSolver.cpsatConfigured should be true when URL is set
```

Generate a timetable with **Hybrid** in the UI.

---

## 7. Free Tier notes

- Lambda: **1M requests** + **400k GB-seconds**/month (12 months).
- Each generate ≈ 2 GB × 60–120 s → budget ~1–3k heavy runs/month within compute free tier.
- **Cold start:** first invoke after idle may take **10–30 s** extra; app falls back to legacy on timeout/failure.
- **RDS + EC2** are unchanged (still one DB, one API server).

---

## 8. Update image after code changes

```bash
docker build -f solver/cpsat/Dockerfile.lambda -t schooltime-cpsat-lambda .
docker push ACCOUNT.dkr.ecr.REGION.amazonaws.com/schooltime-cpsat-lambda:latest
aws lambda update-function-code --function-name schooltime-cpsat-lambda \
  --image-uri ACCOUNT.dkr.ecr.REGION.amazonaws.com/schooltime-cpsat-lambda:latest
```

---

## 9. Helper script

```bash
npm run lambda:cpsat:docker-build
```

See `scripts/aws/deploy-cpsat-lambda.mjs` for a printable checklist (AWS CLI commands).

---

## Related

- Local sidecar: `npm run solver:cpsat`
- EC2 sidecar: `docs/AWS_CP_SAT.md` (Docker on same VM)
- Full stack: `docs/AWS_FREE_TIER_SETUP.md`
