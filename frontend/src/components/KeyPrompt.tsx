import { useState } from 'react';
import { getStaffKey, setStaffKey } from '../lib/api.js';

/** Shown when the server says a staff key is needed (or the saved one is wrong). The key stays in this browser only. */
export function KeyPrompt({ onDone }: { onDone: () => void }) {
  const [key, setKey] = useState('');
  const hadKey = Boolean(getStaffKey());

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!key.trim()) return;
    setStaffKey(key.trim());
    onDone();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4" role="dialog" aria-modal="true" aria-label="Staff key needed">
      <form onSubmit={submit} className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-900">Staff key needed</h2>
        <p className="mt-1 text-sm text-slate-600">
          {hadKey ? 'That key was not accepted. Please check it and try again.' : 'This system is for hospital staff. Enter the staff key you were given.'}
        </p>
        <label htmlFor="staffkey" className="mt-4 block text-sm font-medium text-slate-700">
          Staff key
        </label>
        <input
          id="staffkey"
          type="password"
          autoFocus
          autoComplete="off"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
        />
        <button type="submit" className="mt-4 w-full rounded-md bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700">
          Continue
        </button>
        <p className="mt-3 text-xs text-slate-500">It is remembered in this browser only. Remove it any time with "Forget key" in the top bar.</p>
      </form>
    </div>
  );
}
