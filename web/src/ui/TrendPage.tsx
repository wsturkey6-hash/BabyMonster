import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { db } from '../db/db';
import {
  TREND_METRIC_CONNECT_GAPS, TREND_METRIC_INTEGER, TREND_METRIC_NAMES, TREND_METRIC_UNITS,
  trendSeries, type TrendMetric,
} from '../logic/trendSeries';
import {
  GROWTH_METRIC_NAMES, GROWTH_METRIC_UNITS, ageInDays, lmsFor, valueAtZ,
  type GrowthMetric, type PercentileResult,
} from '../logic/growthPercentile';
import {
  GROWTH_METRICS, REFERENCE_BANDS, chartMaxMonths, daysToMonths, latestMeasurement,
  measurementSeries, monthsToDays, referenceCurves,
} from '../logic/growthChart';
import { GROWTH_DAY_MAX } from '../logic/growthReference.generated';
import type { RecordData } from '../logic/types';
import { BabySwitcher } from './BabySwitcher';
import { monthDay, ymdSlash } from './format';
import type { PageProps } from './App';

const DAY_CHOICES = [7, 14, 30] as const;
const METRICS = Object.keys(TREND_METRIC_NAMES) as TrendMetric[];

type Mode = 'daily' | 'growth';

/** 小數位數：體重用 kg 給兩位，身高頭圍用 cm 給一位。 */
const DECIMALS: Record<GrowthMetric, number> = { weight: 2, height: 1, headCirc: 1 };

function formatPercentile(r: PercentileResult): string {
  if (r.beyond === 'low') return '< 0.1';
  if (r.beyond === 'high') return '> 99.9';
  if (r.percentile < 1 || r.percentile > 99) return r.percentile.toFixed(1);
  return String(Math.round(r.percentile));
}

/** 中性描述，不下判斷 —— 百分位本來就是同齡比較，落在哪裡都可能正常。 */
function bandLabel(r: PercentileResult): string {
  if (r.percentile < 3) return '低於第 3 百分位';
  if (r.percentile > 97) return '高於第 97 百分位';
  if (r.percentile < 15) return '第 3–15 百分位';
  if (r.percentile > 85) return '第 85–97 百分位';
  return '第 15–85 百分位（中段）';
}

export default function TrendPage({ profiles, currentBaby, onSelectBaby }: PageProps) {
  const [mode, setMode] = useState<Mode>('daily');
  const [days, setDays] = useState(7);
  const [customDays, setCustomDays] = useState('');
  const [metric, setMetric] = useState<TrendMetric>('stoolCount');
  const [growthMetric, setGrowthMetric] = useState<GrowthMetric>('weight');

  const records = useLiveQuery(
    () => (currentBaby ? db.records.where('babyId').equals(currentBaby.id).toArray() : Promise.resolve([] as RecordData[])),
    [currentBaby?.id],
    [] as RecordData[],
  );

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
          <span className="field-label">看什麼</span>
          <div className="seg">
            <button type="button" className={mode === 'daily' ? 'selected' : ''} aria-pressed={mode === 'daily'}
              onClick={() => setMode('daily')}>日常趨勢</button>
            <button type="button" className={mode === 'growth' ? 'selected' : ''} aria-pressed={mode === 'growth'}
              onClick={() => setMode('growth')}>生長曲線</button>
          </div>
        </div>
      </div>

      {mode === 'daily'
        ? <DailyTrend
            days={days} setDays={setDays} customDays={customDays} applyCustom={applyCustom}
            setCustomDays={setCustomDays} metric={metric} setMetric={setMetric} records={records} />
        : <GrowthCurve
            baby={currentBaby} records={records}
            metric={growthMetric} setMetric={setGrowthMetric} />}
    </main>
  );
}

// ---- 日常趨勢 ----

