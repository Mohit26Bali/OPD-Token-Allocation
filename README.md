# OPD Token Allocation Engine

An API-based hospital OPD token allocation system with elastic capacity management, built for the "OPD Token Allocation Engine" backend-intern assignment. The core deliverable is the allocation **algorithm** (`backend/src/domain/allocation/`) — a pure, dependency-free, unit-tested TypeScript module — wired into a transactional REST API, a React dashboard, and a deterministic multi-doctor simulation.

Read `docs/algorithm.md` first — it explains every policy decision and why. `docs/edge-cases.md` maps every edge case to the test that proves it. `docs/architecture.md` explains the layering. `docs/api.md` is the endpoint reference.

## Stack

Node.js + TypeScript + Express + PostgreSQL + Prisma + Zod on the backend; Vitest + Supertest for tests; a plain TypeScript simulation runner that reuses the backend's own service layer; React + Vite + Tailwind + Recharts on the frontend. No Docker/Kubernetes/Redis/Kafka/microservices — see `docs/architecture.md` for why.

## Prerequisites

- Node.js 20+
- A local PostgreSQL instance (v14+; this project was built and tested against Postgres 17 running natively on Windows — a `docker-compose.yml` is included as an alternative if you'd rather not install Postgres directly)

---

## 1. Setup (one-time)

Run these from the repository root (`Token Allocation/`).

```bash
npm install
```

This installs all three workspaces (`backend`, `simulation`, `frontend`) in one go.

**Create the two databases** (dev + test) in your local Postgres. In PowerShell, using `psql` (adjust the path to your Postgres install if needed):

```powershell
$env:PGPASSWORD = 'your_password'
& 'C:\Program Files\PostgreSQL\17\bin\psql.exe' -U postgres -h localhost -c "CREATE DATABASE opd_token_engine;"
& 'C:\Program Files\PostgreSQL\17\bin\psql.exe' -U postgres -h localhost -c "CREATE DATABASE opd_token_engine_test;"
```

On macOS/Linux with `psql` on your `PATH`:

```bash
psql -U postgres -c "CREATE DATABASE opd_token_engine;"
psql -U postgres -c "CREATE DATABASE opd_token_engine_test;"
```

**Configure credentials** — copy the example env file and fill in your real password. `backend/.env` is git-ignored; never put a real password in `.env.example` or anywhere else.

```bash
cp backend/.env.example backend/.env
# then edit backend/.env:
#   DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/opd_token_engine?schema=public"
#   TEST_DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/opd_token_engine_test?schema=public"
#   PORT=4310
```

**Apply the schema and seed sample data:**

```bash
cd backend
npm run migrate   # applies the Prisma schema to opd_token_engine
npm run seed       # seeds 3 doctors, 12 slots, 10 sample tokens
```

---

## 2. Running the project

You need **two terminals** running at the same time — one for the API, one for the dashboard.

**Terminal 1 — backend API:**

```bash
cd backend
npm run dev
```

Leave this running. It listens on **<http://localhost:4310>** (change `PORT` in `backend/.env` if that port is taken on your machine — something else may already be using 4000, which is why this project defaults to 4310).

**Terminal 2 — frontend dashboard:**

```bash
cd frontend
npm run dev
```

Leave this running too. It listens on **<http://localhost:5173>** and proxies all `/api/*` requests to the backend automatically (see `frontend/vite.config.ts`) — you don't need to configure a separate API URL.

**Open the dashboard:** go to **<http://localhost:5173>** in your browser. If the page loads but shows "Cannot reach the server," the backend (Terminal 1) isn't running or crashed — check its terminal output.

To stop either server, `Ctrl+C` in its terminal.

---

## 3. Using the dashboard

The screen is written in plain words and is built to answer "what is happening right now, and why?". It has two tabs: **Today** and **Demo day**. A "How this screen works" box at the top explains the idea in three steps (you can hide it; "? How does this screen work" brings it back).

### The idea in three lines

1. A patient gets a **ticket** (a "token", like `A012`) for one doctor and one hour. The colour of the ticket shows how the patient came: walk-in, online booking, follow-up visit, paid priority or emergency.
2. Every hour has a fixed number of **places**. A free place goes to the ticket straight away. If the hour is full, the ticket **waits**, and the highest priority gets the next place that opens. Priority is the starting points of the ticket type plus 1 for every 10 minutes waited, so nobody waits forever.
3. A few places in every hour are **kept free for emergencies (🚑) and paid-priority patients (⭐)**. If an hour is completely full, an emergency still gets in by moving the lowest-priority patient to another hour (or back to waiting, never dropped).

### Today tab

- **One sentence and four numbers** at the top: how many patients have a place, how many are waiting, how many are with a doctor, and how long people wait for a place. A small line confirms the safety check (no hour has more patients than places).
- **One card per doctor, with one row per hour.** Each row is a strip of boxes, one box per place: a coloured box is a patient (click it for their story), a dashed red 🚑 or amber ⭐ box is a place kept free, a plain "free" box is open to anyone, and a hatched "late" box is a place lost because the doctor is running late. Under a full hour you see who is **waiting**, in the order they will get places, with the next one marked.
- **"What just happened"** on the right: the latest events as sentences ("A012 (Anita Singh) got a place with Dr. Patel, 10:00–11:00"). Click one to open that ticket.
- **Ticket details** (click any box, waiting chip, feed item or table row): the patient's journey (Waiting → Has a place → Called → With doctor → Done), the buttons that make sense right now (Call patient, Start consultation, Finish consultation, Didn't show up, Cancel ticket), how the priority was worked out, and the ticket's full story. "Show the system's own explanation" reveals the original technical reason recorded in the audit log.
- **Buttons:** "+ New ticket" (name, how they came, doctor, hour; it tells you straight away whether they got a place or are waiting), "🚑 Add an emergency" (shows whether someone had to be moved), and per doctor "Report a 20 min delay" and "Mark as unavailable / available again".
- **All tickets** at the bottom: a searchable list for finding a ticket by name or number.

