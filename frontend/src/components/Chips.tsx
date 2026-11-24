import type { TokenSource, TokenStatus } from '../types/index.js';
import { SOURCE_INFO, STATUS_INFO } from '../lib/explain.js';

export function SourceChip({ source }: { source: TokenSource }) {
  const info = SOURCE_INFO[source];
  return (
    <span title={info.blurb} className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${info.chip}`}>
      {info.label}
    </span>
  );
}

export function StatusChip({ status }: { status: TokenStatus }) {
  const info = STATUS_INFO[status];
  return (
    <span title={info.hint} className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${info.chip}`}>
      {info.label}
    </span>
  );
}
