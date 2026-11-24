import type { ActivityItem } from '../types/index.js';
import { TONE_CLASS, describeEvent, timeAgo } from '../lib/explain.js';

/** "What just happened": the latest events, each as a sentence. Click one that mentions a ticket to see that ticket. */
export function ActivityFeed({ items, onOpen }: { items: ActivityItem[]; onOpen: (tokenId: string) => void }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-100 p-4">
        <h2 className="text-base font-semibold text-slate-900">What just happened</h2>
        <p className="text-xs text-slate-500">The newest event is on top. This updates by itself.</p>
      </header>
      <ol className="max-h-[70vh] space-y-2 overflow-y-auto p-3">
        {items.length === 0 && <li className="p-3 text-sm text-slate-400">Nothing yet. Create a ticket to see it appear here.</li>}
        {items.map((item) => {
          const { icon, tone, text } = describeEvent(item);
          const body = (
            <>
              <span className="text-base leading-5" aria-hidden>
                {icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm leading-snug text-slate-800">{text}</span>
                <span className="block text-xs text-slate-400">{timeAgo(item.createdAt)}</span>
              </span>
            </>
          );
          return (
            <li key={item.id}>
              {item.tokenId ? (
                <button onClick={() => onOpen(item.tokenId!)} className={`flex w-full gap-2 rounded-lg border p-2.5 text-left hover:border-slate-400 ${TONE_CLASS[tone]}`}>
                  {body}
                </button>
              ) : (
                <div className={`flex gap-2 rounded-lg border p-2.5 ${TONE_CLASS[tone]}`}>{body}</div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
