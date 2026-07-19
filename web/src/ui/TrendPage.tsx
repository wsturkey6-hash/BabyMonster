import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { db } from '../db/db';
import {
  TREND_METRIC_NAMES, TREND_METRIC_UNITS, trendSeries, type TrendMetric,
} from '../logic/trendSeries';
import type { RecordData } from '../logic/types';
import { BabySwitcher } from './BabySwitcher';
import { monthDay } from './format';
import type { PageProps } from './App';

const DAY_CHOICES = [7, 14, 30] as const;
const METRICS = Object.keys(TREND_METRIC_NAMES) as TrendMetric[];

export default function TrendPage({ profiles, currentBaby, onSelectBaby }: PageProps) {
  const [days, setDays] = useState(7);
  const [customDays, setCustomDays] = useState('');
  const [metric, setMetric] = useState<TrendMetric>('stoolCount');

  const records = useLiveQuery(
    () => (currentBaby ? db.records.where('babyId').equals(currentBaby.id).toArray() : Promise.resolve([] as RecordData[])),
    [currentBaby?.id],
    [] as RecordData[],
  );

  const series = trendSeries(metric, days, Date.now(), records);
  const data = series.map((p) => ({ label: monthDay(p.dayMs), value: p.value }));

  function applyCustom(v: string) {
    setCustomDays(v);
    const n = Number(v);
    if (Number.isInteger(n) && n > 0 && n <= 365) setDays(n);
  }

  return (
    <main className="page">
      <header className="page-header">
        <h1>趨勢</h1>
        <BabySwitcher profiles={profiles} currentBaby={currentBaby} onSelect={onSelectBaby} />
      </header>

      <div className="card">
        <div className="field">
          <label className="field-label">天數</label>
          <div className="seg">
            {DAY_CHOICES.map((d) => (
              <button key={d} type="button" className={days === d && customDays === '' ? 'selected' : ''}
                onClick={() => { setDays(d); setCustomDays(''); }}>
                {d} 天
              </button>
            ))}
            <input
              type="number" inputMode="numeric" placeholder="自訂" value={customDays}
              onChange={(e) => applyCustom(e.target.value)}
              style={{ width: 72, padding: '8px 10px', fontSize: 15, border: '1px solid #ddd', borderRadius: 999 }}
            />
          </div>
        </div>
        <div className="field">
          <label className="field-label">指標</label>
          <select value={metric} onChange={(e) => setMetric(e.target.value as TrendMetric)}>
            {METRICS.map((m) => (
              <option key={m} value={m}>{TREND_METRIC_NAMES[m]}（{TREND_METRIC_UNITS[m]}）</option>
            ))}
          </select>
        </div>
      </div>

      <div className="card">
        <h2>{TREND_METRIC_NAMES[metric]}（{TREND_METRIC_UNITS[metric]}）・近 {days} 天</h2>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip formatter={(v) => [v == null ? '—' : `${v} ${TREND_METRIC_UNITS[metric]}`, TREND_METRIC_NAMES[metric]]} />
            <Line type="monotone" dataKey="value" stroke="#f4a940" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </main>
  );
}