function DailyTrend({
  days, setDays, customDays, applyCustom, setCustomDays, metric, setMetric, records,
}: {
  days: number;
  setDays: (n: number) => void;
  customDays: string;
  applyCustom: (v: string) => void;
  setCustomDays: (v: string) => void;
  metric: TrendMetric;
  setMetric: (m: TrendMetric) => void;
  records: RecordData[];
}) {
  const series = trendSeries(metric, days, Date.now(), records);
  const data = series.map((p) => ({ label: monthDay(p.dayMs), value: p.value }));
  const connect = TREND_METRIC_CONNECT_GAPS[metric];

  return (
    <>
      <div className="card">
        <div className="field">
          <span className="field-label">天數</span>
          <div className="seg">
            {DAY_CHOICES.map((d) => (
              <button key={d} type="button" className={days === d && customDays === '' ? 'selected' : ''}
                aria-pressed={days === d && customDays === ''}
                onClick={() => { setDays(d); setCustomDays(''); }}>
                {d} 天
              </button>
            ))}
            <input
              type="number" inputMode="numeric" placeholder="自訂" value={customDays}
              aria-label="自訂天數（1–365）" name="customDays" autoComplete="off"
              className="seg-input"
              onChange={(e) => applyCustom(e.target.value)}
            />
          </div>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="trend-metric">指標</label>
          <select id="trend-metric" value={metric} onChange={(e) => setMetric(e.target.value as TrendMetric)}>
            {METRICS.map((m) => (
              <option key={m} value={m}>{TREND_METRIC_NAMES[m]}（{TREND_METRIC_UNITS[m]}）</option>
            ))}
          </select>
          {connect && (
            <p className="hint">身高、頭圍這類不是天天量的指標，沒記錄的日子會直接連過去，才看得出成長走勢。</p>
          )}
        </div>
      </div>

      <div className="card">
        <h2>{TREND_METRIC_NAMES[metric]}（{TREND_METRIC_UNITS[metric]}）・近 {days} 天</h2>
        <div role="img" aria-label={`${TREND_METRIC_NAMES[metric]}近 ${days} 天的折線圖`}>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f6e5cf" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} interval="preserveStartEnd" />
              <YAxis
                tick={{ fontSize: 12 }}
                domain={connect ? ['auto', 'auto'] : [0, 'auto']}
                allowDecimals={!TREND_METRIC_INTEGER[metric]}
              />
              <Tooltip formatter={(v) => [v == null ? '—' : `${v} ${TREND_METRIC_UNITS[metric]}`, TREND_METRIC_NAMES[metric]]} />
              <Line type="monotone" dataKey="value" stroke="#ea580c" strokeWidth={2.5}
                dot={{ r: 3, fill: '#f97316' }} connectNulls={connect} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  );
}

// ---- 生長曲線 ----

const BAND_COLORS: Record<number, string> = {
  3: '#d9c3a5',
  15: '#c9a87c',
  50: '#a3743c',
  85: '#c9a87c',
  97: '#d9c3a5',
};

