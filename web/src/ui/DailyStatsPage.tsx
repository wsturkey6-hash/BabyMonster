import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { dailySummary } from '../logic/dailyStats';
import type { RecordData } from '../logic/types';
import { BabySwitcher } from './BabySwitcher';
import { dateInputValue, formatNumber, msFromDateInput } from './format';
import type { PageProps } from './App';

export default function DailyStatsPage({ profiles, currentBaby, onSelectBaby }: PageProps) {
  const [dateStr, setDateStr] = useState(() => dateInputValue(Date.now()));

  const records = useLiveQuery(
    () => (currentBaby ? db.records.where('babyId').equals(currentBaby.id).toArray() : Promise.resolve([] as RecordData[])),
    [currentBaby?.id],
    [] as RecordData[],
  );

  const s = dailySummary(msFromDateInput(dateStr), records);

  return (
    <main className="page">
      <header className="page-header">
        <h1>每日統計</h1>
        <BabySwitcher profiles={profiles} currentBaby={currentBaby} onSelect={onSelectBaby} />
      </header>

      <div className="card">
        <div className="field">
          <label className="field-label">日期</label>
          <input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} />
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">大便次數</div>
          <div className="stat-value">{s.stoolCount}<span className="unit">次</span></div>
        </div>
        <div className="stat-card">
          <div className="label">小便次數</div>
          <div className="stat-value">{s.urineCount}<span className="unit">次</span></div>
        </div>
        <div className="stat-card">
          <div className="label">總喝奶量</div>
          <div className="stat-value">{formatNumber(s.totalFeed)}<span className="unit">ml</span></div>
        </div>
        <div className="stat-card">
          <div className="label">平均體溫</div>
          <div className="stat-value">{formatNumber(s.averageTemperature)}<span className="unit">°C</span></div>
        </div>
        <div className="stat-card">
          <div className="label">平均體重</div>
          <div className="stat-value">{formatNumber(s.averageWeight, 0)}<span className="unit">g</span></div>
        </div>
      </div>
    </main>
  );
}
