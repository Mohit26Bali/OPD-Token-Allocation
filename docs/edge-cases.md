# Edge Cases

Each row states the case, the handling, and where it's proven (test or code path). "Proven" means an automated test exercises it against either the pure domain engine or the real local Postgres database — not just prose.

## Capacity

| Case | Handling | Proof |
|---|---|---|
| Exact capacity (occupied = capacity − 1, one more arrives) | Allocated — fills the exact last unit | `allocationEngine.test.ts` "never exceeds hard capacity" |
| Capacity full | New arrivals stay `WAITING` with a reason | `allocationEngine.test.ts`, `api.test.ts` |
| Capacity zero | No token is ever allocated | `capacity.test.ts` "handles zero capacity slots" |
| Capacity reduction below current occupancy | Excess occupants are displaced (moved or returned to `WAITING`), never deleted | `slotService.ts::updateSlotCapacity`, exercised in the Demo Day simulation (Dr. Rao capacity 10→0) |
| Capacity increase | Extra remaining capacity is immediately offered to `WAITING` tokens via `recalculateSlot` | `capacity.test.ts` "capacity increase...reflected directly" |

## Priority / fairness

| Case | Handling | Proof |
|---|---|---|
| Emergency vs everything else | Emergency wins (base score 100, plus reserved capacity) | `allocationEngine.test.ts` "prioritizes EMERGENCY over WALK_IN" |
| Paid priority vs follow-up/online/walk-in | Paid priority outranks all three by base score, and draws from its own reserve first | `allocationEngine.test.ts` "paid priority draws from paid reserve" |
| Long-waiting low-priority vs fresh high(er)-priority | Aging bonus lets the long-waiter eventually win | `priority.test.ts`, `allocationEngine.test.ts` "online loses to walk-in when walk-in has aged" |
| Reserved capacity sitting unused | Releases to general pool after the aging threshold, reclaimable by a later emergency via displacement | `capacity.test.ts` "marks reserve released", `allocationEngine.test.ts` "reserved capacity releases" |

## Cancellation

| Case | Handling | Proof |
|---|---|---|
| Cancel a `WAITING` token | Legal, no capacity to free | state machine |
| Cancel an `ALLOCATED` token | Legal, frees capacity, triggers `recalculateSlot` | `api.test.ts` "cancellation frees capacity and allocates the next waiting token" |
| Cancel while `CALLED` | Illegal — not in the transition table from `CALLED` | `stateMachine.test.ts` |
| Cancel while `IN_PROGRESS` | Illegal | `stateMachine.test.ts` |
| Duplicate cancellation | Second call rejected with `INVALID_TRANSITION` (409) | `api.test.ts` "rejects a duplicate cancellation" |
| Cancel an already-completed token | Rejected with `INVALID_TRANSITION` (409) | `api.test.ts` "rejects cancelling an already-completed token" |

## No-shows

| Case | Handling | Proof |
|---|---|---|
| No-show attempted before grace period elapses | Rejected with `NO_SHOW_GRACE_PERIOD_ACTIVE` (409) — never auto-marked early | `api.test.ts` "rejects no-show before the grace period" |
| No-show after grace period | Legal, frees capacity, triggers reallocation | `api.test.ts` "allows no-show once the grace period has elapsed" |
| Duplicate no-show | Second call rejected, same as any invalid transition | `api.test.ts` "Idempotency" suite |
| No-show token later treated as active | Structurally impossible — `NO_SHOW` is terminal, no outgoing transitions | `stateMachine.test.ts` "never allows a no-show token to be treated as active again" |

## Emergency

| Case | Handling | Proof |
|---|---|---|
| Emergency with free general capacity | Allocated directly | covered by normal allocation path |
| Emergency with only reserved capacity free | Drawn from `emergencyReserve` first | `api.test.ts` "allocates an emergency into reserved capacity" |
| Emergency with slot fully occupied by lower-priority `ALLOCATED` tokens | Displaces the lowest-scoring `ALLOCATED` (never `CALLED`/`IN_PROGRESS`) occupant | `api.test.ts` "displaces a lower-priority allocated token" |
| Displaced token has no eligible destination | Returned to `WAITING`, never dropped | same test — asserts the displaced token ends at `WAITING`, not vanished |
| Emergency arrives when slot has zero eligible displacement targets (everyone `CALLED`/`IN_PROGRESS`) | Emergency token stays `WAITING` with an explicit event explaining why; hard capacity is never silently overridden | `emergencyService.ts` — the "no displacement target" branch |

## Doctor delay

