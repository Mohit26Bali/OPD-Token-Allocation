# Allocation Algorithm

This document explains the token allocation algorithm: capacity rules, priority policy, fairness mechanism, reallocation strategy, emergency strategy, delay strategy, cancellation/no-show strategy, doctor-unavailability handling, and the trade-offs behind each decision.

Throughout, we call out **[Assignment requirement]** vs **[Design decision]** — the 2-page brief (`OPD Token Allocation Engine.pdf`) asks for hard per-slot limits, dynamic reallocation, source prioritization, and cancellation/no-show/emergency handling, but does not prescribe *how*. Everything below that isn't a direct quote of the brief is a choice we made and justify.

## 1. Capacity model

**[Assignment requirement]** Per-slot hard limits must never be silently exceeded.

We define five capacity concepts (`backend/src/domain/scheduling/capacity.ts`):

| Term | Definition |
|---|---|
| **base capacity** | `OpdSlot.maximumCapacity` — the hard ceiling, set by an admin. |
| **occupied capacity** | Count of tokens in `ALLOCATED`, `CALLED`, `IN_PROGRESS`, or `COMPLETED` for the slot. These are never revoked by a recalculation. |
| **reserved capacity** | A configurable sub-quota of base capacity set aside for `EMERGENCY` and `PAID_PRIORITY` tokens (`emergencyReserve`, `paidReserve` on the slot). |
| **effective capacity** | `min(base capacity, delay-adjusted achievable capacity)`, see §6. Never below occupied capacity. |
| **remaining capacity** | `effective capacity − occupied capacity`, floored at 0. |

**[Design decision]** Reserved capacity is a *sub-quota within* remaining capacity, not additional capacity. `general pool = remaining capacity − emergency reserve remaining − paid reserve remaining` (floored at 0), unless the reserve has been *released* (§4).

**Invariant**: `occupied capacity ≤ effective capacity` always. `services/allocationService.ts::recalculateSlot` asserts this immediately before every transaction commits and throws (aborting the transaction) if it's ever violated — this is a live guard, not just documentation. The dashboard (`GET /api/dashboard/overview`) also reports a live `capacityViolations` counter computed by scanning current slot occupancy, so the claim is checkable, not just asserted in prose.

## 2. Priority policy

**[Assignment requirement]** The system must prioritize between token sources; the exact order is not specified.

**[Design decision]** Default hierarchy, highest to lowest:

```
EMERGENCY (100) > PAID_PRIORITY (80) > FOLLOW_UP (60) > ONLINE (40) > WALK_IN (20)
```

Rationale: emergencies are a clinical safety issue and outrank everything. Paid priority is a product/business decision (patients who pay expect faster service) — we rank it above follow-up and online because it's an explicit commercial commitment, but still below emergencies (money never outranks a medical emergency in this design). Follow-up outranks fresh online/walk-in bookings because a returning patient mid-treatment has a continuity-of-care argument that a first-time booking doesn't. Walk-in ranks lowest because, unlike online booking, a walk-in patient made no advance commitment the system needs to honor — this is *not* a claim that walk-in patients matter less, only that they have the weakest scheduling claim absent other factors (which is exactly what aging exists to correct, next section).

These are named constants in `config/allocationConfig.ts::defaultAllocationConfig.basePriority`, not inlined magic numbers, and the whole system reads them from there — changing the hierarchy is a one-line config edit, not a code change.

**Priority score formula** (`domain/allocation/priority.ts`):

```
score = basePriority(source) + floor(waitMinutes / agingIntervalMinutes) * agingPointsPerInterval
```

This is deliberately a **two-term sum**, not a multi-factor weighted formula. We considered folding in doctor preference, distance, or other soft signals into this same score and rejected it: a score that answers five questions at once ("how urgent AND how well-matched AND how disruptive to move...") stops being explainable in one sentence, which directly undermines the assignment's evaluation criterion of practical reasoning. Instead, "how urgently does this token deserve capacity" (the score) and "which destination is least disruptive to move it to" (§5, reallocation) are kept as two separate, individually explainable steps.

## 3. Fairness / anti-starvation (aging)

**[Design decision — this is the answer to a question the assignment poses implicitly]**: a static hierarchy alone *does* starve low-priority sources. If `FOLLOW_UP` patients keep arriving, a `WALK_IN` token with a static score of 20 could wait indefinitely whenever the queue has any follow-up demand at all.

