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

## Key decisions and correctness
- Candidate input is validated in full before a batch transaction is written; malformed rows cause a 400 and no partial batch.
- Batch state transitions are checked server-side. Role checks and district ownership are enforced.
- District approvals are unique per `(batchId, officerId)`. Two different officers must approve. The database uniqueness constraint protects simultaneous duplicate approvals.
- Large batches (`>50`) go through `QUALITY_REVIEW`; quality review action is a known next implementation item before full production use.
- State approval creates certificates in a transaction. `candidateId`, `certificateNo`, and `verificationToken` are unique. A stable BullMQ job ID per candidate prevents duplicate enqueueing.
- WhatsApp delivery is asynchronous with exponential retries; the worker simulates timeouts. Delivery status persistence and a real provider adapter are next steps.
- Returning a batch clears district approvals. This is a deliberate policy: corrected candidate data must be re-reviewed.
- Audit events record actor, action, timestamp and relevant metadata.

## Tests
```bash
cd backend && npm install && npm test
```
The included tests cover basic invariants. Add PostgreSQL integration/concurrency tests before production; see DEPLOYMENT.md.

## Known limitations
CSV upload UI/parser, PDF rendering/storage, quality-team decision endpoint, real WhatsApp adapter, JWT/OIDC authentication, SSE/WebSocket live updates, and comprehensive integration tests are not fully implemented in this time-boxed MVP. The queue worker currently logs a successful mock delivery rather than sending a real message.

## AI usage
AI assistance may be used for scaffolding and review. The team must inspect and understand every submitted line, run the application and tests, and disclose AI usage accurately in the demo.
