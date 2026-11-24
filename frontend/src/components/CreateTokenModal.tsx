import { useState } from 'react';
import type { BoardDoctor, Token } from '../types/index.js';
import { SOURCE_INFO, STATUS_INFO, formatRange } from '../lib/explain.js';
import { api } from '../lib/api.js';
import { Modal, inputClass } from './Modal.js';

const CHOICES = ['WALK_IN', 'ONLINE', 'FOLLOW_UP', 'PAID_PRIORITY'] as const;

/** Registers a patient: who they are, how they came, and which doctor's hour they want. */
export function CreateTokenModal({ doctors, onClose, onDone }: { doctors: BoardDoctor[]; onClose: () => void; onDone: () => void }) {
  const firstDoctor = doctors.find((d) => !d.unavailable) ?? doctors[0];
  const [doctorId, setDoctorId] = useState(firstDoctor?.id ?? '');
  const [slotId, setSlotId] = useState('');
  const [source, setSource] = useState<(typeof CHOICES)[number]>('WALK_IN');
  const [patientName, setPatientName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Token | null>(null);

  const doctor = doctors.find((d) => d.id === doctorId);
  const openSlots = (doctor?.slots ?? []).filter((s) => s.status === 'OPEN');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!doctorId || !slotId || !patientName.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      setCreated(await api.tokens.create({ doctorId, slotId, source, patientName: patientName.trim() }));
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the ticket');
    } finally {
      setSubmitting(false);
    }
  }

  if (created) {
    const placed = created.status !== 'WAITING';
    return (
      <Modal title="Ticket created" onClose={onClose}>
        <div className={`rounded-lg border p-4 ${placed ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
          <p className="font-mono text-2xl font-semibold text-slate-900">{created.tokenNumber}</p>
          <p className="mt-1 text-sm font-medium text-slate-800">{STATUS_INFO[created.status].label}</p>
          <p className="mt-1 text-sm text-slate-700">
            {placed
              ? `${patientName} has a place with ${doctor?.name}.`
              : `That hour is full, so ${patientName} is waiting. They will get the next place that opens, highest priority first.`}
          </p>
        </div>
        <button onClick={onClose} className="mt-4 w-full rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-900">
          Done
        </button>
      </Modal>
    );
  }

  return (
    <Modal title="New ticket" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="text-sm font-medium text-slate-700" htmlFor="pname">
            Patient's name
          </label>
          <input id="pname" value={patientName} onChange={(e) => setPatientName(e.target.value)} className={inputClass} placeholder="e.g. Rahul Verma" required maxLength={120} />
        </div>

        <fieldset>
          <legend className="text-sm font-medium text-slate-700">How did the patient come?</legend>
          <div className="mt-1 grid gap-2">
            {CHOICES.map((s) => (
              <label key={s} className={`flex cursor-pointer gap-2 rounded-lg border p-2.5 text-sm ${source === s ? 'border-teal-500 bg-teal-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                <input type="radio" name="source" checked={source === s} onChange={() => setSource(s)} className="mt-0.5" />
                <span>
                  <span className="font-medium text-slate-800">{SOURCE_INFO[s].label}</span>
                  <span className="block text-xs text-slate-500">{SOURCE_INFO[s].blurb}</span>
                </span>
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-slate-500">For an emergency, use the red "Add emergency" button instead.</p>
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-slate-700" htmlFor="doc">
              Doctor
            </label>
            <select
              id="doc"
              value={doctorId}
              onChange={(e) => {
                setDoctorId(e.target.value);
                setSlotId('');
              }}
              className={inputClass}
            >
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.specialization}){d.unavailable ? ' - not available' : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700" htmlFor="hour">
              Which hour
            </label>
            <select id="hour" value={slotId} onChange={(e) => setSlotId(e.target.value)} className={inputClass} required>
              <option value="">Choose an hour…</option>
              {openSlots.map((s) => {
                const free = Math.max(0, s.effectiveCapacity - s.placesTaken);
                return (
                  <option key={s.id} value={s.id}>
                    {formatRange(s.startTime, s.endTime)} · {free === 0 ? 'full (will wait)' : `${free} free`}
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        {error && <p className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={submitting} className="w-full rounded-md bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50">
          {submitting ? 'Creating…' : 'Create ticket'}
        </button>
      </form>
    </Modal>
  );
}