### Demo day tab

"▶ Play the demo day" replays one scripted morning (bookings, a cancellation, a late doctor, an emergency, a no-show, an hour that loses all its places) through the same backend code the API uses. The page shows how the day went in plain numbers, then **the day step by step**, each step with a one-line lesson about what the algorithm did and why.

**It replaces all data** (doctors, hours, tickets) with the demo, so the page asks for confirmation first. The server also refuses the request unless it says `{"confirm":"replace-all-data"}`, and in production it is switched off unless `ENABLE_SIMULATION=1`. You can also run it from the command line (`cd simulation && npm run simulate`).

---

## Access, limits and rules

**Staff key.** Set `API_KEY` in `backend/.env` and every `/api` request must send it as `X-API-Key`. The dashboard asks for it once when it is first opened, remembers it in that browser, and has a "Forget key" link. In production (`NODE_ENV=production`) the server **refuses to start** without a key of 16+ characters. In development it is optional, and without it the API is open. This is one shared key for a single hospital, not per-person accounts: whoever has it can do everything.

**Limits.** Security headers (Helmet) are on, the framework is not advertised, request bodies over 50 KB are refused, and each address is limited to 600 requests a minute (`RATE_LIMIT_PER_MINUTE`). Cross-site browser access is off unless `CORS_ORIGINS` names the sites; `*` is never accepted. Behind a hosting proxy set `TRUST_PROXY=1`.

**Input checks.** Names are limited to 120 characters, reasons to 300, phone numbers must look like phone numbers, a delay is 1 to 480 minutes, capacities are 0 to 500, and an hour must end after it starts, last at most 12 hours, and keep its emergency and paid reserves within its capacity.

**Rules the system enforces:**
- A doctor's hours cannot overlap, and hours can only be added for an existing, active doctor.
- No new ticket for a doctor who is inactive or unavailable, and a ticket for an unknown patient or doctor gets a clear "not found" instead of a server error.
- One live ticket per patient per hour. The same patient means the same patient id, or (for walk-ins typed at the desk) the same name **and** phone number; a name alone is not enough, because different people share names. Once a ticket is cancelled, finished or missed, the patient can have another.
- The demo simulation replaces all data, so it needs an explicit confirmation, and in production it is off unless `ENABLE_SIMULATION=1`.
- The tests can only touch the separate test database (see "Running the tests").

**Not included:** per-person logins and roles, and a rule against booking an hour that has already passed (the sample hours are fixed times of day, so that would stop the demo working in the evening).

---

## 4. Running the tests

```bash
cd backend
npm run test
```

This runs the domain unit tests (no database, pure algorithm logic) plus integration tests against the real `opd_token_engine_test` database, including concurrency tests that fire simultaneous requests at scarce capacity and confirm the database never over-allocates.

**The tests can only ever touch the test database.** They refuse to start unless `TEST_DATABASE_URL` is set, is a different database from `DATABASE_URL`, and has "test" in its name, because every test begins by deleting all rows in the tables it uses. (Earlier versions did not enforce this and could wipe the development database.)

Before the first run, apply migrations to the test database:

```bash
cd backend
DATABASE_URL="$env:TEST_DATABASE_URL" npx prisma migrate deploy   # PowerShell
# or:  DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy  # bash
```

## 5. Running the simulation from the command line

```bash
cd simulation
npm run simulate
```

This resets the **dev** database (`opd_token_engine`) to a clean 3-doctor demo day, runs the scripted scenario, prints a metrics summary to the console, and writes `simulation/reports/demoDay.json` (machine-readable) and `demoDay.md` (human-readable) to disk. Because it resets the dev database, re-seed (`cd backend && npm run seed`) or re-run the simulation again if you want fresh dashboard data afterward.

---

## Requirement → implementation map

| Assignment requirement | Where |
|---|---|
| Enforce per-slot hard limits | `domain/scheduling/capacity.ts`, invariant assertion in `services/allocationService.ts::recalculateSlot` |
| Dynamically reallocate on changing conditions | `services/allocationService.ts`, triggered from every mutating service |
| Prioritize between token sources | `domain/allocation/priority.ts`, policy documented in `docs/algorithm.md` §2 |
| Handle cancellations, no-shows, emergency additions | `services/tokenService.ts`, `services/emergencyService.ts` |
| API-based core logic | `backend/src/routes/*`, `docs/api.md` |
| Documentation: prioritization logic, edge cases, failure handling | `docs/algorithm.md`, `docs/edge-cases.md` |
| Simulation of one OPD day with ≥3 doctors | `simulation/`, `backend/src/domain/simulation/demoDayScenario.ts` |

## Known limitations

See "Known limitations" at the end of `docs/edge-cases.md`.
