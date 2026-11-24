import { useState } from 'react';
import { usePolling } from '../hooks/usePolling.js';
import { api } from '../lib/api.js';
import { SummaryBar } from '../components/SummaryBar.js';
import { HowItWorks } from '../components/HowItWorks.js';
import { DoctorBoard } from '../components/DoctorBoard.js';
import { ActivityFeed } from '../components/ActivityFeed.js';
import { TokenDrawer } from '../components/TokenDrawer.js';
import { AllTickets } from '../components/AllTickets.js';
import { CreateTokenModal } from '../components/CreateTokenModal.js';
import { EmergencyModal } from '../components/EmergencyModal.js';

export function Dashboard() {
  const [tick, setTick] = useState(0);
  const board = usePolling(() => api.dashboard.board(), 3000, [tick]);
  const overview = usePolling(() => api.dashboard.overview(), 5000, [tick]);
  const activity = usePolling(() => api.dashboard.activity(40), 3000, [tick]);
  const tokens = usePolling(() => api.tokens.list(), 5000, [tick]);

  const [openId, setOpenId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showEmergency, setShowEmergency] = useState(false);
  const [busyDoctor, setBusyDoctor] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = () => setTick((t) => t + 1);

  async function doctorAction(id: string, fn: () => Promise<unknown>) {
    setBusyDoctor(id);
    setNotice(null);
    try {
      await fn();
      refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'That did not work');
    } finally {
      setBusyDoctor(null);
    }
  }

  const doctors = board.data?.doctors ?? [];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Today at the OPD</h1>
          <p className="text-sm text-slate-500">{new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowEmergency(true)} className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100">
            🚑 Add an emergency
          </button>
          <button onClick={() => setShowCreate(true)} disabled={doctors.length === 0} className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50">
            + New ticket
          </button>
        </div>
      </header>

      {(board.error || overview.error) && (
        <div role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Cannot reach the server ({board.error ?? overview.error}). Is the backend running?
        </div>
      )}
      {notice && (
        <div role="alert" className="mb-4 flex items-start justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}

      <SummaryBar board={board.data} overview={overview.data} />
      <HowItWorks config={board.data?.config} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          {board.loading && !board.data && <div className="h-48 animate-pulse rounded-xl bg-slate-200/60" />}
          {board.data && doctors.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
              No doctors yet. Run <code className="rounded bg-slate-100 px-1">npm run seed</code> in the backend, or open the "Demo day" page.
            </div>
          )}
          {doctors.map((d) => (
            <DoctorBoard
              key={d.id}
              doctor={d}
              onOpen={setOpenId}
              busy={busyDoctor === d.id}
              onDelay={() => doctorAction(d.id, () => api.doctors.delay(d.id, 20))}
              onToggleAvailable={() =>
                doctorAction(d.id, () => (d.unavailable ? api.doctors.markAvailable(d.id) : api.doctors.markUnavailable(d.id, 'Marked unavailable from the dashboard')))
              }
            />
          ))}
        </div>

        <aside className="lg:sticky lg:top-4 lg:self-start">
          <ActivityFeed items={activity.data ?? []} onOpen={setOpenId} />
        </aside>
      </div>

      <div className="mt-6">
        <AllTickets tokens={tokens.data ?? []} onOpen={setOpenId} />
      </div>

      {openId && board.data && <TokenDrawer tokenId={openId} config={board.data.config} onClose={() => setOpenId(null)} onChanged={refresh} />}
      {showCreate && <CreateTokenModal doctors={doctors} onClose={() => setShowCreate(false)} onDone={refresh} />}
      {showEmergency && <EmergencyModal doctors={doctors} onClose={() => setShowEmergency(false)} onDone={refresh} />}
    </div>
  );
}