**Aging bonus**: every token gains `agingPointsPerInterval` (default 1) points per `agingIntervalMinutes` (default 10) waited, with no upper bound. This means:

- A `WALK_IN` token (base 20) needs `ceil((60-20)/1) * 10 = 400` minutes to out-score a fresh `FOLLOW_UP` token (base 60) — deliberately slow, so aging is a safety net for pathological cases, not a mechanism that regularly overturns the intended hierarchy.
- Because the bonus is monotonic and unbounded, **no token can wait forever**: eventually its score exceeds any fixed base priority. This is asserted directly in `tests/domain/priority.test.ts` ("fairness: a long-waiting WALK_IN token can eventually out-score a freshly arrived FOLLOW_UP token") and `allocationEngine.test.ts`.

**Reserve release** is the second fairness mechanism (§1, §4): unused `EMERGENCY`/`PAID_PRIORITY` reserve is not allowed to sit idle indefinitely while general-pool patients wait — see next section.

**Trade-off we accepted**: aging is *slow by design* (10-minute granularity, +1 point). A faster aging curve would reduce worst-case wait time for low-priority sources but would also more frequently override the deliberate source hierarchy, defeating the point of having one. Both constants are configurable per deployment.

## 4. Reserved capacity

**[Design decision]** Slots carry `emergencyReserve` and `paidReserve` (defaults: 1 unit each, configurable per slot). Rationale: a slot that is otherwise fully booked by general-pool patients should still guarantee at least one same-slot opening for an emergency or paid-priority arrival, rather than forcing every emergency through the (more disruptive) displacement path.

**What happens if reserved capacity goes unused?** It is not left idle indefinitely. If general-pool tokens have waited past `reserveReleaseAfterWaitMinutes` (default 30 minutes) with no emergency/paid demand, the reserve merges into the general pool *for that recalculation pass*. It is not permanently surrendered — the next emergency/paid arrival can still reclaim it via the same mechanism used when reserve is already exhausted (displacement, §5), so releasing reserve never means "this slot has stopped protecting for emergencies," only "unused protection doesn't block someone with a real, immediate need."

**Worked example** (also exercised in the Demo Day simulation): slot capacity 10, emergency reserve 1, paid reserve 1, general pool 8. At T+0 with 5 general-pool tokens waiting and no emergency/paid demand, the 2 reserved units sit unused — normal, not a bug. Once the longest-waiting general token crosses 30 minutes, `computeCapacity` reports `reserveReleased: true` and the engine's pool-selection order for non-emergency/paid tokens becomes `[general, emergency, paid]` instead of `[general]` only (see `allocationEngine.ts`). An emergency arriving after that point still checks the emergency reserve pool first, but since it was already merged into general, a fresh check for genuinely free capacity happens through the normal displacement fallback if none remains.

**Can emergencies consume general capacity?** Yes, always — the pool order for `EMERGENCY` is `[emergency, general]`. **Can general patients pre-emptively consume the emergency/paid reserve before the aging threshold?** No — that would defeat the reserve's purpose.

## 5. Reallocation strategy

**[Assignment requirement]** Dynamically reallocate tokens when conditions change.

**[Design decision]** Reallocation is **event-triggered, not a full-day rebuild**. Every state change (cancellation, no-show, emergency, delay, capacity change, doctor unavailable, slot closure) calls a narrow `recalculateSlot(slotId)` that only reconsiders that slot's own `WAITING` tokens against the freshly computed remaining capacity. Tokens in `CALLED`, `IN_PROGRESS`, or `COMPLETED` are never read or written by this function — they are structurally excluded from `occupiedTokens` re-evaluation and from ever being displaced (§6 below enforces this explicitly for displacement, and the state machine, §8, makes it impossible to move a CALLED/IN_PROGRESS token via any path). This bounds the "blast radius" of every event to the one slot it actually affects (or, for doctor-unavailable, the doctor's own slots) rather than recomputing the whole day, which keeps behavior predictable and each change individually explainable.

**Displacement** (used by emergency insertion, capacity reduction, and doctor unavailability — `services/allocationService.ts::displaceOneFromSlot`) selects the single **lowest-priority-score `ALLOCATED`** (never `CALLED`/`IN_PROGRESS`/`COMPLETED`) occupant of a slot, then looks for a destination:

