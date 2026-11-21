# Local setup guide

Gets you from a fresh clone to a running system with demo data and passing tests.

## Prerequisites
- Git, and either **Option A** Docker Desktop (Compose v2), or **Option B** Node.js 22+ plus PostgreSQL 16 and Redis 7 running locally.

```bash
git clone <repo-url> certiflow && cd certiflow
```

## Option A — Docker (recommended, one command)
```bash
docker compose up --build
```
On start the API container applies migrations (`prisma migrate deploy`), seeds demo data (`npm run seed`) and starts the server.

| Service | URL |
|---|---|
| UI | http://localhost:5173 |
| API health | http://localhost:4000/health |

If you changed DB credentials or the schema and see auth/migration errors, reset the volume: `docker compose down -v` then `docker compose up --build`.

## Option B — Without Docker
1. Create the database: `createdb certiflow` (or create user/DB to match `DATABASE_URL`). Start Redis on port 6379.
2. Configure the backend (the real `.env` is git-ignored):
   ```bash
   cp backend/.env.example backend/.env   # edit DATABASE_URL to match your Postgres user/password
   ```
3. Install, migrate and seed:
   ```bash
   cd backend
   npm install
   npx prisma generate
   npx prisma migrate deploy
   npm run seed
   npm run dev          # API on :4000
   ```
4. In a second terminal:
   ```bash
   cd frontend
   npm install
   npm run dev          # UI on :5173
   ```

## Demo data and identities
The seed creates the users below and one demo batch ("Demo batch - Web Development"). Use the role switcher in the UI, or send the `x-demo-user` header.

| User | Id | Role |
|---|---|---|
| Anika | `anika` | Training centre |
| Dev, Meera, Kabir | `dev`, `meera`, `kabir` | District officers (Hyderabad) |
| Neha | `neha` | Quality officer |
| Farah | `farah` | State officer |

## Try the full flow
1. As the centre, submit the demo batch (or create one via `POST /api/batches`).
2. Batches over 50 candidates: quality officer approves first.
3. As two **different** Hyderabad district officers (e.g. Dev and Meera), approve → batch moves to `STATE_REVIEW`.
4. As Farah, **Final approve & issue** → batch becomes `APPROVED` and certificates are created.
5. Open `GET /api/verify/<verificationToken>` (no login) to verify a certificate.

Quick API check:
```bash
curl http://localhost:4000/health
curl -H "x-demo-user: anika" http://localhost:4000/api/batches
```

## Run the tests
```bash
cd backend
npm install
npm test
```
The current suite is pure invariant checks and needs no database or Redis.

## Troubleshooting
- **Port in use** (4000/5173/5432/6379): stop the other process or change the port mapping.
- **`P1000/P1001` Prisma errors**: `DATABASE_URL` doesn't match your Postgres; fix `backend/.env`.
- **Re-seed from scratch**: `npx prisma migrate reset` (Option B) or `docker compose down -v` (Option A).
- Redis is only needed for the delivery queue; final approval does not depend on it.
