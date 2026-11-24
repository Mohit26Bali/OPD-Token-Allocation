import type { BoardDoctor, BoardSlot } from '../types/index.js';
import { formatRange, plural } from '../lib/explain.js';
import { PlaceStrip } from './PlaceStrip.js';
import { SourceChip } from './Chips.js';

export function DoctorBoard({
  doctor,
  onOpen,
  onDelay,
  onToggleAvailable,
  busy,
}: {
  doctor: BoardDoctor;
  onOpen: (tokenId: string) => void;
  onDelay: () => void;
  onToggleAvailable: () => void;
  busy: boolean;
}) {
  const totalPlaces = doctor.slots.reduce((n, s) => n + s.maximumCapacity, 0);
  const taken = doctor.slots.reduce((n, s) => n + s.placesTaken, 0);
  const waiting = doctor.slots.reduce((n, s) => n + s.waiting.length, 0);

  let status = { label: 'On time', tone: 'text-emerald-700 bg-emerald-50 border-emerald-200' };
  if (doctor.unavailable) status = { label: 'Not available', tone: 'text-red-700 bg-red-50 border-red-200' };
  else if (doctor.delayMinutes > 0) status = { label: `Running ${doctor.delayMinutes} min late`, tone: 'text-amber-800 bg-amber-50 border-amber-200' };

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{doctor.name}</h3>
          <p className="text-sm text-slate-500">
            {doctor.specialization} · {taken} of {plural(totalPlaces, 'place')} taken today
            {waiting > 0 && <span className="font-medium text-amber-700"> · {waiting} waiting</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${status.tone}`}>{status.label}</span>
          <button
            onClick={onDelay}
            disabled={busy || doctor.unavailable || doctor.delayMinutes > 0}
            title={doctor.delayMinutes > 0 ? 'A delay has already been reported for this doctor.' : 'Tell the system this doctor is running 20 minutes late. Places that no longer fit in the time left are removed.'}
            className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            {doctor.delayMinutes > 0 ? 'Delay reported' : 'Report a 20 min delay'}
          </button>
          <button
            onClick={onToggleAvailable}
            disabled={busy}
            title={doctor.unavailable ? 'The doctor is back: reopen their hours' : 'The doctor cannot see patients: their patients are moved to other doctors where possible'}
            className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            {doctor.unavailable ? 'Mark as available again' : 'Mark as unavailable'}
          </button>
        </div>
      </header>

      <div className="divide-y divide-slate-100">
        {doctor.slots.length === 0 && <p className="p-4 text-sm text-slate-400">No hours are set up for this doctor.</p>}
        {doctor.slots.map((slot) => (
          <SlotRow key={slot.id} slot={slot} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}

function SlotRow({ slot, onOpen }: { slot: BoardSlot; onOpen: (tokenId: string) => void }) {
  const inactive = slot.status !== 'OPEN';
  const sortedWaiting = [...slot.waiting].sort((a, b) => b.priorityScore - a.priorityScore || b.waitMinutes - a.waitMinutes);

  return (
    <div className={`p-4 ${inactive ? 'bg-slate-50/70' : ''}`}>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-sm font-semibold text-slate-800">{formatRange(slot.startTime, slot.endTime)}</span>
          {!inactive && new Date(slot.endTime).getTime() < Date.now() && (
            <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[11px] font-medium text-slate-600" title="This hour is already over">
              Hour has passed
            </span>
          )}
          {inactive && (
            <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
              {slot.status === 'PAUSED' ? 'Paused' : slot.status === 'CLOSED' ? 'Closed' : 'Finished'}
            </span>
          )}
        </div>
        <span className="text-xs text-slate-500">
          {slot.placesTaken} of {slot.effectiveCapacity} places taken
          {slot.effectiveCapacity < slot.maximumCapacity && <span className="text-amber-700"> (lowered from {slot.maximumCapacity})</span>}
        </span>
      </div>

      <PlaceStrip slot={slot} onOpen={onOpen} />

      {slot.reserveReleased && (
        <p className="mt-2 text-xs text-slate-500">
          Someone has waited a long time, so the places kept for emergencies and paid patients are now open to everyone.
        </p>
      )}

      {sortedWaiting.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
          <p className="text-xs font-medium text-amber-900">
            {plural(sortedWaiting.length, 'ticket')} waiting for a place in this hour. When one opens, the highest priority goes first.
          </p>
          <ol className="mt-2 flex flex-wrap gap-2">
            {sortedWaiting.map((t, i) => (
              <li key={t.id}>
                <button
                  onClick={() => onOpen(t.id)}
                  className="flex items-center gap-2 rounded-md border border-amber-200 bg-white px-2 py-1 text-left text-xs hover:border-amber-400"
                >
                  <span className="font-mono font-semibold text-slate-800">{t.tokenNumber}</span>
                  <SourceChip source={t.source} />
                  <span className="text-slate-500">
                    waited {t.waitMinutes} min · priority {t.priorityScore}
                  </span>
                  {i === 0 && <span className="rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">Next</span>}
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