1. **Hard constraints first**: candidate destination slots must be `OPEN` and have `remainingCapacity > 0`. Cross-doctor candidates are further restricted to doctors with the **same specialization** — the system never reassigns a patient to an incompatible doctor merely to fill capacity (`slotRepository.ts::listAlternateOpenSlotsBySpecialization`).
2. **Movement-cost tiebreak**: among eligible destinations, prefer the slot **closest in start time** to the token's original slot — this minimizes unnecessary disruption to the patient's day (`domain/allocation/reallocation.ts::selectDestinationSlot`).
3. **Earliest-start tiebreak** for any remaining ties.

If no eligible destination exists, the token is set back to `WAITING` (never dropped, never force-fit into an incompatible slot) with an event explaining why, and it re-enters the front of its priority tier on the next recalculation pass (§8 documents the one explicit `ALLOCATED → WAITING` transition this requires).

**Trade-off we accepted**: cross-specialization moves are never attempted, even if a mismatched doctor has empty capacity. This can leave a patient waiting when capacity technically "exists" elsewhere — we treat clinical compatibility as a hard constraint the assignment implies ("never reassign to fill capacity") rather than an optimization to trade away.

## 6. Doctor delay strategy

**[Assignment requirement]** Handle doctor delays.

**[Design decision]** `effective capacity = min(base capacity, occupied + floor(remaining minutes / avgConsultMinutes))`, floored so it never drops below `occupied capacity` — a delay reduces how much *more* capacity can be added, it never revokes already-allocated, called, or in-progress consultations.

**This is explicitly a scheduling approximation, not a clinical prediction.** `avgConsultMinutes` (default 10) is a configurable constant, and `docs/algorithm.md` (this file) and inline code comments in `capacity.ts` state plainly that real consultations vary in length — the number bounds how much a delay can plausibly absorb for planning purposes; it is never presented to a user as a guarantee.

Because effective capacity is floored at `occupied`, a delay by itself **never triggers displacement** — it only reduces how many additional `WAITING` tokens can be pulled in during the next recalculation. This was a deliberate simplification: forcibly bumping already-allocated patients purely because a doctor is running late would be a much more disruptive intervention than the assignment's brief seems to call for, and it isn't necessary to keep the capacity invariant honest.

## 7. Emergency strategy

**[Assignment requirement]** Handle emergency insertions.

