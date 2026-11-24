# API Reference

Base URL: `http://localhost:4310/api` (port configurable via `backend/.env` `PORT`).

All responses are JSON. Errors follow a consistent shape:

```json
{ "error": { "code": "CAPACITY_EXCEEDED", "message": "human-readable explanation" } }
```

| HTTP status | error.code | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Request body failed Zod validation (see `details`) |
| 400 | `VALIDATION` / `DOCTOR_SLOT_MISMATCH` | Domain-level bad input |
| 403 | `FORBIDDEN` | The demo simulation is switched off on this server (production without `ENABLE_SIMULATION=1`) |
| 404 | `NOT_FOUND` | Doctor/slot/token/patient/simulation run not found |
| 409 | `INVALID_TRANSITION` | Illegal token state transition attempted |
| 409 | `CAPACITY_EXCEEDED` | Invariant guard fired (should never happen in normal operation) |
| 409 | `SLOT_CLOSED` | Operation attempted against a non-OPEN slot |
| 409 | `NO_SHOW_GRACE_PERIOD_ACTIVE` | No-show attempted before the configured grace period elapsed |
| 409 | `CONFLICT` | Postgres serialization conflict exhausted its retries |
| 500 | `INTERNAL_ERROR` | Unexpected error — stack traces are never sent to the client |

## Access and errors added by the hardening

- **Staff key:** when the server has `API_KEY` set, every `/api` request needs an `X-API-Key` header, otherwise 401 `UNAUTHORIZED`. `GET /health` is always open.
- **Limits:** 429 `RATE_LIMITED` over the per-minute limit; 413 `PAYLOAD_TOO_LARGE` for bodies over 50 KB; 400 `VALIDATION_ERROR` for malformed JSON or fields that break the length, format or range rules.
- **Rule conflicts (409):** `DUPLICATE_TOKEN` (the patient already has a live ticket for that hour), `SLOT_OVERLAP` (the doctor already has an overlapping hour), `DOCTOR_NOT_AVAILABLE` (doctor inactive or unavailable), `CONFLICT` (two requests changed the same thing at once: retry).

## Doctors

### `GET /api/doctors`
Returns all doctors.

### `POST /api/doctors`
Body: `{ "name": string, "specialization": string }` → 201, the created doctor.

### `GET /api/doctors/:id`
→ 200 doctor, or 404.

### `PATCH /api/doctors/:id`
Body (all optional): `{ "name"?, "specialization"?, "active"? }` → 200 updated doctor.

### `POST /api/doctors/:id/delay`
Body: `{ "delayMinutes": number }` → 200 `{ doctor, recalculated: number }`. Recalculates every OPEN slot for the doctor; never revokes already-allocated tokens (see `docs/algorithm.md` §6).

**Example**
```bash
curl -X POST http://localhost:4310/api/doctors/$ID/delay -H "Content-Type: application/json" -d '{"delayMinutes":20}'
```

### `POST /api/doctors/:id/unavailable`
Body: `{ "reason": string }` → 200 `{ doctor, reallocatedCount, heldWaitingCount }`. Closes the doctor's open slots and reallocates/holds affected patients (see `docs/algorithm.md` §9).

### `POST /api/doctors/:id/available`
No body → 200 updated doctor. Clears `unavailable`/delay; does **not** reopen slots automatically.

## Slots

### `GET /api/slots?doctorId=`
Optional `doctorId` filter. Returns slots ordered by start time.

### `POST /api/slots`
Body: `{ doctorId, date, startTime, endTime, maximumCapacity, emergencyReserve?, paidReserve? }` → 201 created slot.

### `GET /api/slots/:id` → 200 slot, or 404.

### `PATCH /api/slots/:id`
Body (either or both): `{ "maximumCapacity"?: number, "status"?: "OPEN"|"PAUSED"|"CLOSED"|"COMPLETED" }`. A capacity reduction below current occupancy triggers displacement (§ edge-cases.md); setting `CLOSED`/`PAUSED` displaces all allocated-not-called occupants.

### `POST /api/slots/:id/reallocate`
No body → 200 `{ capacity, decisions }`. Manually re-runs the allocation engine for this slot's current `WAITING` tokens — useful after an out-of-band change or just to inspect current decisions without waiting for the next trigger.

