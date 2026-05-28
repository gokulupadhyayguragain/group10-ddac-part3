# SafeTrace Backend (TypeScript)

This is an Express + TypeScript backend that uses `pg` for Postgres access.

Run it through the single Compose stack in `code/docker-compose.yml`:

```bash
cd code
SAFETRACE_SECRET_ID= docker compose --profile local-db up --build backend
```

The API exposes auth, persons, sightings, admin users, and health routes under `/api`.
