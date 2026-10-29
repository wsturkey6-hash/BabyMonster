import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { loadCurrentBabyId, resolveCurrentBaby, saveCurrentBabyId } from '../db/repository';
import type { ProfileData } from '../logic/types';
import { startAutoSync, useSyncStatus } from '../sync/autoSync';
import RecordPage from './RecordPage';
import StatsPage, { type StatsMode } from './StatsPage';
import FoodPage from './FoodPage';
import SettingsPage from './SettingsPage';
import VaccinePage from './VaccinePage';
import { BowlIcon, ChartIcon, PencilIcon, SettingsIcon, SyringeIcon } from './components/icons';

export interface PageProps {
  profiles: ProfileData[];
  currentBaby: ProfileData | null;
  onSelectBaby: (id: string) => void;
}

type Tab = 'record' | 'stats' | 'food' | 'vaccine' | 'settings';

/**
 * 分頁狀態同步到 URL hash：重新整理、上一頁都能回到原分頁。
 * 統計分頁的三種模式各有自己的 hash；#stats、#trend 是合併前兩個分頁的網址，
 * 主畫面捷徑或書籤可能還留著，照樣打開對應的模式。
 */
const ROUTES: Record<string, { tab: Tab; mode?: StatsMode }> = {
  record: { tab: 'record' },
  stats: { tab: 'stats', mode: 'daily' },
  trend: { tab: 'stats', mode: 'trend' },
  growth: { tab: 'stats', mode: 'growth' },
  food: { tab: 'food' },
  vaccine: { tab: 'vaccine' },
  settings: { tab: 'settings' },
};
const STATS_HASH: Record<StatsMode, string> = { daily: 'stats', trend: 'trend', growth: 'growth' };

function routeFromHash(): { tab: Tab; mode?: StatsMode } {
  return ROUTES[window.location.hash.replace('#', '')] ?? { tab: 'record' };
}

const TABS: { key: Tab; label: string; icon: () => JSX.Element }[] = [
  { key: 'record', label: '記錄', icon: PencilIcon },
  { key: 'stats', label: '統計', icon: ChartIcon },
  { key: 'food', label: '副食品', icon: BowlIcon },
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
        {/* 導覽必須打到網路，Access 才能跑登入；reload 在安裝的 PWA 裡會被 SW 從 precache 回應，
            永遠到不了 Access。/login 已從 SW 的 navigateFallback 排除 */}
        <button type="button" onClick={() => location.assign('/login')}>重新登入</button>
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
  const [tab, setTab] = useState<Tab>(() => routeFromHash().tab);
  // 離開統計分頁再回來時，停在上次看的模式
  const [statsMode, setStatsMode] = useState<StatsMode>(() => routeFromHash().mode ?? 'daily');

  useEffect(() => {
    const onHashChange = () => {
      const r = routeFromHash();
      setTab(r.tab);
      if (r.mode) setStatsMode(r.mode);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => startAutoSync(), []);

  const selectTab = (t: Tab) => {
    setTab(t);
    history.replaceState(null, '', '#' + (t === 'stats' ? STATS_HASH[statsMode] : t));
  };
  const selectStatsMode = (m: StatsMode) => {
    setStatsMode(m);
    history.replaceState(null, '', '#' + STATS_HASH[m]);
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
      {tab === 'stats' && <StatsPage {...pageProps} mode={statsMode} onModeChange={selectStatsMode} />}
      {tab === 'food' && <FoodPage {...pageProps} />}
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
