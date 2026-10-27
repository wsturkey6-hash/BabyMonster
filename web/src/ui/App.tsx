import { lazy, Suspense, useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { loadCurrentBabyId, resolveCurrentBaby, saveCurrentBabyId } from '../db/repository';
import type { ProfileData } from '../logic/types';
import { startAutoSync, useSyncStatus } from '../sync/autoSync';
import RecordPage from './RecordPage';
import DailyStatsPage from './DailyStatsPage';
import SettingsPage from './SettingsPage';
import VaccinePage from './VaccinePage';
import { ChartIcon, PencilIcon, SettingsIcon, SyringeIcon, TrendIcon } from './components/icons';

// 趨勢頁 lazy load：recharts 獨立 chunk（見 vite.config manualChunks），開啟趨勢分頁才下載
const TrendPage = lazy(() => import('./TrendPage'));

export interface PageProps {
  profiles: ProfileData[];
  currentBaby: ProfileData | null;
  onSelectBaby: (id: string) => void;
}

type Tab = 'record' | 'stats' | 'trend' | 'vaccine' | 'settings';

const TAB_KEYS = ['record', 'stats', 'trend', 'vaccine', 'settings'] as const;

/** 分頁狀態同步到 URL hash：重新整理、上一頁都能回到原分頁。 */
function tabFromHash(): Tab {
  const h = window.location.hash.replace('#', '');
  return (TAB_KEYS as readonly string[]).includes(h) ? (h as Tab) : 'record';
}

const TABS: { key: Tab; label: string; icon: () => JSX.Element }[] = [
  { key: 'record', label: '記錄', icon: PencilIcon },
  { key: 'stats', label: '每日統計', icon: ChartIcon },
  { key: 'trend', label: '趨勢', icon: TrendIcon },
  { key: 'vaccine', label: '疫苗', icon: SyringeIcon },
  { key: 'settings', label: '設定', icon: SettingsIcon },
];

/** 頁面最上方的同步狀態細條。 */
function SyncStrip() {
  const { phase, lastSync, skipped } = useSyncStatus();
  const pending = useLiveQuery(() => db.outbox.count(), [], 0);
  if (phase === 'needsLogin') {
    return (
      <div className="sync-strip warn" role="status">
        登入已過期，變更暫存在本機
        <button type="button" onClick={() => location.reload()}>重新登入</button>
      </div>
    );
  }
  const text =
    phase === 'syncing' ? '同步中…'
    : phase === 'offline' ? `離線，${pending} 筆待同步`
    : phase === 'serverDown' ? `伺服器暫時連不上，${pending} 筆待同步`
    : phase === 'requestError' ? `同步出現未預期的問題，${pending} 筆待同步`
    : skipped > 0 ? `${skipped} 筆變更被伺服器略過`
    : lastSync ? `已同步 ${new Date(lastSync).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}`
    : '';
  if (!text) return null;
  const warn = phase === 'offline' || phase === 'serverDown' || phase === 'requestError' || skipped > 0;
  return <div className={'sync-strip' + (warn ? ' warn' : '')} role="status">{text}</div>;
}

export default function App() {
  const [tab, setTab] = useState<Tab>(tabFromHash);

  useEffect(() => {
    const onHashChange = () => setTab(tabFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => startAutoSync(), []);

  const selectTab = (t: Tab) => {
    setTab(t);
    history.replaceState(null, '', '#' + t);
  };
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
      <SyncStrip />
      {tab === 'record' && <RecordPage {...pageProps} />}
      {tab === 'stats' && <DailyStatsPage {...pageProps} />}
      {tab === 'trend' && (
        <Suspense fallback={<main className="page"><p className="hint">載入圖表中…</p></main>}>
          <TrendPage {...pageProps} />
        </Suspense>
      )}
      {tab === 'vaccine' && <VaccinePage {...pageProps} />}
      {tab === 'settings' && <SettingsPage {...pageProps} />}
      <nav className="tabbar">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={'tab' + (tab === t.key ? ' active' : '')}
            aria-current={tab === t.key ? 'page' : undefined}
            onClick={() => selectTab(t.key)}
          >
            <span className="icon"><t.icon /></span>
            {t.label}
          </button>
        ))}
      </nav>
    </>
  );
}
