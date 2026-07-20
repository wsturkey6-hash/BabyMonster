import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { createDefaultBaby } from '../db/repository';
import { sameLocalDay } from '../logic/dailyStats';
import { ageDisplayText, babyAge } from '../logic/babyAge';
import { BRISTOL_NAMES, STOOL_AMOUNT_NAMES, type BristolType, type RecordData, type StoolAmount } from '../logic/types';
import { isAbnormalStoolColor } from '../logic/stoolColorCard';
import { BabySwitcher } from './BabySwitcher';
import { BabyFaceIcon } from './components/icons';
import { StoolColorPicker } from './components/StoolColorPicker';
import { datetimeLocalValue, msFromDatetimeLocal, timeHM } from './format';
import type { PageProps } from './App';

const BRISTOL_TYPES: BristolType[] = [1, 2, 3, 4, 5, 6, 7];
const AMOUNTS: StoolAmount[] = ['few', 'medium', 'many'];

const parseNum = (s: string): number | undefined => {
  const n = Number(s);
  return s.trim() !== '' && Number.isFinite(n) ? n : undefined;
};

export default function RecordPage({ profiles, currentBaby, onSelectBaby }: PageProps) {
  const [editing, setEditing] = useState<RecordData | null>(null);
  const [timestamp, setTimestamp] = useState(() => datetimeLocalValue(Date.now()));
  const [feed, setFeed] = useState('');
  const [stoolColor, setStoolColor] = useState<number | null>(null);
  const [stoolAmount, setStoolAmount] = useState<StoolAmount | null>(null);
  const [stoolShape, setStoolShape] = useState<BristolType | null>(null);
  const [urine, setUrine] = useState(false);
  const [temp, setTemp] = useState('');
  const [weight, setWeight] = useState('');
  const [note, setNote] = useState('');

  const todayRecords = useLiveQuery(
    async () => {
      if (!currentBaby) return [] as RecordData[];
      const recs = await db.records.where('babyId').equals(currentBaby.id).toArray();
      return recs
        .filter((r) => sameLocalDay(r.timestamp, Date.now()))
        .sort((a, b) => b.timestamp - a.timestamp);
    },
    [currentBaby?.id],
    [] as RecordData[],
  );

  useEffect(() => {
    if (!editing) return;
    setTimestamp(datetimeLocalValue(editing.timestamp));
    setFeed(editing.feedAmount != null ? String(editing.feedAmount) : '');
    setStoolColor(editing.stoolColor ?? null);
    setStoolAmount(editing.stoolAmount ?? null);
    setStoolShape(editing.stoolShape ?? null);
    setUrine(editing.hasUrine);
    setTemp(editing.temperature != null ? String(editing.temperature) : '');
    setWeight(editing.weight != null ? String(editing.weight) : '');
    setNote(editing.note ?? '');
  }, [editing]);

  function reset() {
    setEditing(null);
    setTimestamp(datetimeLocalValue(Date.now()));
    setFeed('');
    setStoolColor(null);
    setStoolAmount(null);
    setStoolShape(null);
    setUrine(false);
    setTemp('');
    setWeight('');
    setNote('');
  }

  useEffect(() => {
    reset();
    // 切換寶寶時放棄草稿，避免把編輯中的記錄存到另一個寶寶名下
  }, [currentBaby?.id]);

  async function save() {
    let baby = currentBaby;
    if (!baby) {
      baby = await createDefaultBaby();
      onSelectBaby(baby.id);
    }
    const ts = msFromDatetimeLocal(timestamp);
    const rec: RecordData = {
      id: editing?.id ?? crypto.randomUUID(),
      babyId: editing?.babyId ?? baby.id,
      timestamp: Number.isFinite(ts) ? ts : Date.now(),
      hasUrine: urine,
      ...(parseNum(feed) !== undefined ? { feedAmount: parseNum(feed) } : {}),
      ...(stoolColor !== null ? { stoolColor } : {}),
      ...(stoolColor !== null && stoolAmount !== null ? { stoolAmount } : {}),
      ...(stoolColor !== null && stoolShape !== null ? { stoolShape } : {}),
      ...(parseNum(temp) !== undefined ? { temperature: parseNum(temp) } : {}),
      ...(parseNum(weight) !== undefined ? { weight: parseNum(weight) } : {}),
      ...(note.trim() !== '' ? { note: note.trim() } : {}),
    };
    await db.records.put(rec);
    reset();
  }

  async function remove(r: RecordData) {
    if (confirm('刪除這筆記錄？')) {
      await db.records.delete(r.id);
      if (editing?.id === r.id) reset();
    }
  }

  return (
    <main className="page">
      <header className="page-header">
        <h1><span className="h1-icon"><BabyFaceIcon /></span>{currentBaby?.name ?? 'BabyMonster'}</h1>
        {currentBaby && <span className="age">{ageDisplayText(babyAge(currentBaby.birthDate, Date.now()))}</span>}
        <BabySwitcher profiles={profiles} currentBaby={currentBaby} onSelect={onSelectBaby} />
      </header>

      <section className="card">
        <h2>{editing ? '編輯記錄' : '新增記錄'}</h2>
        <div className="field">
          <label className="field-label">時間</label>
          <input type="datetime-local" value={timestamp} onChange={(e) => setTimestamp(e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label">喝奶量（ml）</label>
          <input type="number" inputMode="decimal" placeholder="例：120" value={feed} onChange={(e) => setFeed(e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label">大便顏色（大便卡 1–9 號，1–6 異常）</label>
          <StoolColorPicker value={stoolColor} onChange={(v) => {
            setStoolColor(v);
            if (v === null) { setStoolAmount(null); setStoolShape(null); }
          }} />
        </div>
        {stoolColor !== null && (
          <>
            <div className="field">
              <label className="field-label">大便量</label>
              <div className="seg">
                {AMOUNTS.map((a) => (
                  <button key={a} type="button" className={stoolAmount === a ? 'selected' : ''}
                    onClick={() => setStoolAmount(stoolAmount === a ? null : a)}>
                    {STOOL_AMOUNT_NAMES[a]}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label className="field-label">大便形狀（布里斯托分類）</label>
              <select value={stoolShape ?? ''} onChange={(e) => setStoolShape(e.target.value === '' ? null : (Number(e.target.value) as BristolType))}>
                <option value="">不記錄</option>
                {BRISTOL_TYPES.map((t) => (
                  <option key={t} value={t}>{BRISTOL_NAMES[t]}</option>
                ))}
              </select>
              <p className="hint">新生兒／母乳寶寶的便便天生偏軟，常落在 6–7 型，此量表僅供描述參考。</p>
            </div>
          </>
        )}
        <div className="field">
          <label className="field-label">小便</label>
          <div className="seg">
            <button type="button" className={urine ? 'selected' : ''} onClick={() => setUrine(!urine)}>
              {urine ? '有小便 ✓' : '有小便？'}
            </button>
          </div>
        </div>
        <div className="field">
          <label className="field-label">體溫（°C）</label>
          <input type="number" inputMode="decimal" placeholder="例：36.5" value={temp} onChange={(e) => setTemp(e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label">體重（g）</label>
          <input type="number" inputMode="decimal" placeholder="例：4000" value={weight} onChange={(e) => setWeight(e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label">備註</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <button className="btn btn-primary" type="button" onClick={() => void save()}>
          {editing ? '儲存變更' : '儲存記錄'}
        </button>
        {editing && (
          <button className="btn" type="button" style={{ width: '100%', marginTop: 8 }} onClick={reset}>
            取消編輯
          </button>
        )}
      </section>

      <section className="card">
        <h2>今日記錄</h2>
        {todayRecords.length === 0 && <p className="hint">今天還沒有記錄。</p>}
        <ul className="timeline">
          {todayRecords.map((r) => (
            <li key={r.id} className="timeline-item">
              <span className="time">{timeHM(r.timestamp)}</span>
              <div className="body" onClick={() => setEditing(r)}>
                <div className="chips">
                  {r.feedAmount != null && <span className="chip">🍼 {r.feedAmount} ml</span>}
                  {r.stoolColor != null && (
                    <span className={'chip' + (isAbnormalStoolColor(r.stoolColor) ? ' abnormal' : '')}>
                      💩 {r.stoolColor} 號
                      {r.stoolAmount ? `・${STOOL_AMOUNT_NAMES[r.stoolAmount]}` : ''}
                      {r.stoolShape ? `・第${r.stoolShape}型` : ''}
                    </span>
                  )}
                  {r.hasUrine && <span className="chip">💧 小便</span>}
                  {r.temperature != null && <span className="chip">🌡 {r.temperature} °C</span>}
                  {r.weight != null && <span className="chip">⚖️ {r.weight} g</span>}
                  {r.note && <span className="chip">📝 {r.note}</span>}
                </div>
              </div>
              <button className="btn btn-danger" type="button" onClick={() => void remove(r)}>刪除</button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
