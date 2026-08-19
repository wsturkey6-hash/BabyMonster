import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { createDefaultBaby } from '../db/repository';
import { sameLocalDay } from '../logic/dailyStats';
import { ageDisplayText, babyAge } from '../logic/babyAge';
import { AMOUNT_NAMES, BRISTOL_NAMES, SLEEP_EVENT_NAMES, type Amount, type BristolType, type RecordData, type SleepEvent } from '../logic/types';
import { isAbnormalStoolColor } from '../logic/stoolColorCard';
import { BabySwitcher } from './BabySwitcher';
import { ConfirmDialog } from './components/ConfirmDialog';
import { BabyFaceIcon } from './components/icons';
import { StoolColorPicker } from './components/StoolColorPicker';
import { dateInputValue, datetimeLocalValue, monthDay, msFromDatetimeLocal, timeHM } from './format';
import type { PageProps } from './App';

const BRISTOL_TYPES: BristolType[] = [1, 2, 3, 4, 5, 6, 7];
const AMOUNTS: Amount[] = ['few', 'medium', 'many'];
const SLEEP_EVENTS: SleepEvent[] = ['start', 'end'];

const parseNum = (s: string): number | undefined => {
  const n = Number(s);
  return s.trim() !== '' && Number.isFinite(n) ? n : undefined;
};

