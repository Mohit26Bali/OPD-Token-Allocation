# Architecture

## Layering

```
domain/            pure functions, zero Express/Prisma imports
  allocation/       priority scoring, the allocation engine, displacement/reallocation ranking
  scheduling/        effective-capacity math (delay approximation)
  tokens/             token status state machine
  simulation/         the Demo Day scenario script (data only, no logic)

repositories/       thin Prisma data access, one file per model, all functions take a `TxClient`
                     so every call can run inside or outside a transaction interchangeably

services/           the only layer that touches BOTH the domain engine and Prisma; every
                     allocation-affecting operation is wrapped in withSerializableTransaction

controllers/         thin HTTP handlers — parse req, call a service, shape the response
routes/               Express routers, one per resource
validators/           Zod schemas for request bodies
middleware/           validateBody, asyncHandler, centralized errorHandler
```

**Why this shape**: the assignment's evaluation criteria emphasize algorithm quality and code clarity over infrastructure. Keeping `domain/` free of Express and Prisma imports means the entire allocation algorithm — capacity math, priority scoring, displacement/reallocation ranking, the state machine — is unit-testable with plain objects and zero database, which is what `tests/domain/*.test.ts` (43 tests) actually does. `services/` is the single seam where domain logic meets persistence, so every allocation-affecting HTTP request and every simulation step goes through the exact same code path — there is structurally no way for the simulation to diverge from what the API does, because it calls the same functions (`simulation/runner.ts` imports `backend/src/services/simulationService.ts` directly).

## Why plain Node + local Postgres, no Docker/Redis/Kafka/microservices

The assignment explicitly warns against unnecessary infrastructure for what is an internship-scale project. This system runs as a single Express process against a single Postgres database. A `docker-compose.yml` is included for portability (so a grader without a local Postgres install can still run it), but the development and testing path actually exercised in this repo uses a real, locally installed PostgreSQL 17 instance — not a mock, not sqlite, not an in-memory substitute — which is what makes the concurrency tests in `tests/integration/concurrency.test.ts` meaningful (they exercise real Postgres Serializable-isolation conflict detection, which an in-memory stand-in cannot reproduce).

## Data flow for one allocation-affecting request

```
HTTP request
  → routes/*.ts        (Express router)
  → middleware/validate  (Zod)
  → controllers/*.ts    (thin: parse, call service, respond)
  → services/*.ts       (opens withSerializableTransaction)
       → repositories/*.ts  (read current Prisma rows)
       → repositories/mappers.ts  (Prisma row → plain domain type)
       → domain/allocation/allocationEngine.ts  (pure decision-making)
       → repositories/*.ts  (persist decisions: token updates + AllocationEvent rows)
       → invariant assertion (occupied <= effectiveCapacity, else throw and roll back)
  ← JSON response
```

## Database

PostgreSQL via Prisma. Schema: `Doctor`, `OpdSlot`, `Patient`, `Token`, `AllocationEvent` (append-only audit log — see `docs/algorithm.md` §1 and §12). Indexes on `OpdSlot(doctorId, date)`, `Token(slotId, status)`, `Token(doctorId, status)`, `AllocationEvent(tokenId)`, `AllocationEvent(slotId)`, `AllocationEvent(createdAt)` — chosen because every hot-path query in `services/` and `dashboardService.ts` filters by exactly these column combinations (capacity checks by slot+status, doctor views by doctor+status, event history by token).

## Simulation

`simulation/runner.ts` is a thin CLI entrypoint. All scenario logic lives in `backend/src/domain/simulation/demoDayScenario.ts` (data: what happens and when) and is executed by `backend/src/services/simulationService.ts`, which resets a clean set of 3 doctors/12 slots and drives the timeline through `tokenService`, `emergencyService`, `doctorService`, and `slotService` — the identical functions the REST API calls. The runner writes `simulation/reports/demoDay.json` (machine-readable) and `demoDay.md` (human-readable) and is also exposed over HTTP via `POST /api/simulation/run`.

## Concurrency

See `docs/algorithm.md` §10. Short version: PostgreSQL Serializable-isolation transactions with bounded retry on conflict (Prisma error `P2034`), proven against a real database in `tests/integration/concurrency.test.ts`.
