# STEP 3 - Frontend Service

## Stack
- Next.js
- React 18
- TypeScript
- Tailwind CSS
- Leaflet for the map view

## 1. Runtime location
The frontend lives in `frontend_next` and runs as the `frontend` service on port `3000`.

## 2. Main routes
- `/` dashboard overview
- `/login` and `/register` auth entry points
- `/profile` account page
- `/report` missing-person report flow
- `/search` map and case lookup
- `/sightings` sighting review and submission
- `/alerts` alert history
- `/admin` admin tools and seed action
- `/resources` support material

## 3. Frontend environment
- `BACKEND_URL=http://backend:5000` inside Docker
- `NEXT_TELEMETRY_DISABLED=1`

## 4. Common commands
```bash
cd frontend_next
npm run dev
npm run build
npm run start
npm run test:e2e
```

## 5. Docker workflow
1. Start the full stack from the repository root.
2. Open the frontend at `http://localhost:3000`.
3. Use the login or admin seed flow to load demo data.
4. Verify that route changes stay isolated and the shell remains compact.

## 6. UI structure
The frontend uses a fixed sidebar shell, compact cards, and modal overlays so the route pages stay focused instead of crowded.
