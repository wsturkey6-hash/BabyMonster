import { lazy, Suspense, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { loadCurrentBabyId, resolveCurrentBaby, saveCurrentBabyId } from '../db/repository';
import type { ProfileData } from '../logic/types';
import RecordPage from './RecordPage';
import DailyStatsPage from './DailyStatsPage';
import SettingsPage from './SettingsPage';

// 趨勢頁 lazy load：recharts 獨立 chunk（見 vite.config manualChunks），開啟趨勢分頁才下載
const TrendPage = lazy(() => import('./TrendPage'));

export interface PageProps {
  profiles: ProfileData[];
  currentBaby: ProfileData | null;
  onSelectBaby: (id: string) => void;
}

type Tab = 'record' | 'stats' | 'trend' | 'settings';

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'record', label: '記錄', icon: '📝' },
  { key: 'stats', label: '每日統計', icon: '📊' },
  { key: 'trend', label: '趨勢', icon: '📈' },
  { key: 'settings', label: '設定', icon: '⚙️' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('record');
  const profiles = useLiveQuery(() => db.profiles.toArray(), [], [] as ProfileData[]);
  const [storedBabyId, setStoredBabyId] = useState<string | null>(loadCurrentBabyId);
  const currentBaby = resolveCurrentBaby(profiles, storedBabyId);

  const onSelectBaby = (id: string) => {
    saveCurrentBabyId(id);
    setStoredBabyId(id);
  };

  const pageProps: PageProps = { profiles, currentBaby, onSelectBaby };

  return (
    <>
      {tab === 'record' && <RecordPage {...pageProps} />}
      {tab === 'stats' && <DailyStatsPage {...pageProps} />}
      {tab === 'trend' && (
        <Suspense fallback={<main className="page"><p className="hint">載入圖表中…</p></main>}>
          <TrendPage {...pageProps} />
        </Suspense>
      )}
      {tab === 'settings' && <SettingsPage {...pageProps} />}
      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.key} className={'tab' + (tab === t.key ? ' active' : '')} onClick={() => setTab(t.key)}>
            <span className="icon">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
    </>
  );
}
