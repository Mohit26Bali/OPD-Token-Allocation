import type { Board, DashboardOverview } from '../types/index.js';
import { plural } from '../lib/explain.js';

/** One sentence about the day, then the four numbers that matter. */
export function SummaryBar({ board, overview }: { board: Board | null; overview: DashboardOverview | null }) {
  if (!board) return <div className="mb-6 h-24 animate-pulse rounded-xl bg-slate-200/60" />;

  const slots = board.doctors.flatMap((d) => d.slots);
  const places = slots.reduce((n, s) => n + s.maximumCapacity, 0);
  const taken = slots.reduce((n, s) => n + s.placesTaken, 0);
  const waiting = slots.reduce((n, s) => n + s.waiting.length, 0);
  const withDoctor = slots.flatMap((s) => s.holding).filter((t) => t.status === 'IN_PROGRESS').length;
  const done = slots.flatMap((s) => s.holding).filter((t) => t.status === 'COMPLETED').length;
  const late = board.doctors.filter((d) => d.delayMinutes > 0 && !d.unavailable).length;
  const away = board.doctors.filter((d) => d.unavailable).length;
  const safe = (overview?.invariants.capacityViolations ?? 0) === 0;

  const sentence = [
    `${plural(taken, 'patient')} ${taken === 1 ? 'has' : 'have'} a place today`,
    waiting > 0 ? `${waiting} ${waiting === 1 ? 'is' : 'are'} waiting for one` : 'nobody is waiting',
    late > 0 ? `${plural(late, 'doctor')} running late` : null,
    away > 0 ? `${plural(away, 'doctor')} not available` : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <section className="mb-6" aria-label="Summary">
      <p className="mb-3 text-lg font-medium text-slate-800">{sentence.charAt(0).toUpperCase() + sentence.slice(1)}.</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Places taken" value={`${taken} / ${places}`} note={places ? `${Math.round((taken / places) * 100)}% of all places today` : 'No hours set up'} />
        <Stat label="Waiting for a place" value={String(waiting)} note={waiting ? 'Highest priority goes first' : 'Everyone has a place'} tone={waiting ? 'warn' : 'good'} />
        <Stat label="With a doctor now" value={String(withDoctor)} note={`${done} finished so far`} />
        <Stat label="Average time to get a place" value={overview ? `${overview.averageWaitMinutes} min` : '—'} note="From ticket created to place found" />
      </div>
      <p className={`mt-2 text-xs ${safe ? 'text-slate-400' : 'font-semibold text-red-600'}`}>
        {safe ? '✓ Safety check: no hour has more patients than places.' : '⚠ Safety check failed: an hour has more patients than places. Please tell the developer.'}
      </p>
    </section>
  );
}

function Stat({ label, value, note, tone }: { label: string; value: string; note: string; tone?: 'good' | 'warn' }) {
  const color = tone === 'warn' ? 'text-amber-700' : tone === 'good' ? 'text-emerald-700' : 'text-slate-900';
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${color}`}>{value}</p>
      <p className="mt-0.5 text-xs text-slate-500">{note}</p>
    </div>
  );
}