export default function RecordPage({ profiles, currentBaby, onSelectBaby }: PageProps) {
  const [editing, setEditing] = useState<RecordData | null>(null);
  const [pendingDelete, setPendingDelete] = useState<RecordData | null>(null);
  const [timestamp, setTimestamp] = useState(() => datetimeLocalValue(Date.now()));
  const [feed, setFeed] = useState('');
  const [stoolColor, setStoolColor] = useState<number | null>(null);
  const [stoolAmount, setStoolAmount] = useState<Amount | null>(null);
  const [stoolShape, setStoolShape] = useState<BristolType | null>(null);
  const [urine, setUrine] = useState(false);
  const [urineAmount, setUrineAmount] = useState<Amount | null>(null);
  const [sleep, setSleep] = useState<SleepEvent | null>(null);
  const [temp, setTemp] = useState('');
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [headCirc, setHeadCirc] = useState('');
  const [note, setNote] = useState('');

  // 下方時間軸跟著表單「時間」欄位走：選到前幾天就看那天的逐筆記錄
  const selectedMs = msFromDatetimeLocal(timestamp);
  const viewDay = Number.isFinite(selectedMs) ? selectedMs : Date.now();
  const isViewingToday = sameLocalDay(viewDay, Date.now());

  const dayRecords = useLiveQuery(
    async () => {
      if (!currentBaby) return [] as RecordData[];
      const recs = await db.records.where('babyId').equals(currentBaby.id).toArray();
      return recs
        .filter((r) => sameLocalDay(r.timestamp, viewDay))
        .sort((a, b) => b.timestamp - a.timestamp);
    },
    [currentBaby?.id, dateInputValue(viewDay)], // 只在「日」變動時重查，改時／分不必重查
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
    setUrineAmount(editing.urineAmount ?? null);
    setSleep(editing.sleep ?? null);
    setTemp(editing.temperature != null ? String(editing.temperature) : '');
    setWeight(editing.weight != null ? String(editing.weight) : '');
    setHeight(editing.height != null ? String(editing.height) : '');
    setHeadCirc(editing.headCircumference != null ? String(editing.headCircumference) : '');
    setNote(editing.note ?? '');
  }, [editing]);

  /** keepTimestamp：補登前幾天的資料時保留剛才選的日期，方便連續補同一天。 */
  function reset(keepTimestamp = false) {
    setEditing(null);
    if (!keepTimestamp) setTimestamp(datetimeLocalValue(Date.now()));
    setFeed('');
    setStoolColor(null);
    setStoolAmount(null);
    setStoolShape(null);
    setUrine(false);
    setUrineAmount(null);
    setSleep(null);
    setTemp('');
    setWeight('');
    setHeight('');
    setHeadCirc('');
    setNote('');
  }

  const prevBabyId = useRef(currentBaby?.id);
  useEffect(() => {
    const prev = prevBabyId.current;
    prevBabyId.current = currentBaby?.id;
    // 切換寶寶時放棄草稿，避免把編輯中的記錄存到另一個寶寶名下。
    // 「無寶寶 → 有寶寶」不算切換：第一筆記錄存檔時會自動建檔，
    // 那時清掉草稿會把使用者剛選好的日期一起洗掉。
    if (prev !== undefined && prev !== currentBaby?.id) reset();
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
      ...(urine && urineAmount !== null ? { urineAmount } : {}),
      ...(sleep !== null ? { sleep } : {}),
      ...(parseNum(feed) !== undefined ? { feedAmount: parseNum(feed) } : {}),
      ...(stoolColor !== null ? { stoolColor } : {}),
      ...(stoolColor !== null && stoolAmount !== null ? { stoolAmount } : {}),
      ...(stoolColor !== null && stoolShape !== null ? { stoolShape } : {}),
      ...(parseNum(temp) !== undefined ? { temperature: parseNum(temp) } : {}),
      ...(parseNum(weight) !== undefined ? { weight: parseNum(weight) } : {}),
      ...(parseNum(height) !== undefined ? { height: parseNum(height) } : {}),
      ...(parseNum(headCirc) !== undefined ? { headCircumference: parseNum(headCirc) } : {}),
      ...(note.trim() !== '' ? { note: note.trim() } : {}),
    };
    await db.records.put(rec);
    // 記在今天就把時間更新成現在；補登其他日期則留在那天，繼續補下一筆
    reset(!sameLocalDay(rec.timestamp, Date.now()));
  }

  async function confirmDelete() {
    const r = pendingDelete;
    setPendingDelete(null);
    if (!r) return;
    await db.records.delete(r.id);
    if (editing?.id === r.id) reset();
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
          <label className="field-label" htmlFor="rec-time">時間</label>
          <input id="rec-time" name="timestamp" type="datetime-local" value={timestamp} onChange={(e) => setTimestamp(e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="rec-feed">喝奶量（ml）</label>
          <input id="rec-feed" name="feedAmount" autoComplete="off" type="number" inputMode="decimal" placeholder="例：120" value={feed} onChange={(e) => setFeed(e.target.value)} />
        </div>
        <div className="field">
          <span className="field-label">大便顏色（大便卡 1–9 號，1–6 異常）</span>
          <StoolColorPicker value={stoolColor} onChange={(v) => {
            setStoolColor(v);
            if (v === null) { setStoolAmount(null); setStoolShape(null); }
          }} />
        </div>
        {stoolColor !== null && (
          <>
            <div className="field">
              <span className="field-label">大便量</span>
              <div className="seg">
                {AMOUNTS.map((a) => (
                  <button key={a} type="button" className={stoolAmount === a ? 'selected' : ''}
                    aria-pressed={stoolAmount === a}
                    onClick={() => setStoolAmount(stoolAmount === a ? null : a)}>
                    {AMOUNT_NAMES[a]}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label className="field-label" htmlFor="rec-shape">大便形狀（布里斯托分類）</label>
              <select id="rec-shape" name="stoolShape" value={stoolShape ?? ''} onChange={(e) => setStoolShape(e.target.value === '' ? null : (Number(e.target.value) as BristolType))}>
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
          <span className="field-label">小便</span>
          <div className="seg">
            <button type="button" className={urine ? 'selected' : ''} aria-pressed={urine} onClick={() => {
              setUrine(!urine);
              if (urine) setUrineAmount(null); // 取消小便時一併清掉量
            }}>
              {urine ? '有小便 ✓' : '有小便？'}
            </button>
          </div>
        </div>
        {urine && (
          <div className="field">
            <span className="field-label">小便量</span>
            <div className="seg">
              {AMOUNTS.map((a) => (
                <button key={a} type="button" className={urineAmount === a ? 'selected' : ''}
                  aria-pressed={urineAmount === a}
                  onClick={() => setUrineAmount(urineAmount === a ? null : a)}>
                  {AMOUNT_NAMES[a]}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="field">
          <span className="field-label">睡眠</span>
          <div className="seg">
            {SLEEP_EVENTS.map((s) => (
              <button key={s} type="button" className={sleep === s ? 'selected' : ''}
                aria-pressed={sleep === s}
                onClick={() => setSleep(sleep === s ? null : s)}>
                {SLEEP_EVENT_NAMES[s]}
              </button>
            ))}
          </div>
          <p className="hint">放下去睡時記一筆入睡，醒來時記一筆起床，統計頁會自動算出當天睡了多久。</p>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="rec-temp">體溫（°C）</label>
          <input id="rec-temp" name="temperature" autoComplete="off" type="number" inputMode="decimal" placeholder="例：36.5" value={temp} onChange={(e) => setTemp(e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="rec-weight">體重（g）</label>
          <input id="rec-weight" name="weight" autoComplete="off" type="number" inputMode="decimal" placeholder="例：4000" value={weight} onChange={(e) => setWeight(e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="rec-height">身高（cm）</label>
          <input id="rec-height" name="height" autoComplete="off" type="number" inputMode="decimal" placeholder="例：60.5" value={height} onChange={(e) => setHeight(e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="rec-head">頭圍（cm）</label>
          <input id="rec-head" name="headCircumference" autoComplete="off" type="number" inputMode="decimal" placeholder="例：40.2" value={headCirc} onChange={(e) => setHeadCirc(e.target.value)} />
          <p className="hint">身高、頭圍記下來之後，「趨勢 → 生長曲線」就能看出寶寶落在第幾百分位。</p>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="rec-note">備註</label>
          <textarea id="rec-note" name="note" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <button className="btn btn-primary" type="button" onClick={() => void save()}>
          {editing ? '儲存變更' : '儲存記錄'}
        </button>
        {editing && (
          <button className="btn" type="button" style={{ width: '100%', marginTop: 8 }} onClick={() => reset()}>
            取消編輯
          </button>
        )}
      </section>

      <section className="card">
        <h2>{isViewingToday ? '今日記錄' : `${monthDay(viewDay)} 記錄`}</h2>
        {dayRecords.length === 0 && (
          <p className="hint">{isViewingToday ? '今天還沒有記錄。' : `${monthDay(viewDay)} 沒有記錄。`}</p>
        )}
        <ul className="timeline">
          {dayRecords.map((r) => (
            <li key={r.id} className="timeline-item">
              <span className="time">{timeHM(r.timestamp)}</span>
              <button type="button" className="body" aria-label="編輯這筆記錄" onClick={() => setEditing(r)}>
                <span className="chips">
                  {r.feedAmount != null && <span className="chip">🍼 {r.feedAmount} ml</span>}
                  {r.stoolColor != null && (
                    <span className={'chip' + (isAbnormalStoolColor(r.stoolColor) ? ' abnormal' : '')}>
                      💩 {r.stoolColor} 號
                      {r.stoolAmount ? `・${AMOUNT_NAMES[r.stoolAmount]}` : ''}
                      {r.stoolShape ? `・第${r.stoolShape}型` : ''}
                    </span>
                  )}
                  {r.hasUrine && (
                    <span className="chip">💧 小便{r.urineAmount ? `・${AMOUNT_NAMES[r.urineAmount]}` : ''}</span>
                  )}
                  {r.sleep && <span className="chip">{SLEEP_EVENT_NAMES[r.sleep]}</span>}
                  {r.temperature != null && <span className="chip">🌡 {r.temperature} °C</span>}
                  {r.weight != null && <span className="chip">⚖️ {r.weight} g</span>}
                  {r.height != null && <span className="chip">📏 {r.height} cm</span>}
                  {r.headCircumference != null && <span className="chip">🧢 {r.headCircumference} cm</span>}
                  {r.note && <span className="chip">📝 {r.note}</span>}
                </span>
              </button>
              <button className="btn btn-danger" type="button" onClick={() => setPendingDelete(r)}>刪除</button>
            </li>
          ))}
        </ul>
      </section>

      {pendingDelete && (
        <ConfirmDialog
          message="刪除這筆記錄？"
          confirmLabel="刪除"
          onConfirm={() => void confirmDelete()}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </main>
  );
}
