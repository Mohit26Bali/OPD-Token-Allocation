import { useMemo, useState } from 'react';
import type { Token, TokenStatus } from '../types/index.js';
import { STATUS_INFO, formatTime } from '../lib/explain.js';
import { SourceChip, StatusChip } from './Chips.js';

const FILTERS: Array<{ id: string; label: string; match: (s: TokenStatus) => boolean }> = [
  { id: 'live', label: 'Still active', match: (s) => ['WAITING', 'ALLOCATED', 'CALLED', 'IN_PROGRESS'].includes(s) },
  { id: 'waiting', label: 'Waiting', match: (s) => s === 'WAITING' },
  { id: 'done', label: 'Finished', match: (s) => s === 'COMPLETED' },
  { id: 'ended', label: 'Cancelled or missed', match: (s) => ['CANCELLED', 'NO_SHOW', 'REJECTED'].includes(s) },
  { id: 'all', label: 'Everything', match: () => true },
];

/** The same tickets as a plain list, for searching by name or number. */
export function AllTickets({ tokens, onOpen }: { tokens: Token[]; onOpen: (id: string) => void }) {
  const [filter, setFilter] = useState('live');
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    const f = FILTERS.find((x) => x.id === filter) ?? FILTERS[0];
    const q = query.trim().toLowerCase();
    return tokens.filter((t) => f.match(t.status) && (!q || t.tokenNumber.toLowerCase().includes(q) || (t.patient?.name ?? '').toLowerCase().includes(q)));
  }, [tokens, filter, query]);

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">All tickets</h2>
          <p className="text-xs text-slate-500">Click a ticket to see its story and what you can do with it.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or number"
            aria-label="Search tickets"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-teal-500 focus:outline-none"
          />
          <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Show" className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
            {FILTERS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2">Ticket</th>
              <th className="px-4 py-2">Patient</th>
              <th className="px-4 py-2">How they came</th>
              <th className="px-4 py-2">Doctor</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Created</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  No tickets match.
                </td>
              </tr>
            )}
            {rows.map((t) => (
              <tr key={t.id} onClick={() => onOpen(t.id)} className="cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50">
                <td className="px-4 py-2 font-mono font-medium text-slate-800">{t.tokenNumber}</td>
                <td className="px-4 py-2 text-slate-700">{t.patient?.name ?? '—'}</td>
                <td className="px-4 py-2">
                  <SourceChip source={t.source} />
                </td>
                <td className="px-4 py-2 text-slate-700">{t.doctor?.name ?? '—'}</td>
                <td className="px-4 py-2">
                  <StatusChip status={t.status} />
                </td>
                <td className="px-4 py-2 text-slate-500" title={STATUS_INFO[t.status].hint}>
                  {formatTime(t.requestedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