**[Design decision — chosen policy: reserved capacity first, controlled displacement second (options A + D from the brief's menu)]**:

1. An emergency token is created `WAITING` and immediately run through the normal `recalculateSlot` pass, which tries the emergency reserve pool first, then the general pool (§1, §4).
2. If still `WAITING` after that (reserve and general pool both full), `displaceOneFromSlot` is invoked specifically for this emergency, with the reason recorded as "required capacity beyond the emergency reserve and general pool."
3. If a displacement target and destination are found, the displaced token is moved (not deleted) and an `EMERGENCY_INSERTED` + `TOKEN_REALLOCATED` event pair records: the displaced token, the reason, the new slot, and the priority score that made it the displacement candidate.
4. `recalculateSlot` runs again so the emergency token claims the capacity the displacement just freed.
5. If no occupant is eligible for displacement (everyone in the slot is already `CALLED`/`IN_PROGRESS`) or no destination exists for whoever is displaced, the emergency token (or the displaced token) remains `WAITING` with an event explaining exactly why — **the hard capacity limit is never silently overridden**; every unit of capacity an emergency consumes is accounted for by either the reserve, the general pool, or a recorded displacement.

We rejected "just add 1 to capacity" (documented anti-pattern in the assignment) because it makes the hard limit meaningless and unauditable. We rejected pure reserved-capacity-only (no displacement) because a slot with an exhausted reserve would otherwise leave a genuine emergency stuck behind lower-priority patients with no recourse, which fails the assignment's core requirement that the algorithm actually prioritize.

## 8. Cancellation and no-show strategy

**[Assignment requirement]** Handle cancellations and no-shows; invalid transitions must be rejected cleanly.

**Token state machine** (`domain/tokens/stateMachine.ts`):

```
WAITING → ALLOCATED → CALLED → IN_PROGRESS → COMPLETED
WAITING/ALLOCATED → CANCELLED
ALLOCATED/CALLED → NO_SHOW
WAITING → REJECTED
ALLOCATED → WAITING   (displacement fallback only, see §5)
```

All four of `COMPLETED`, `CANCELLED`, `NO_SHOW`, `REJECTED` are terminal — no transitions are legal out of them. Every transition is checked by `assertTransition`, which throws `InvalidTransitionError` (mapped to HTTP 409) naming the token and the legal alternatives from its current state. This makes cancelling an already-completed token, double-cancelling, or double-no-showing all rejected the same way, cleanly, every time — proven by `tests/domain/stateMachine.test.ts` and the integration tests in `tests/integration/api.test.ts`.

**Cancellation**: freeing an `ALLOCATED` token's capacity immediately triggers `recalculateSlot` on that slot so the freed unit is offered to the highest-scoring `WAITING` token. Cancelling a `WAITING` token (never allocated) requires no reallocation.

**No-show**: **[Design decision]** guarded by a configurable grace period (`noShowGraceMinutes`, default 10) measured from the slot's *scheduled* start time — `now < slot.startTime + grace` throws `NO_SHOW_GRACE_PERIOD_ACTIVE` (409). This stops staff from prematurely marking a patient absent before they've had a fair chance to arrive. Once legal, a no-show behaves like a cancellation for capacity purposes: it frees the slot and triggers reallocation.

## 9. Doctor unavailability

**[Assignment requirement]** Handle a doctor becoming unavailable.

**[Design decision]** `setDoctorUnavailable` (`services/doctorService.ts`):

1. Marks the doctor `unavailable`, records `DOCTOR_AVAILABILITY_CHANGED`.
2. Closes every `OPEN` slot for that doctor (`SLOT_CAPACITY_CHANGED` event per slot).
3. Repeatedly displaces `ALLOCATED`-but-not-yet-called occupants via the same `displaceOneFromSlot` used for emergencies — each is moved to a same-specialization alternate doctor if one has capacity, otherwise returned to `WAITING`.
4. Any tokens still `WAITING` on the now-closed slots are given one attempt to move to a same-specialization open slot; if none exists they are left `WAITING` and counted in `heldWaitingCount`.
5. `CALLED`/`IN_PROGRESS`/`COMPLETED` tokens are never touched — a consultation already underway is not interrupted by a doctor-unavailable event elsewhere in the system (this only fires for the doctor actually going unavailable, and if that's the doctor mid-consultation, the consultation itself is a real-world event outside this system's scope to interrupt).

`setDoctorAvailable` clears the unavailable flag and any delay, but **deliberately does not reopen previously closed slots automatically** — reopening is a distinct decision an operator makes explicitly (`PATCH /api/slots/:id`), so a doctor coming back doesn't silently and immediately refill a slot that was closed for a specific operational reason.

## 10. Concurrency / data consistency

**[Assignment requirement]** Two requests must not both succeed in allocating the same last unit of capacity.

**[Design decision, corrected during design review]**: every allocation-affecting operation runs inside a PostgreSQL transaction using **Serializable isolation** (`utils/withTransaction.ts::withSerializableTransaction`). This is a distinct mechanism from an explicit `SELECT ... FOR UPDATE` row lock, and this codebase does not claim otherwise anywhere. Under Serializable isolation, Postgres detects the write-write conflict itself (SQLSTATE `40001`, surfaced by Prisma as error code `P2034`) when two concurrent transactions would otherwise both allocate the same unit of capacity, and aborts one of them. The wrapper catches exactly that error code and retries the whole transaction (fresh reads, from scratch) up to `maxTransactionRetries` (default 3) times with a short backoff before surfacing a `409 Conflict` to the client.

This is proven, not just asserted: `tests/integration/concurrency.test.ts` fires 2 simultaneous requests at a slot with exactly 1 remaining unit of capacity (exactly one succeeds, confirmed via a fresh DB count) and 5 simultaneous requests at a slot with 2 remaining units (exactly 2 succeed), against the real local Postgres instance — not a mock.

## 11. Determinism

Given identical input state (same tokens, same requested/allocated timestamps, same `now`), `allocateSlot` always produces identical decisions: sorting is total (score, then `requestedAt`, then `id` as a final tiebreak) and the function reads no wall-clock time itself — `now` is always passed in. Proven by `tests/domain/allocationEngine.test.ts::"is deterministic"`.

## 12. Explainability

Every allocation, reallocation, displacement, and rejection decision carries a `reason` string built from the actual numbers used in that decision (capacity before/after, priority score, wait minutes, which pool it drew from) — see `buildAllocatedReason` in `allocationEngine.ts` and the reason strings built throughout `services/`. These are persisted as `AllocationEvent` rows, forming an append-only audit trail queryable per-token (`GET /api/tokens/:id` includes its event history) — this is also what powers the frontend's "Why?" panel (§ frontend docs) without needing a separate replay engine.
