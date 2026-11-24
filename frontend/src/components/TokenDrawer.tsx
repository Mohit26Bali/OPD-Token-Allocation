import { useEffect, useState } from 'react';
import type { Board, Token } from '../types/index.js';
import { api } from '../lib/api.js';
import {
  ACTIONS_BY_STATUS,
  JOURNEY,
  SOURCE_INFO,
  STATUS_INFO,
  describeEvent,
  explainPriority,
  formatRange,
  formatTime,
  type TokenAction,
} from '../lib/explain.js';
import { SourceChip, StatusChip } from './Chips.js';

/** Everything about one ticket: where it is on its journey, what to do next, and why the system decided what it did. */
export function TokenDrawer({
  tokenId,
  config,
  onClose,
  onChanged,
}: {
  tokenId: string;
  config: Board['config'];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [token, setToken] = useState<Token | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setToken(await api.tokens.get(tokenId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this ticket');
    }
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, 4000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function run(action: TokenAction, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setError(null);
    try {
      const calls = { call: api.tokens.call, start: api.tokens.start, complete: api.tokens.complete, noShow: api.tokens.noShow, cancel: api.tokens.cancel };
      await calls[action](tokenId);
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work');
    } finally {
      setBusy(false);
    }
  }

  const events = [...(token?.events ?? [])].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const status = token ? STATUS_INFO[token.status] : null;
  const actions = token ? ACTIONS_BY_STATUS[token.status] ?? [] : [];
  const waitMinutes = token ? Math.max(0, Math.floor((Date.now() - new Date(token.requestedAt).getTime()) / 60_000)) : 0;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/30" onClick={onClose} role="dialog" aria-modal="true" aria-label="Ticket details">
      <div className="h-full w-full max-w-lg overflow-y-auto bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
          <h2 className="text-lg font-semibold text-slate-900">{token ? `Ticket ${token.tokenNumber}` : 'Ticket'}</h2>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
            ✕
          </button>
        </div>

        {!token && !error && <p className="p-5 text-sm text-slate-500">Loading…</p>}
        {error && <p className="m-5 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        {token && status && (
          <div className="space-y-6 p-5">
            <div>
              <p className="text-2xl font-semibold text-slate-900">{token.patient?.name ?? 'Unknown patient'}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <SourceChip source={token.source} />
                <StatusChip status={token.status} />
              </div>
              <p className="mt-3 text-sm text-slate-600">{status.hint}</p>
            </div>

            <Journey step={status.step} ended={status.step < 0 ? status.label : null} />

            {actions.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">What you can do</p>
                <div className="flex flex-wrap gap-2">
                  {actions.map((a) => (
                    <button
                      key={a.action}
                      disabled={busy}
                      onClick={() => run(a.action, a.confirm)}
                      className={`rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 ${
                        a.primary ? 'bg-teal-600 text-white hover:bg-teal-700' : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <Fact label="Doctor" value={token.doctor?.name ?? '—'} />
              <Fact label="Hour" value={token.slot ? formatRange(token.slot.startTime, token.slot.endTime) : '—'} />
              <Fact label="Ticket created" value={formatTime(token.requestedAt)} />
              <Fact label="Got a place" value={token.allocatedAt ? formatTime(token.allocatedAt) : 'Not yet'} />
            </dl>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Priority</p>
              <p className="mt-1 text-sm text-slate-700">
                {explainPriority(token.source, waitMinutes, token.priorityScoreAtIntake + Math.floor(waitMinutes / config.agingIntervalMinutes) * config.agingPointsPerInterval, config)}
              </p>
              <p className="mt-1 text-xs text-slate-500">{SOURCE_INFO[token.source].blurb}</p>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Why did this happen? The ticket's story</p>
              <ol className="space-y-2">
                {events.length === 0 && <li className="text-sm text-slate-400">Nothing recorded yet.</li>}
                {events.map((e) => {
                  const d = describeEvent({
                    id: e.id,
                    type: e.type,
                    createdAt: e.createdAt,
                    reason: e.reason,
                    tokenId: token.id,
                    tokenNumber: token.tokenNumber,
                    tokenSource: token.source,
                    patientName: token.patient?.name ?? null,
                    doctorName: token.doctor?.name ?? null,
                    slotStart: token.slot?.startTime ?? null,
                    slotEnd: token.slot?.endTime ?? null,
                  });
                  return (
                    <li key={e.id} className="rounded-lg border border-slate-200 p-3">
                      <div className="flex items-start gap-2">
                        <span aria-hidden>{d.icon}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-slate-800">{d.text}</p>
                          <p className="text-xs text-slate-400">{formatTime(e.createdAt)}</p>
                          <details className="mt-1">
                            <summary className="cursor-pointer text-xs text-teal-700 hover:underline">Show the system's own explanation</summary>
                            <p className="mt-1 text-xs leading-relaxed text-slate-600">{e.reason}</p>
                          </details>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="font-medium text-slate-800">{value}</dd>
    </div>
  );
}

function Journey({ step, ended }: { step: number; ended: string | null }) {
  if (ended) {
    return <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm font-medium text-slate-700">This ticket ended: {ended.toLowerCase()}.</p>;
  }
  return (
    <ol className="flex items-center" aria-label="Where this ticket is on its journey">
      {JOURNEY.map((label, i) => {
        const done = i < step;
        const current = i === step;
        return (
          <li key={label} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold ${
                  current ? 'border-teal-600 bg-teal-600 text-white' : done ? 'border-teal-600 bg-teal-50 text-teal-700' : 'border-slate-300 bg-white text-slate-400'
                }`}
              >
                {done ? '✓' : i + 1}
              </span>
              <span className={`text-center text-[11px] leading-tight ${current ? 'font-semibold text-slate-900' : 'text-slate-500'}`}>{label}</span>
            </div>
            {i < JOURNEY.length - 1 && <span className={`mx-1 mb-5 h-0.5 flex-1 ${done ? 'bg-teal-500' : 'bg-slate-200'}`} />}
          </li>
        );
      })}
    </ol>
  );
}
