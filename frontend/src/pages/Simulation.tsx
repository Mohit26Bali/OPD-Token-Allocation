import { useState } from 'react';
import { api } from '../lib/api.js';
import { STATUS_INFO, formatTime, plural } from '../lib/explain.js';
import { Modal } from '../components/Modal.js';
import type { SimulationRun } from '../types/index.js';

const KIND: Record<string, { icon: string; title: string; lesson: string }> = {
  NOTE: { icon: '🕘', title: 'Setting the scene', lesson: '' },
  CREATE_TOKEN: { icon: '🎫', title: 'A patient gets a ticket', lesson: 'If the doctor’s hour has a free place, the ticket gets it right away. If not, it waits.' },
  CANCEL_TOKEN: { icon: '🚫', title: 'A patient cancels', lesson: 'A cancelled ticket frees its place. The waiting ticket with the highest priority takes it.' },
  NO_SHOW_TOKEN: { icon: '⏱️', title: 'A patient does not turn up', lesson: 'After a short grace period a missing patient loses their place, so it is not wasted.' },
  EMERGENCY: { icon: '🚑', title: 'An emergency arrives', lesson: 'Emergencies go first. If the hour is full, the lowest-priority patient with a place is moved to another hour. Nobody is dropped.' },
  DELAY_DOCTOR: { icon: '⏳', title: 'A doctor is running late', lesson: 'Less time left means fewer consultations fit, so the number of places in that hour shrinks.' },
  CAPACITY_CHANGE: { icon: '📐', title: 'An hour loses its places', lesson: 'When an hour cannot take patients any more, its patients are moved elsewhere or wait. New patients wait too. Nobody is dropped.' },
};

function plainDetail(detail: string | undefined): string {
  if (!detail) return '';
  return detail
    .replace(/\bToken\b/g, 'Ticket')
    .replace(/\b(WAITING|ALLOCATED|CALLED|IN_PROGRESS|COMPLETED|CANCELLED|NO_SHOW|REJECTED)\b/g, (s) => STATUS_INFO[s as keyof typeof STATUS_INFO].label.toLowerCase())
    .replace(/->/g, '→');
}

export function Simulation({ onShowBoard }: { onShowBoard: () => void }) {
  const [run, setRun] = useState<SimulationRun | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  async function start() {
    setAsking(false);
    setRunning(true);
    setError(null);
    try {
      setRun(await api.simulation.run());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The demo could not run');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="text-2xl font-semibold text-slate-900">Demo day</h1>
      <p className="mt-1 max-w-2xl text-slate-600">
        This plays one pretend morning at the OPD in a few seconds: 3 doctors, a busy desk, a cancellation, a late doctor, an emergency and a no-show. It uses the same code as the real screens, so what you see is exactly how the system behaves.
      </p>

      <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        <b>This replaces everything on the Today screen</b> (all doctors, hours and tickets) with the demo. Use it on a demo or practice database, not with real patients.
      </div>

      <button
        onClick={() => setAsking(true)}
        disabled={running}
        className="mt-4 rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
      >
        {running ? 'Playing the day…' : run ? '▶ Play it again' : '▶ Play the demo day'}
      </button>
      {error && (
        <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {asking && (
        <Modal title="Replace all data with the demo?" onClose={() => setAsking(false)}>
          <p className="text-sm text-slate-700">Every doctor, hour and ticket currently in the system will be deleted and replaced with the demo day. This cannot be undone.</p>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setAsking(false)} className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
              Keep my data
            </button>
            <button onClick={start} className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
              Replace and play
            </button>
          </div>
        </Modal>
      )}

      {!run && !running && <p className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">Press the button to play the day. The story appears here, step by step.</p>}

      {run && (
        <>
          <section className="mt-8">
            <h2 className="text-lg font-semibold text-slate-900">How the day went</h2>
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
              <Result label="Average time to get a place" value={`${run.metrics.averageWaitMinutes} min`} note="From ticket created to place found" />
              <Result label="Longest time to get a place" value={`${run.metrics.maxWaitMinutes} min`} note="The slowest ticket" />
              <Result label="Emergencies handled" value={String(run.metrics.emergencyInsertions)} note="Added at the front" />
              <Result label="Patients moved to another hour" value={String(run.metrics.reallocations)} note="To make room or after a change" />
              <Result label="Cancellations" value={String(run.metrics.cancellations)} note="Places freed" />
              <Result label="Did not show up" value={String(run.metrics.noShows)} note="Places freed" />
              <Result label="Still waiting at the end" value={String(run.metrics.rejectedOrHeldWaiting)} note="Not dropped. Kept for the next free place" />
            </div>
            <ul className="mt-4 space-y-2">
              {run.metrics.doctors.map((d) => (
                <li key={d.name} className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium text-slate-800">
                      {d.name} <span className="font-normal text-slate-500">· {d.specialization}</span>
                    </span>
                    <span className="text-slate-600">
                      {d.occupied} of {plural(d.capacity, 'place')} used
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-teal-500" style={{ width: `${Math.min(100, d.utilizationPct)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
            <button onClick={onShowBoard} className="mt-4 rounded-lg border border-teal-600 px-4 py-2 text-sm font-medium text-teal-700 hover:bg-teal-50">
              See the result on the Today screen →
            </button>
          </section>

          <section className="mt-10">
            <h2 className="text-lg font-semibold text-slate-900">The day, step by step</h2>
            <ol className="mt-3 space-y-3">
              {run.timeline.map((step, i) => {
                const info = KIND[step.kind] ?? KIND.NOTE;
                return (
                  <li key={i} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-4">
                    <div className="w-12 shrink-0 text-center">
                      <div className="text-xl" aria-hidden>
                        {info.icon}
                      </div>
                      <div className="font-mono text-xs text-slate-500">{formatTime(step.simulatedTime)}</div>
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900">{step.label}</p>
                      {step.detail && <p className="mt-0.5 text-sm font-medium text-teal-800">Result: {plainDetail(step.detail)}</p>}
                      {info.lesson && <p className="mt-1 text-sm text-slate-600">{info.lesson}</p>}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        </>
      )}
    </div>
  );
}

function Result({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
      <p className="mt-0.5 text-xs text-slate-500">{note}</p>
    </div>
  );
}
