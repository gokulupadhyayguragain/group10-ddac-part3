# STEP 1 - Local Setup

## Prerequisites
- Docker and Docker Compose
- Git
- Optional: VS Code

## 1. Start the stack
1. Clone the repository and enter the repository root.
2. Leave `.env` absent for normal local development, or clear `SAFETRACE_SECRET_ID` when running locally.
3. Start the local stack with `SAFETRACE_SECRET_ID= docker compose --profile local-db up --build -d`.
4. Check `http://localhost:5000/api/health` and open `http://localhost:3000`.

## 2. Useful commands
```bash
cd group10-ddac-part3
SAFETRACE_SECRET_ID= docker compose --profile local-db up --build -d
SAFETRACE_SECRET_ID= docker compose --profile test up --build --abort-on-container-exit --exit-code-from e2e
docker compose down -v
```

For local manual testing without a Resend key, the backend logs the verification code. To show the code in the registration UI during local development only, run:

```bash
SAFETRACE_SECRET_ID= NODE_ENV=development AUTH_DEV_EXPOSE_VERIFICATION_CODE=true docker compose --profile local-db up --build -d
```

## 3. Workspace layout
- `backend_ts/` contains the Express and PostgreSQL API.
- `frontend_next/` contains the Next.js frontend.
- `docker-compose.yml` is the single runtime entry point.
- `assignments/` holds the generated submission artifacts.

## 4. Troubleshooting
- If port `3000` or `5000` is busy, stop the conflicting process and restart the stack.
- If the backend is unhealthy locally, confirm the `local-db` profile is enabled so the Postgres container is running.
- If the frontend cannot reach the API, verify the Docker default `BACKEND_URL=http://backend:5000`.
