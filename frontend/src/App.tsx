import { useEffect, useState } from 'react';
import { AUTH_NEEDED_EVENT, getStaffKey, setStaffKey } from './lib/api.js';
import { KeyPrompt } from './components/KeyPrompt.js';
import { Dashboard } from './pages/Dashboard.js';
import { Simulation } from './pages/Simulation.js';

type Tab = 'today' | 'demo';

export default function App() {
  const [tab, setTab] = useState<Tab>('today');
  const [needKey, setNeedKey] = useState(false);

  useEffect(() => {
    const show = () => setNeedKey(true);
    window.addEventListener(AUTH_NEEDED_EVENT, show);
    return () => window.removeEventListener(AUTH_NEEDED_EVENT, show);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <nav className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center gap-1 px-4">
          <span className="mr-4 py-3 text-sm font-semibold text-slate-900">OPD Token Engine</span>
          <TabButton active={tab === 'today'} onClick={() => setTab('today')}>
            Today
          </TabButton>
          <TabButton active={tab === 'demo'} onClick={() => setTab('demo')}>
            Demo day
          </TabButton>
          {getStaffKey() && (
            <button
              onClick={() => {
                setStaffKey('');
                window.location.reload();
              }}
              className="ml-auto py-3 text-xs text-slate-500 hover:text-slate-800"
            >
              Forget key
            </button>
          )}
        </div>
      </nav>
      {tab === 'today' ? <Dashboard /> : <Simulation onShowBoard={() => setTab('today')} />}
      {needKey && <KeyPrompt onDone={() => window.location.reload()} />}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`border-b-2 px-3 py-3 text-sm font-medium transition-colors ${active ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
    >
      {children}
    </button>
  );
}
