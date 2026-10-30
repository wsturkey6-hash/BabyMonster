import { lazy, Suspense } from 'react';
import { BabySwitcher } from './BabySwitcher';
import DailyStatsPanel from './DailyStatsPage';
import type { PageProps } from './App';

// 趨勢與生長曲線 lazy load：recharts 獨立 chunk（見 vite.config manualChunks），切到那兩種模式才下載
const TrendPanel = lazy(() => import('./TrendPage'));

export type StatsMode = 'daily' | 'trend' | 'growth';

const MODES: { key: StatsMode; label: string }[] = [
  { key: 'daily', label: '每日' },
  { key: 'trend', label: '趨勢' },
  { key: 'growth', label: '生長曲線' },
];

/** 原本的「每日統計」與「趨勢」兩個分頁合併而成，空出的位置給副食品。 */
export default function StatsPage({
  profiles, currentBaby, onSelectBaby, mode, onModeChange,
}: PageProps & { mode: StatsMode; onModeChange: (m: StatsMode) => void }) {
  return (
    <main className="page">
      <header className="page-header">
        <h1>統計</h1>
        <BabySwitcher profiles={profiles} currentBaby={currentBaby} onSelect={onSelectBaby} />
      </header>

      <div className="card">
        <div className="seg" role="group" aria-label="統計模式">
          {MODES.map((m) => (
            <button key={m.key} type="button" className={mode === m.key ? 'selected' : ''}
              aria-pressed={mode === m.key} onClick={() => onModeChange(m.key)}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {mode === 'daily' ? (
        <DailyStatsPanel currentBaby={currentBaby} />
      ) : (
        <Suspense fallback={<p className="hint">載入圖表中…</p>}>
          <TrendPanel currentBaby={currentBaby} mode={mode === 'trend' ? 'daily' : 'growth'} />
        </Suspense>
      )}
    </main>
  );
}
