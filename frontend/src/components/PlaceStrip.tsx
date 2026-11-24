import type { BoardSlot, BoardToken } from '../types/index.js';
import { SOURCE_INFO, STATUS_INFO } from '../lib/explain.js';

/**
 * One hour with one doctor, drawn as a row of boxes: one box per place.
 *   filled, coloured   a ticket holds this place (the colour is how the patient joined)
 *   dashed red         kept free for an emergency
 *   dashed amber       kept free for a paid-priority patient
 *   plain outline      free for anyone
 *   hatched grey       lost because the doctor is running late
 */
export function PlaceStrip({ slot, onOpen }: { slot: BoardSlot; onOpen: (tokenId: string) => void }) {
  const emergencyTaken = slot.holding.filter((t) => t.source === 'EMERGENCY').length;
  const paidTaken = slot.holding.filter((t) => t.source === 'PAID_PRIORITY').length;
  const remaining = Math.max(0, slot.effectiveCapacity - slot.placesTaken);

  // Reserved places are only "kept" until the reserve is released (after general patients have waited long enough)
  const keepEmergency = slot.reserveReleased ? 0 : Math.min(Math.max(0, slot.emergencyReserve - emergencyTaken), remaining);
  const keepPaid = slot.reserveReleased ? 0 : Math.min(Math.max(0, slot.paidReserve - paidTaken), remaining - keepEmergency);
  const open = remaining - keepEmergency - keepPaid;
  const lost = Math.max(0, slot.maximumCapacity - slot.effectiveCapacity);

  return (
    <div className="flex flex-wrap gap-1.5" role="list" aria-label="Places in this hour">
      {slot.holding.map((t) => (
        <FilledBox key={t.id} token={t} onOpen={onOpen} />
      ))}
      {Array.from({ length: keepEmergency }, (_, i) => (
        <Box key={`e${i}`} title="Kept free for an emergency" className="border-2 border-dashed border-red-400 bg-red-50 text-red-500">
          🚑
        </Box>
      ))}
      {Array.from({ length: keepPaid }, (_, i) => (
        <Box key={`p${i}`} title="Kept free for a paid-priority patient" className="border-2 border-dashed border-amber-400 bg-amber-50 text-amber-600">
          ⭐
        </Box>
      ))}
      {Array.from({ length: open }, (_, i) => (
        <Box key={`o${i}`} title="Free place" className="border border-slate-300 bg-white text-slate-300">
          free
        </Box>
      ))}
      {Array.from({ length: lost }, (_, i) => (
        <Box
          key={`l${i}`}
          title="Not available: the doctor is running late, so there is no time left for this place"
          className="border border-slate-300 bg-[repeating-linear-gradient(45deg,#e2e8f0,#e2e8f0_4px,#f8fafc_4px,#f8fafc_8px)] text-slate-400"
        >
          late
        </Box>
      ))}
    </div>
  );
}

function Box({ children, className, title }: { children: React.ReactNode; className: string; title: string }) {
  return (
    <div
      role="listitem"
      title={title}
      className={`flex h-9 w-14 items-center justify-center rounded-md text-[11px] font-medium ${className}`}
    >
      {children}
    </div>
  );
}

function FilledBox({ token, onOpen }: { token: BoardToken; onOpen: (tokenId: string) => void }) {
  const source = SOURCE_INFO[token.source];
  const done = token.status === 'COMPLETED';
  const label = `${token.tokenNumber}, ${token.patientName}, ${source.label}, ${STATUS_INFO[token.status].label}`;
  return (
    <button
      role="listitem"
      onClick={() => onOpen(token.id)}
      title={label}
      aria-label={label}
      className={`relative flex h-9 w-14 items-center justify-center rounded-md border font-mono text-xs font-semibold shadow-sm transition hover:-translate-y-0.5 hover:shadow focus:outline-none focus:ring-2 focus:ring-teal-500 ${source.box} ${
        done ? 'opacity-45' : ''
      }`}
    >
      {token.tokenNumber}
      {token.status === 'CALLED' && <Dot color="bg-blue-300" />}
      {token.status === 'IN_PROGRESS' && <Dot color="bg-white animate-pulse" />}
      {done && <span className="absolute -right-1 -top-1 text-[10px]">✓</span>}
    </button>
  );
}

function Dot({ color }: { color: string }) {
  return <span className={`absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border border-white ${color}`} />;
}