| Case | Handling | Proof |
|---|---|---|
| Small delay, plenty of remaining time | Effective capacity barely reduced | `capacity.test.ts` "reduces effective capacity under a delay" |
| Large delay eating the whole remaining window | Effective capacity floors at current occupied count — never revokes already-allocated tokens | `capacity.test.ts` "delay never reduces effective capacity below already-occupied count" |
| Delay applied to a doctor with already-`ALLOCATED` tokens | Those tokens are untouched; only `WAITING` tokens are affected by the reduced remaining capacity | `api.test.ts` "records the delay and recalculates open slots without revoking occupied tokens" |
| Doctor unavailable | See dedicated table below | |

## Reallocation

| Case | Handling | Proof |
|---|---|---|
| Valid reallocation, eligible alternate slot exists | Moves to the closest-in-time eligible slot | `reallocation.test.ts` "prefers the candidate slot closest in start time" |
| No eligible destination anywhere | Returns `null`, caller falls back to `WAITING` | `reallocation.test.ts` "returns null when there is no eligible destination" |
| Only candidate is the original slot itself | Excluded — never "reallocates" a token to the slot it's already in | `reallocation.test.ts` "never returns the original slot itself" |
| Candidate slot has zero remaining capacity | Excluded from consideration | `reallocation.test.ts` "excludes candidates with zero remaining capacity" |
| Incompatible doctor (different specialization) | Never considered a candidate — cross-doctor candidates are pre-filtered by specialization match | `slotRepository.ts::listAlternateOpenSlotsBySpecialization` |

## Doctor unavailable

| Case | Handling | Proof |
|---|---|---|
| Doctor goes unavailable with `ALLOCATED` (not yet called) patients | Displaced to a same-specialization alternate doctor if capacity exists, else `WAITING` | `doctorService.ts::setUnavailableInTx` |
| Doctor goes unavailable with `CALLED`/`IN_PROGRESS` patients | Never touched — a consultation in progress elsewhere is not interrupted by this event | same |
| Doctor goes unavailable with `WAITING` patients | One attempt to move to a same-specialization open slot, else left `WAITING` | same |
| Doctor becomes available again | Delay cleared, `unavailable` flag cleared; slots stay `CLOSED` until manually reopened (deliberate, not automatic) | `doctorService.ts::setAvailableInTx` |

## Slot closure / capacity changes

| Case | Handling | Proof |
|---|---|---|
| Slot set to `CLOSED` or `PAUSED` with occupants | All `ALLOCATED` (not yet called) occupants are displaced via the same mechanism as emergencies | `slotService.ts::updateStatusInTx` |
| New token creation attempted against a `CLOSED` slot | Rejected with `SLOT_CLOSED` (409) | `api.test.ts` "rejects token creation for a CLOSED slot" |

## Concurrency

| Case | Handling | Proof |
|---|---|---|
| 2 requests race for the last 1 unit of capacity | Exactly 1 succeeds (Serializable isolation + retry) | `concurrency.test.ts`, against real Postgres |
| 5 requests race for 2 units of capacity | Exactly 2 succeed, DB count confirms no over-allocation | `concurrency.test.ts` |

## State machine

| Case | Handling | Proof |
|---|---|---|
| Every legal transition | Allowed | `stateMachine.test.ts` "allows the full happy path" |
| Every illegal transition attempted | Rejected with a descriptive error naming the token and legal alternatives | `stateMachine.test.ts` "assertTransition throws a descriptive error" |
| Completed token → WAITING | Structurally impossible | `stateMachine.test.ts` "never allows a completed token to become WAITING again" |
| Cancelled token → ALLOCATED (no reactivation workflow exists) | Structurally impossible | `stateMachine.test.ts` |

## Known limitations (honest, not hidden)

- **Cross-specialization overflow is never attempted.** If every same-specialization doctor is full but an unrelated specialty has open capacity, the system will not offer that capacity — this is treated as a hard clinical-compatibility constraint, not an oversight, per §5 of `docs/algorithm.md`.
- **Delay-derived effective capacity is an approximation**, not a prediction of real consultation throughput (§6 of `docs/algorithm.md`).
- **Simulation runs are stored in-process memory** (`simulationService.ts`'s `runs` Map), not a database table — a server restart loses in-flight run lookups by id, though the JSON/MD files on disk persist. Given the scope of this build, we judged a dedicated `SimulationRun` table not worth the added schema complexity for what is fundamentally a demo/report feature; flagged here rather than silently accepted.
- **Reopening a slot after a doctor becomes available again is a manual step**, not automatic — see the doctor-unavailable table above.
