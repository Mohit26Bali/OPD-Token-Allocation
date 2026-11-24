import { useState } from 'react';
import type { Board } from '../types/index.js';
import { SOURCE_INFO, SOURCE_ORDER } from '../lib/explain.js';

const KEY = 'opd.howItWorks.hidden';

function wasHidden(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/** A short explanation of the whole idea, open the first time and hidden afterwards (one click to bring it back). */
export function HowItWorks({ config }: { config: Board['config'] | undefined }) {
  const [open, setOpen] = useState(!wasHidden());

  function toggle(next: boolean) {
    setOpen(next);
    try {
      localStorage.setItem(KEY, next ? '0' : '1');
    } catch {
      /* private mode: just do not remember */
    }
  }

  if (!open) {
    return (
      <button onClick={() => toggle(true)} className="mb-5 text-sm font-medium text-teal-700 hover:underline">
        ? How does this screen work
      </button>
    );
  }

  return (
    <section className="mb-6 rounded-xl border border-teal-200 bg-teal-50/60 p-5" aria-label="How this screen works">
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-base font-semibold text-teal-900">How this screen works</h2>
        <button onClick={() => toggle(false)} className="text-sm text-teal-800 hover:underline">
          Hide
        </button>
      </div>

      <ol className="mt-3 grid gap-4 text-sm text-slate-700 md:grid-cols-3">
        <Step n={1} title="A patient gets a ticket">
          A ticket (a "token") is a number like <b>A012</b> for one doctor and one hour. It says how the patient came: walk-in, online, paid, follow-up or emergency.
        </Step>
        <Step n={2} title="Each hour has a fixed number of places">
          Every box below is one place. If there is a free place, the ticket gets it straight away. If not, it <b>waits</b>, and the highest priority gets the next place that opens.
        </Step>
        <Step n={3} title="Emergencies go first">
          A few places in every hour are kept free for emergencies (🚑) and paid-priority patients (⭐). If everything is full, an emergency still gets in by moving someone else to another hour.
        </Step>
      </ol>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-teal-900">Colours: how the patient came, and their starting priority</p>
          <ul className="space-y-1.5">
            {SOURCE_ORDER.map((s) => (
              <li key={s} className="flex items-center gap-2 text-sm text-slate-700">
                <span className={`inline-flex h-6 w-10 shrink-0 items-center justify-center rounded border text-[10px] font-semibold ${SOURCE_INFO[s].box}`}>{config?.basePriority[s] ?? ''}</span>
                <span>
                  <b>{SOURCE_INFO[s].label}</b>: {SOURCE_INFO[s].blurb}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-600">
            Priority = starting points + {config?.agingPointsPerInterval ?? 1} for every {config?.agingIntervalMinutes ?? 10} minutes waited, so nobody waits forever.
          </p>
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-teal-900">The boxes</p>
          <ul className="space-y-1.5 text-sm text-slate-700">
            <Legend swatch="border border-slate-300 bg-white text-slate-300">free</Legend>
            <Legend swatch="border-2 border-dashed border-red-400 bg-red-50 text-red-500">🚑</Legend>
            <Legend swatch="border-2 border-dashed border-amber-400 bg-amber-50 text-amber-600">⭐</Legend>
            <Legend swatch="border border-slate-300 bg-[repeating-linear-gradient(45deg,#e2e8f0,#e2e8f0_4px,#f8fafc_4px,#f8fafc_8px)] text-slate-400">late</Legend>
          </ul>
          <p className="mt-2 text-xs text-slate-600">
            A coloured box is a patient with a place. Click it for the full story. A small dot means they are called (blue) or with the doctor (pulsing).
          </p>
        </div>
      </div>
    </section>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-600 text-xs font-semibold text-white">{n}</span>
      <div>
        <p className="font-semibold text-slate-900">{title}</p>
        <p className="mt-0.5">{children}</p>
      </div>
    </li>
  );
}

const LEGEND_TEXT: Record<string, string> = {
  free: 'A free place, open to anyone.',
  '🚑': 'Kept free for an emergency.',
  '⭐': 'Kept free for a paid-priority patient.',
  late: 'Lost because the doctor is running late.',
};

function Legend({ swatch, children }: { swatch: string; children: string }) {
  return (
    <li className="flex items-center gap-2">
      <span className={`flex h-6 w-10 shrink-0 items-center justify-center rounded text-[10px] font-medium ${swatch}`}>{children}</span>
      <span>{LEGEND_TEXT[children]}</span>
    </li>
  );
}
