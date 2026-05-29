# STEP 2 - Backend Service

## Stack
- Node.js 20
- TypeScript
- Express
- PostgreSQL via `pg`
- JWT auth and bcrypt password hashing

## 1. Runtime location
The backend lives in `backend_ts` and is started by Docker Compose as the `backend` service.

## 2. Core environment variables
Production EC2 `.env` should contain only:

- `AWS_REGION`
- `SAFETRACE_SECRET_ID`

The backend loads the real runtime values from AWS Secrets Manager:

- `DATABASE_URL`
- `JWT_SECRET`
- `RESEND_API_KEY` and `RESEND_FROM_EMAIL`
- `AUTH_VERIFICATION_TTL_MINUTES`
- `TRUST_PROXY`
- optional Google OAuth values
- Phase B full serverless uses a separate Lambda backend and a separate Secrets Manager secret.

Use `docs/10SECRETS_MANAGER_VALUES.md` for the complete JSON.

## 3. Common commands
```bash
cd group10-ddac-part3
SAFETRACE_SECRET_ID= docker compose --profile local-db up -d db backend
docker compose exec backend npm run build
docker compose exec backend npm run start
```

For host-based development, use `npm run dev` inside `backend_ts`, but the preferred path for this project is Docker.

## 4. API surface
- `/api/auth/*` for register, login, and profile
- `/api/auth/verify-email` and `/api/auth/resend-verification` for rate-limited email verification
- `/api/persons/*` for missing-person records
- `/api/sightings/*` for sightings and lookup
- `/api/alerts/*` for alert history
- `/api/admin/*` for seed and user management
- Phase A optional extension only: `/api/uploads/photo` for authenticated multipart S3 photo uploads

## 5. Data model
The backend creates the required PostgreSQL tables on startup and keeps the schema aligned with the app routes.

## 6. Validation
- `GET /api/health` should return `ok`.
- Invalid sighting input should return HTTP 400, not crash the service.
- JWT-protected routes should reject missing or bad tokens.
