import { useState } from 'react';
import type { BoardDoctor, Token } from '../types/index.js';
import { api } from '../lib/api.js';
import { STATUS_INFO } from '../lib/explain.js';
import { Modal, inputClass } from './Modal.js';

export function EmergencyModal({ doctors, onClose, onDone }: { doctors: BoardDoctor[]; onClose: () => void; onDone: () => void }) {
  const [doctorId, setDoctorId] = useState(doctors.find((d) => !d.unavailable)?.id ?? doctors[0]?.id ?? '');
  const [patientName, setPatientName] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ token: Token; displaced: { displacedTokenId: string; movedToSlotId: string | null } | null } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!doctorId || !patientName.trim() || !reason.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      setResult(await api.emergencies.create({ doctorId, patientName: patientName.trim(), reason: reason.trim() }));
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the emergency');
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <Modal title="Emergency added" onClose={onClose}>
        <div className="space-y-3 text-sm">
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="font-mono text-2xl font-semibold text-red-800">{result.token.tokenNumber}</p>
            <p className="mt-1 font-medium text-red-800">{STATUS_INFO[result.token.status].label}</p>
          </div>
          {result.displaced ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
              <p className="font-medium">Everything was full, so someone was moved.</p>
              <p className="mt-1">
                The lowest-priority patient with a place gave theirs up
                {result.displaced.movedToSlotId ? ' and was moved to another hour.' : ' and is now waiting. No other hour had room. They have not been dropped.'}
              </p>
            </div>
          ) : (
            <p className="text-slate-700">There was a free place, so nobody had to be moved.</p>
          )}
          <button onClick={onClose} className="w-full rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-900">
            Done
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Add an emergency" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-900">
          Emergencies go to the front. If the doctor's hour is full, the lowest-priority patient who has a place is moved to another hour to make room.
        </p>
        <div>
          <label className="text-sm font-medium text-slate-700" htmlFor="ename">
            Patient's name
          </label>
          <input id="ename" value={patientName} onChange={(e) => setPatientName(e.target.value)} className={inputClass} required maxLength={120} />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700" htmlFor="edoc">
            Doctor
          </label>
          <select id="edoc" value={doctorId} onChange={(e) => setDoctorId(e.target.value)} className={inputClass}>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.specialization}){d.unavailable ? ' - not available' : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700" htmlFor="ereason">
            What is the emergency?
          </label>
          <input id="ereason" value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} placeholder="e.g. Chest pain" required maxLength={300} />
        </div>
        {error && <p className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={submitting} className="w-full rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
          {submitting ? 'Adding…' : 'Add emergency'}
        </button>
      </form>
    </Modal>
  );
}
