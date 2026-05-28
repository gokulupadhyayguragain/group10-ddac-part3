# SafeTrace Frontend (Next.js TypeScript)

The frontend is designed to run through the single Compose stack in `code/docker-compose.yml`:

```bash
cd code
SAFETRACE_SECRET_ID= docker compose --profile local-db up --build frontend
```

Browser URLs when the Docker stack is running:

- Frontend: http://localhost:3000
- Backend API: http://localhost:5000

Inside the Docker network, the frontend proxies API requests to `http://backend:5000`.

End-to-end tests run in Docker through the compose `test` profile:

```bash
cd code
SAFETRACE_SECRET_ID= docker compose --profile test up --build --abort-on-container-exit --exit-code-from e2e
```
