import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { loadCurrentBabyId, resolveCurrentBaby, saveCurrentBabyId } from '../db/repository';
import type { ProfileData } from '../logic/types';
import RecordPage from './RecordPage';

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
      {tab === 'stats' && <main className="page"><p>每日統計頁施工中</p></main>}
      {tab === 'trend' && <main className="page"><p>趨勢頁施工中</p></main>}
      {tab === 'settings' && <main className="page"><p>設定頁施工中</p></main>}
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