## Tokens

### `GET /api/tokens?doctorId=&slotId=&status=`
All filters optional.

### `POST /api/tokens`
Body: `{ patientId? | patientName, patientPhone?, doctorId, slotId, source: "ONLINE"|"WALK_IN"|"PAID_PRIORITY"|"FOLLOW_UP" }` (use `POST /api/emergencies` for `EMERGENCY`) → 201 the created token, `status` will be `ALLOCATED` if capacity was immediately available or `WAITING` otherwise.

**Example**
```bash
curl -X POST http://localhost:4310/api/tokens -H "Content-Type: application/json" \
  -d '{"doctorId":"...","slotId":"...","source":"WALK_IN","patientName":"Rahul Verma"}'
```

### `GET /api/tokens/:id`
→ 200 token including `events` (its full `AllocationEvent` history — this is what backs the "Why?" panel).

### `POST /api/tokens/:id/cancel` → 200 updated token, or 409 `INVALID_TRANSITION` if not legal from its current status.

### `POST /api/tokens/:id/no-show` → 200 updated token, or 409 `NO_SHOW_GRACE_PERIOD_ACTIVE` / `INVALID_TRANSITION`.

### `POST /api/tokens/:id/call` → 200, `ALLOCATED → CALLED`.

### `POST /api/tokens/:id/start` → 200, `CALLED → IN_PROGRESS`.

### `POST /api/tokens/:id/complete` → 200, `IN_PROGRESS → COMPLETED`.

## Emergencies

### `POST /api/emergencies`
Body: `{ patientName, patientPhone?, doctorId, slotId?, reason }` (omit `slotId` to use the doctor's earliest OPEN slot) → 201 `{ token, displaced: { displacedTokenId, movedToSlotId } | null }`.

## Dashboard

### `GET /api/dashboard/overview`
KPI summary: `{ date, doctorsAvailable, doctorsTotal, activeSlots, totalTokens, waitingPatients, completedConsultations, averageWaitMinutes, emergencyCases, noShows, cancellations, capacityUtilization, invariants }`. `invariants` is a live-computed `{ capacityViolations, doubleAllocations, invalidTransitionAttemptsBlocked, orphanedTokens }` block — these should always read 0; see `docs/algorithm.md` §1.

### `GET /api/dashboard/doctors`
Per-doctor `{ id, name, specialization, active, unavailable, delayMinutes, capacity, occupied, utilization }`.

### `GET /api/dashboard/slots`
Per-slot `{ id, doctorId, doctorName, startTime, endTime, status, maximumCapacity, occupied }`.

### `GET /api/dashboard/tokens`
All tokens with patient/doctor/slot included, newest first.


### `GET /api/dashboard/board`
Everything the Today screen draws, in one request: `generatedAt`, the priority `config` (base points per source, aging interval and points, reserve-release wait), and `doctors`. Each doctor has `slots`; each slot has `maximumCapacity`, `effectiveCapacity` (lowered when the doctor is delayed), `emergencyReserve`, `paidReserve`, `reserveReleased`, `placesTaken`, `holding` (tickets that hold a place) and `waiting` (tickets waiting for one). Each ticket there is `{ id, tokenNumber, source, status, patientName, waitMinutes, priorityScore }`.

### `GET /api/dashboard/activity?limit=40`
The most recent allocation events (1 to 200, newest first), each with the ticket number, patient name, source, doctor name and hour attached so it can be read as a sentence, plus the original technical `reason`.

## Simulation

### `POST /api/simulation/run`
Body must be `{"confirm":"replace-all-data"}` (otherwise 400 `VALIDATION`): the run deletes every doctor, slot, patient and token. In production it returns 403 `FORBIDDEN` unless `ENABLE_SIMULATION=1`. On success → 201, the full simulation run result (timeline, per-doctor metrics, wait times, event counts). Resets and reseeds 3 doctors / 12 slots, then drives the Demo Day scenario through the real service layer against the real database. See `docs/algorithm.md` and `simulation/reports/demoDay.md` for a captured example run.

### `GET /api/simulation/:id`
→ 200 the stored run (in-process memory — see `docs/edge-cases.md` "Known limitations"), or 404 if the process has restarted since that run.
