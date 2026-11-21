# CertiFlow — Skilling Certificate Issuance Platform

> **Requirements note:** Training centres upload candidate batches; district officers review with two distinct approvals; batches above 50 candidates enter quality review; the state office gives final approval; certificates are delivered asynchronously over a WhatsApp stand-in; the public can verify certificates without login. All decisions are audited. Returned batches reset prior district approvals (documented choice: corrections invalidate earlier approvals).

## Stack
React + Vite · Node.js + Express + TypeScript · PostgreSQL + Prisma · Redis + BullMQ · Docker Compose.

## Run locally
Prerequisite: Docker Desktop / Docker Engine and Compose.

```bash
docker compose up --build
```
- UI: http://localhost:5173
- API health: http://localhost:4000/health
- Demo identities: Anika (`anika`), Dev (`dev`), Meera (`meera`), Kabir (`kabir`), Neha (`neha`), Farah (`farah`). UI has a role switcher.

The API uses `x-demo-user` for a hackathon demo identity. This is intentionally not production authentication; replace it with verified JWT/OIDC before deployment.

## Core API
All API calls except `/health` require `x-demo-user`.
- `POST /api/batches` — atomic validated JSON batch creation. Body: `{ "name":"Batch A", "district":"Hyderabad", "candidates":[{"name":"Aarav Sharma","email":"a@example.com","phone":"+919900000001","course":"Web Development","externalId":"C-001"}] }`
- `GET /api/batches` and `GET /api/batches/:id` — list and inspect, including audit timeline.
- `POST /api/batches/:id/submit` — centre submits.
- `POST /api/batches/:id/district-decision` — `{ "decision":"APPROVE" }`, `RETURN` or `REJECT`; two distinct officers are required.
- `POST /api/batches/:id/state-approve` — state approval and certificate creation.
- `POST /api/batches/:id/cancel/:certificateId` — state office cancellation.
- `GET /api/verify/:token` — public verification result; no login required.

- `POST /api/batches/:id/quality-decision` — quality team `APPROVE`, `RETURN` or `REJECT` for batches above 50 candidates.

## How the system is put together
```
React + Vite UI (role switcher, sends x-demo-user)
        │ REST/JSON
Express + TypeScript API ── middleware/auth.ts (identity + role check)
        │                    routes/batches.ts  (validation, ownership checks)
        │                    services/workflow.ts (state machine, transactions)
        ├── PostgreSQL via Prisma (batches, candidates, approvals, certificates, audit events)
        └── Redis + BullMQ queue/worker (asynchronous certificate delivery stand-in)
```
- **Routes** validate input with zod and check role and district ownership, then delegate to the **workflow service**, which owns every state transition.
- **Batch lifecycle:** `DRAFT → (QUALITY_REVIEW if >50 candidates) → DISTRICT_REVIEW → STATE_REVIEW → APPROVED`. `RETURNED` goes back to the centre for correction and resubmission; `REJECTED` is terminal.
- **Data:** each batch has many candidates and approvals; each candidate has at most one certificate; every action writes an audit event.
- **Public verification** (`/api/verify/:token`) is the only route without login.

## Key technical decisions, with reasons
- **Validate the whole batch before writing.** Malformed rows cause a 400 and nothing is saved, so centres never end up with half-uploaded batches.
- **State machine enforced server-side in one service.** The UI can't skip steps, and the rules live in one place that is easy to test and review.
- **Row lock per decision (`SELECT … FOR UPDATE`) inside a transaction.** Concurrent approvals on the same batch are processed one at a time, so the approval count and status change can't race.
- **Unique `(batchId, officerId)` approvals, two required.** The database constraint guarantees one officer can't approve twice, even under simultaneous requests.
- **Returning a batch clears district approvals.** Corrected data must be re-reviewed, so earlier approvals no longer apply.
- **Batches above 50 candidates go through quality review first.** This puts extra scrutiny where the risk is largest.
- **Final approval issues certificates synchronously, in one transaction, with a bulk insert.** The batch becomes `APPROVED` only if every certificate exists, and the request stays fast with no dependency on Redis. Unique `candidateId`, `certificateNo` and `verificationToken` plus `skipDuplicates` make retries safe. The transaction timeout is raised to 60s for large batches.
- **Delivery is decoupled from approval.** BullMQ with retries and exponential backoff (stable job ID per candidate prevents duplicates) is available for the WhatsApp stand-in. It is not triggered by state approval, so a Redis outage can't block or fail an approval.
- **Audit event for every transition.** Records actor, action, timestamp and metadata for traceability.
- **Demo identity via `x-demo-user`.** Fastest way to demo roles; explicitly not production auth.

## Tests
```bash
cd backend && npm install && npm test
```
The included tests cover basic invariants. Add PostgreSQL integration/concurrency tests before production; see DEPLOYMENT.md.

## Known limitations
CSV upload UI/parser, PDF rendering/storage, real WhatsApp adapter, automatic delivery after final approval, delivery status persistence, JWT/OIDC authentication, SSE/WebSocket live updates, and comprehensive integration tests are not fully implemented in this time-boxed MVP. The queue worker currently logs a successful mock delivery rather than sending a real message.

## AI usage
AI assistance may be used for scaffolding and review. The team must inspect and understand every submitted line, run the application and tests, and disclose AI usage accurately in the demo.