function GrowthCurve({
  baby, records, metric, setMetric,
}: {
  baby: PageProps['currentBaby'];
  records: RecordData[];
  metric: GrowthMetric;
  setMetric: (m: GrowthMetric) => void;
}) {
  if (!baby) {
    return <div className="card"><p className="hint">還沒有寶寶資料，先到記錄頁存一筆記錄就會自動建立。</p></div>;
  }

  const summaries = GROWTH_METRICS.map((m) => ({ metric: m, latest: latestMeasurement(m, baby, records) }));
  const ageDaysNow = ageInDays(baby.birthDate, Date.now());

  if (!baby.sex) {
    return (
      <div className="card">
        <h2>生長曲線</h2>
        <p className="hint">
          生長曲線的參考標準男女不同，要先設定寶寶的性別才算得出百分位。
          請到「設定 → 點寶寶的名字」選擇男寶寶或女寶寶。
        </p>
        {summaries.some((s) => s.latest) && (
          <>
            <p className="hint">目前已記錄的測量值：</p>
            <ul className="timeline">
              {summaries.filter((s) => s.latest).map((s) => (
                <li key={s.metric} className="timeline-item">
                  <span className="chips">
                    <span className="chip">
                      {GROWTH_METRIC_NAMES[s.metric]} {s.latest!.value.toFixed(DECIMALS[s.metric])} {GROWTH_METRIC_UNITS[s.metric]}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    );
  }

  if (ageDaysNow > GROWTH_DAY_MAX) {
    return (
      <div className="card">
        <h2>生長曲線</h2>
        <p className="hint">WHO 兒童生長標準到 5 歲為止，{baby.name} 已經超過這個範圍了。</p>
      </div>
    );
  }

  const selected = summaries.find((s) => s.metric === metric)!.latest;
  const anchorDays = selected?.ageDays ?? Math.max(0, ageDaysNow);
  const maxMonths = chartMaxMonths(Math.max(anchorDays, ageDaysNow));
  const maxDays = Math.min(monthsToDays(maxMonths), GROWTH_DAY_MAX);

  const curves = referenceCurves(metric, baby.sex, maxDays);
  const series = measurementSeries(metric, baby, records);

  // 同一天量多次時取平均，與統計頁的慣例一致
  const byDay = new Map<number, number[]>();
  for (const p of series) {
    if (p.ageDays > maxDays) continue;
    const arr = byDay.get(p.ageDays) ?? [];
    arr.push(p.value);
    byDay.set(p.ageDays, arr);
  }

  const xs = new Set<number>(curves[0]?.points.map((p) => p.ageDays) ?? []);
  for (const day of byDay.keys()) xs.add(day);

  const data = [...xs].sort((a, b) => a - b).map((ageDays) => {
    const lms = lmsFor(metric, baby.sex!, ageDays);
    const row: Record<string, number> = { months: Number(daysToMonths(ageDays).toFixed(2)) };
    if (lms) for (const b of REFERENCE_BANDS) row[`p${b.percentile}`] = Number(valueAtZ(lms, b.z).toFixed(3));
    const vals = byDay.get(ageDays);
    if (vals) row.baby = Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(3));
    return row;
  });

  const unit = GROWTH_METRIC_UNITS[metric];
  const hasPoints = byDay.size > 0;

  return (
    <>
      <div className="card">
        <h2>目前落點</h2>
        {summaries.every((s) => !s.latest) && (
          <p className="hint">還沒有身高、體重或頭圍的記錄。到記錄頁填一筆，這裡就會算出百分位。</p>
        )}
        <ul className="timeline">
          {summaries.map(({ metric: m, latest }) => (
            <li key={m} className="timeline-item">
              <span className="time">{GROWTH_METRIC_NAMES[m]}</span>
              <span className="body">
                <span className="chips">
                  {latest ? (
                    <>
                      <span className="chip">{latest.value.toFixed(DECIMALS[m])} {GROWTH_METRIC_UNITS[m]}</span>
                      {latest.result ? (
                        <>
                          <span className="chip">第 {formatPercentile(latest.result)} 百分位</span>
                          <span className="chip">{bandLabel(latest.result)}</span>
                        </>
                      ) : (
                        <span className="chip">超出 WHO 年齡範圍</span>
                      )}
                      <span className="chip">{ymdSlash(latest.timestamp)} 量</span>
                    </>
                  ) : (
                    <span className="chip">還沒有記錄</span>
                  )}
                </span>
              </span>
            </li>
          ))}
        </ul>
        <p className="hint">
          百分位是跟同年齡、同性別的寶寶比較。例如第 45 百分位代表 100 個同齡寶寶裡約有 45 個比他小。
          落在哪一段都可能是正常的，重點是沿著自己的曲線穩定成長；若短時間內明顯偏離，再請教醫師。
        </p>
      </div>

      <div className="card">
        <div className="field">
          <span className="field-label">看哪個指標</span>
          <div className="seg">
            {GROWTH_METRICS.map((m) => (
              <button key={m} type="button" className={metric === m ? 'selected' : ''}
                aria-pressed={metric === m} onClick={() => setMetric(m)}>
                {GROWTH_METRIC_NAMES[m]}
              </button>
            ))}
          </div>
        </div>

        <h2>{GROWTH_METRIC_NAMES[metric]}生長曲線（{unit}）</h2>
        {!hasPoints && (
          <p className="hint">還沒有{GROWTH_METRIC_NAMES[metric]}的記錄，圖上只有參考曲線。</p>
        )}
        <div role="img" aria-label={`${GROWTH_METRIC_NAMES[metric]}的生長曲線圖，含第 3、15、50、85、97 百分位參考線`}>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={data} margin={{ top: 8, right: 28, bottom: 4, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f6e5cf" />
              <XAxis dataKey="months" type="number" domain={[0, maxMonths]}
                ticks={Array.from({ length: maxMonths <= 12 ? maxMonths / 3 + 1 : 7 },
                  (_, i) => Math.round((maxMonths / (maxMonths <= 12 ? maxMonths / 3 : 6)) * i))}
                tick={{ fontSize: 12 }}
                label={{ value: '月齡', position: 'insideBottomRight', offset: -2, fontSize: 11 }} />
              <YAxis tick={{ fontSize: 12 }} domain={['auto', 'auto']} />
              <Tooltip
                labelFormatter={(v) => `${Number(v).toFixed(1)} 個月大`}
                formatter={(value, name) => [
                  `${value} ${unit}`,
                  name === 'baby' ? GROWTH_METRIC_NAMES[metric] : `第 ${String(name).slice(1)} 百分位`,
                ]}
              />
              {REFERENCE_BANDS.map((b) => (
                <Line key={b.percentile} type="monotone" dataKey={`p${b.percentile}`}
                  stroke={BAND_COLORS[b.percentile]} strokeWidth={b.percentile === 50 ? 2 : 1.2}
                  strokeDasharray={b.percentile === 50 ? undefined : '4 3'}
                  dot={false} isAnimationActive={false} />
              ))}
              <Line type="monotone" dataKey="baby" stroke="#ea580c" strokeWidth={2.5}
                dot={{ r: 3.5, fill: '#f97316' }} connectNulls isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="hint">
          灰色虛線由外而內是第 3、15、85、97 百分位，中間實線是第 50 百分位（中位數）；橘線是 {baby.name}。
          {metric === 'height' && ' 滿 2 歲時參考線會有一個小落差，那是 WHO 從躺著量身長改成站著量身高造成的，不是資料錯誤。'}
        </p>
      </div>
    </>
  );
}
