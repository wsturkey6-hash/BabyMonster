import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { MAX_NOTE } from 'shared/validateEntity';
import { db } from '../db/db';
import { deleteFoodRecord, saveFoodRecord, setFoodMarks } from '../db/repository';
import { babyAge } from '../logic/babyAge';
import { FOOD_GROUPS, FOOD_NUMBERS, currentMonthGroup } from '../logic/foods';
import {
  FOOD_STATUS_NAMES, FOOD_UNITS, MAX_FOOD_NAME, REACTIONS,
  computeFirstFoods, customFoods, foodStatus, marksByFood, normalizeFoodName, reactionCandidates,
  recentFoods, sortFoodRecords,
  type FoodMark, type FoodRecord, type FoodStatus, type FoodUnit, type MarksByFood, type Reaction,
} from '../logic/foodLog';
import { BabySwitcher } from './BabySwitcher';
import { ConfirmDialog } from './components/ConfirmDialog';
import { AlertIcon, CheckIcon } from './components/icons';
import { Toast } from './components/Toast';
import { datetimeLocalValue, dayGroupLabel, msFromDatetimeLocal, timeHM } from './format';
import type { PageProps } from './App';

type View = 'records' | 'table';

const STATUSES: FoodStatus[] = ['untried', 'tried', 'reaction'];
const MAX_SEARCH_RESULTS = 8;
const MAX_AMOUNT = 10_000; // 與 shared/validateEntity 的上限相同
const SAVE_ERROR = '沒有存到，請再試一次。如果一直失敗，可能是手機的儲存空間滿了。';

/** 食材狀態的小圖示：不只靠顏色區分（色弱也分得出來）。 */
function StatusIcon({ status }: { status: FoodStatus }) {
  if (status === 'untried') return null;
  return <span className="status-icon">{status === 'tried' ? <CheckIcon /> : <AlertIcon />}</span>;
}

export default function FoodPage({ profiles, currentBaby, onSelectBaby }: PageProps) {
  const [view, setView] = useState<View>('records');
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const babyId = currentBaby?.id ?? null;

  const records = useLiveQuery(
    () => (babyId ? db.foodRecords.where('babyId').equals(babyId).toArray() : Promise.resolve([] as FoodRecord[])),
    [babyId],
    [] as FoodRecord[],
  );
  const marks = useLiveQuery(
    () => (babyId ? db.foodMarks.where('babyId').equals(babyId).toArray() : Promise.resolve([] as FoodMark[])),
    [babyId],
    [] as FoodMark[],
  );

  const age = currentBaby ? babyAge(currentBaby.birthDate, Date.now()) : null;
  const ageMonths = age ? age.years * 12 + age.months : null;

  function showToast(msg: string) {
    clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  return (
    <main className="page">
      <header className="page-header">
        <h1>副食品</h1>
        {age && ageMonths !== null && <span className="age">{ageMonths} 個月 {age.days} 天</span>}
        <BabySwitcher profiles={profiles} currentBaby={currentBaby} onSelect={onSelectBaby} />
      </header>

      <div className="card">
        <div className="seg" role="group" aria-label="副食品檢視">
          <button type="button" className={view === 'records' ? 'selected' : ''} aria-pressed={view === 'records'}
            onClick={() => setView('records')}>紀錄</button>
          <button type="button" className={view === 'table' ? 'selected' : ''} aria-pressed={view === 'table'}
            onClick={() => setView('table')}>試敏表</button>
        </div>
      </div>

      {!babyId ? (
        <div className="card">
          <p className="hint">尚未建立寶寶，請先到設定頁新增，才能記錄副食品。</p>
        </div>
      ) : view === 'records' ? (
        <RecordsView key={babyId} babyId={babyId} records={records} marks={marks}
          ageMonths={ageMonths} showToast={showToast} />
      ) : (
        <TableView key={babyId} babyId={babyId} records={records} marks={marks}
          ageMonths={ageMonths} showToast={showToast} />
      )}

      <Toast message={toast} />
    </main>
  );
}

interface ViewProps {
  babyId: string;
  records: FoodRecord[];
  marks: FoodMark[];
  ageMonths: number | null;
  showToast: (msg: string) => void;
}

// ---- 紀錄 ----

function RecordsView({ babyId, records, marks, ageMonths, showToast }: ViewProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<FoodRecord | null>(null);
  const formRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const marksMap = useMemo(() => marksByFood(marks), [marks]);

  const now = Date.now();
  const groups: { label: string; items: FoodRecord[] }[] = [];
  for (const r of sortFoodRecords(records)) {
    const label = dayGroupLabel(r.timestamp, now);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(r);
    else groups.push({ label, items: [r] });
  }

  /** 同記錄頁：表單在清單上方，進編輯時捲到眼前並把焦點移到標題，才不會以為自己在新增。 */
  function openForm(r: FoodRecord | null) {
    setEditing(r);
    setFormOpen(true);
    requestAnimationFrame(() => {
      const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      formRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
      headingRef.current?.focus({ preventScroll: true });
    });
  }

  function closeForm(message?: string) {
    setFormOpen(false);
    setEditing(null);
    if (message) showToast(message);
  }

  return (
    <>
      {formOpen ? (
        <section className="card" ref={formRef}>
          <h2 ref={headingRef} tabIndex={-1}>{editing ? '修改紀錄' : '新增紀錄'}</h2>
          <FoodForm
            key={editing?.id ?? 'new'}
            babyId={babyId} records={records} marks={marksMap} markList={marks} ageMonths={ageMonths}
            editing={editing} onDone={closeForm}
          />
        </section>
      ) : (
        <button className="btn btn-primary food-add" type="button" onClick={() => openForm(null)}>
          ＋ 新增副食品紀錄
        </button>
      )}

      <section className="card">
        <h2>紀錄</h2>
        {groups.length === 0 && <p className="hint">還沒有副食品紀錄。按上面的按鈕記下寶寶第一口吧！</p>}
        {groups.map((g) => (
          <div key={g.label} className="food-day">
            <h3 className="food-day-label">{g.label}</h3>
            <ul className="timeline">
              {g.items.map((r) => (
                <li key={r.id} className="timeline-item">
                  <span className="time">{timeHM(r.timestamp)}</span>
                  <button type="button" className="body" aria-label={`修改 ${timeHM(r.timestamp)} 的紀錄`}
                    onClick={() => openForm(r)}>
                    <span className="chips">
                      {r.foods.map((f) => (
                        <span key={f} className="chip">
                          {f}{r.firstFoods.includes(f) && <span className="first-badge">第一次</span>}
                        </span>
                      ))}
                      {r.amount && <span className="chip">{r.amount.value} {r.amount.unit}</span>}
                      {r.reactions.length > 0 && (
                        <span className="chip abnormal">
                          <span className="status-icon"><AlertIcon /></span>{r.reactions.join('、')}
                        </span>
                      )}
                      {r.note && <span className="chip">📝 {r.note}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </>
  );
}

function FoodForm({
  babyId, records, marks, markList, ageMonths, editing, onDone,
}: {
  babyId: string;
  records: FoodRecord[];
  marks: MarksByFood;
  markList: FoodMark[];
  ageMonths: number | null;
  editing: FoodRecord | null;
  onDone: (message?: string) => void;
}) {
  const [timestamp, setTimestamp] = useState(() => datetimeLocalValue(editing?.timestamp ?? Date.now()));
  const [picked, setPicked] = useState<string[]>(() => editing?.foods ?? []);
  const [query, setQuery] = useState('');
  const [amount, setAmount] = useState(() => (editing?.amount ? String(editing.amount.value) : ''));
  const [unit, setUnit] = useState<FoodUnit>(() => editing?.amount?.unit ?? '匙');
  const [reactions, setReactions] = useState<Reaction[]>(() => editing?.reactions ?? []);
  const [note, setNote] = useState(() => editing?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  // 連點儲存只存一筆：第一下還沒寫完之前，按鈕停用
  const [saving, setSaving] = useState(false);
  const [askReaction, setAskReaction] = useState<{ record: FoodRecord; choices: { food: string; checked: boolean }[] } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const recent = useMemo(() => recentFoods(records), [records]);
  const custom = useMemo(() => customFoods(records, markList), [records, markList]);
  const month = (ageMonths !== null ? currentMonthGroup(ageMonths) : null) ?? 4;
  const monthItems = FOOD_GROUPS.find((g) => g.month === month)?.items ?? [];

  const q = normalizeFoodName(query);
  const results = useMemo(() => {
    if (q === '') return [];
    const names = [...FOOD_GROUPS.flatMap((g) => g.items.map(([, n]) => n)), ...custom];
    return names.filter((n) => n.includes(q) && !picked.includes(n)).slice(0, MAX_SEARCH_RESULTS);
  }, [q, custom, picked]);
  const exists = q !== '' && (FOOD_NUMBERS.has(q) || custom.includes(q) || picked.includes(q));

  function toggle(food: string) {
    setError(null);
    setPicked((p) => (p.includes(food) ? p.filter((f) => f !== food) : [...p, food]));
  }

  function addFromSearch(food: string) {
    setError(null);
    setPicked((p) => (p.includes(food) ? p : [...p, food]));
    setQuery('');
  }

  function onSearchEnter() {
    if (q === '') return;
    const exact = results.find((n) => n === q);
    if (exact) addFromSearch(exact);
    else if (!exists) addFromSearch(q);
    else if (results.length === 1) addFromSearch(results[0]);
  }

  async function save() {
    if (saving) return;
    if (picked.length === 0) return setError('請至少選一個食材。');
    const ts = msFromDatetimeLocal(timestamp);
    if (!Number.isFinite(ts)) return setError('請填日期和時間。');
    if (ts > Date.now() + 60_000) return setError('時間不能晚於現在。');
    let amountValue: number | undefined;
    if (amount.trim() !== '') {
      amountValue = Number(amount);
      if (!Number.isFinite(amountValue) || amountValue <= 0 || amountValue > MAX_AMOUNT)
        return setError(`份量請填 0 到 ${MAX_AMOUNT} 之間的數字，或留白。`);
    }
    const record: FoodRecord = {
      id: editing?.id ?? crypto.randomUUID(),
      babyId: editing?.babyId ?? babyId,
      timestamp: ts,
      foods: picked,
      firstFoods: computeFirstFoods(picked, records, marks, editing ?? undefined),
      reactions: REACTIONS.filter((r) => reactions.includes(r)), // 固定順序
      ...(amountValue !== undefined ? { amount: { value: amountValue, unit } } : {}),
      ...(note.trim() !== '' ? { note: note.trim() } : {}),
    };

    setSaving(true);
    setError(null);
    try {
      await saveFoodRecord(record);
    } catch {
      setSaving(false);
      return setError(SAVE_ERROR);
    }
    const after = [...records.filter((r) => r.id !== record.id), record];
    const choices = reactionCandidates(record, after, marks);
    if (choices.length > 0) setAskReaction({ record, choices });
    else onDone(editing ? '已儲存變更' : '已新增紀錄');
  }

  async function markReactions(foods: string[]) {
    try {
      if (foods.length > 0) await setFoodMarks(babyId, foods, 'reaction');
      onDone(foods.length > 0 ? `已儲存，${foods.join('、')} 標成有反應` : '已儲存');
    } catch {
      setAskReaction(null);
      setSaving(false);
      setError('紀錄已儲存，但標記「有反應」沒有存到，請到試敏表手動標記。');
    }
  }

  async function remove() {
    setConfirmDelete(false);
    if (!editing) return;
    try {
      await deleteFoodRecord(editing.id);
      onDone('已刪除紀錄');
    } catch {
      setError('沒有刪掉，請再試一次。');
    }
  }

  const chip = (food: string) => {
    const status = foodStatus(food, records, marks);
    const no = FOOD_NUMBERS.get(food);
    const on = picked.includes(food);
    return (
      <button key={food} type="button" className={'food-pick ' + status + (on ? ' selected' : '')}
        aria-pressed={on} onClick={() => toggle(food)}>
        {no !== undefined && <span className="food-no">{no}</span>}
        {food}
        <StatusIcon status={status} />
        <span className="sr-only">，{FOOD_STATUS_NAMES[status]}</span>
      </button>
    );
  };

  return (
    <>
      <div className="field">
        <label className="field-label" htmlFor="food-time">時間</label>
        <input id="food-time" name="timestamp" type="datetime-local" value={timestamp}
          max={datetimeLocalValue(Date.now())} onChange={(e) => setTimestamp(e.target.value)} />
      </div>

      <div className="field">
        <span className="field-label" id="food-picked-label">吃了什麼（可複選）</span>
        {picked.length === 0 ? (
          <p className="hint" style={{ marginTop: 0 }}>從下面點選，或打字搜尋。</p>
        ) : (
          <ul className="food-picked" aria-labelledby="food-picked-label">
            {picked.map((f) => (
              <li key={f}>
                <span>{f}</span>
                <button type="button" aria-label={`移除 ${f}`} onClick={() => toggle(f)}>×</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {recent.length > 0 && (
        <div className="field">
          <span className="field-label">最近吃過</span>
          <div className="food-picks">{recent.map(chip)}</div>
        </div>
      )}
      <div className="field">
        <span className="field-label">{month} 個月的食材</span>
        <div className="food-picks">{monthItems.map(([, name]) => chip(name))}</div>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="food-search">搜尋其他食材</label>
        <input id="food-search" name="foodSearch" type="text" autoComplete="off" enterKeyHint="done"
          maxLength={MAX_FOOD_NAME + 10} placeholder="例：鮭魚" value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); onSearchEnter(); }
          }} />
        {q !== '' && (
          <div className="food-picks" style={{ marginTop: 8 }}>
            {results.map((n) => (
              <button key={n} type="button" className="food-pick" onClick={() => addFromSearch(n)}>
                {FOOD_NUMBERS.has(n) && <span className="food-no">{FOOD_NUMBERS.get(n)}</span>}{n}
              </button>
            ))}
            {!exists && (
              <button type="button" className="food-pick add" onClick={() => addFromSearch(q)}>
                ＋ 新增「{q}」
              </button>
            )}
          </div>
        )}
      </div>

      <div className="field">
        <label className="field-label" htmlFor="food-amount">份量（選填）</label>
        <div className="food-amount">
          <input id="food-amount" name="amount" type="number" inputMode="decimal" autoComplete="off"
            className="seg-input" placeholder="例：2" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <div className="seg" role="group" aria-label="單位">
            {FOOD_UNITS.map((u) => (
              <button key={u} type="button" className={unit === u ? 'selected' : ''} aria-pressed={unit === u}
                onClick={() => setUnit(u)}>{u}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="field">
        <span className="field-label">反應（選填）</span>
        <div className="seg" role="group" aria-label="反應">
          {REACTIONS.map((r) => {
            const on = reactions.includes(r);
            return (
              <button key={r} type="button" className={on ? 'selected' : ''} aria-pressed={on}
                onClick={() => setReactions((x) => (on ? x.filter((y) => y !== r) : [...x, r]))}>{r}</button>
            );
          })}
        </div>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="food-note">備註（選填）</label>
        <textarea id="food-note" name="note" maxLength={MAX_NOTE} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>

      {error && <p className="warn" role="alert">{error}</p>}

      <button className="btn btn-primary" type="button" style={{ marginTop: 12 }} disabled={saving}
        onClick={() => void save()}>
        {editing ? '儲存變更' : '儲存紀錄'}
      </button>
      <div className="food-form-actions">
        <button className="btn" type="button" onClick={() => onDone()}>取消</button>
        {editing && (
          <button className="btn btn-danger" type="button" onClick={() => setConfirmDelete(true)}>刪除</button>
        )}
      </div>

      {askReaction && (
        <ReactionDialog choices={askReaction.choices} onSubmit={(foods) => void markReactions(foods)} />
      )}
      {confirmDelete && (
        <ConfirmDialog message="刪除這筆副食品紀錄？" confirmLabel="刪除"
          onConfirm={() => void remove()} onCancel={() => setConfirmDelete(false)} />
      )}
    </>
  );
}

/** 有勾反應時，存檔後問要把哪些食材標成「有反應」。 */
function ReactionDialog({
  choices, onSubmit,
}: {
  choices: { food: string; checked: boolean }[];
  onSubmit: (foods: string[]) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [checked, setChecked] = useState(() => choices.filter((c) => c.checked).map((c) => c.food));
  useEffect(() => {
    ref.current?.showModal();
  }, []);

  return (
    <dialog ref={ref} className="confirm-dialog" aria-labelledby="reaction-title"
      onCancel={(e) => { e.preventDefault(); onSubmit([]); }}>
      <p className="title" id="reaction-title">要標成「有反應」嗎？</p>
      <p className="message">紀錄已儲存。勾選可能引起反應的食材，試敏表上會標成紅色。</p>
      <div className="reaction-choices">
        {choices.map((c) => {
          const on = checked.includes(c.food);
          return (
            <label key={c.food} className="reaction-choice">
              <input type="checkbox" checked={on}
                onChange={() => setChecked((x) => (on ? x.filter((f) => f !== c.food) : [...x, c.food]))} />
              {c.food}
            </label>
          );
        })}
      </div>
      <div className="actions">
        <button className="btn" type="button" onClick={() => onSubmit([])}>不用</button>
        <button className="btn btn-danger" type="button" disabled={checked.length === 0}
          onClick={() => onSubmit(checked)}>標記</button>
      </div>
    </dialog>
  );
}

// ---- 試敏表 ----

function TableView({ babyId, records, marks, ageMonths, showToast }: ViewProps) {
  const [sheetFood, setSheetFood] = useState<string | null>(null);
  const marksMap = useMemo(() => marksByFood(marks), [marks]);
  const custom = useMemo(() => customFoods(records, marks), [records, marks]);
  const current = ageMonths !== null ? currentMonthGroup(ageMonths) : null;

  const jump = (id: string, smooth: boolean) => {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    document.getElementById(id)?.scrollIntoView({ behavior: smooth && !reduceMotion ? 'smooth' : 'auto', block: 'start' });
  };

  // 切到試敏表時自動捲到目前月齡那一區
  useEffect(() => {
    if (current !== null) requestAnimationFrame(() => jump(`food-month-${current}`, false));
    // 只在進入這個檢視時捲一次，之後月齡跨月也不要突然把畫面拉走
  }, []);

  async function choose(food: string, status: FoodStatus) {
    setSheetFood(null);
    try {
      await setFoodMarks(babyId, [food], status);
    } catch {
      // 沒寫進去的話畫面本來就還是原狀態（狀態直接讀資料庫），只需要告訴使用者
      showToast('沒有存到，請再試一次');
    }
  }

  const cell = (food: string, no?: number) => {
    const status = foodStatus(food, records, marksMap);
    return (
      <li key={food}>
        <button type="button" className={'food-cell ' + status} onClick={() => setSheetFood(food)}>
          {no !== undefined && <span className="food-no">{no}</span>}
          <span className="food-name">{food}</span>
          <StatusIcon status={status} />
          <span className="sr-only">，{FOOD_STATUS_NAMES[status]}</span>
        </button>
      </li>
    );
  };

  return (
    <>
      <nav className="food-month-nav" aria-label="跳到月份">
        {FOOD_GROUPS.map((g) => (
          <button key={g.month} type="button" className={g.month === current ? 'current' : ''}
            onClick={() => jump(`food-month-${g.month}`, true)}>{g.month} 個月</button>
        ))}
        <button type="button" onClick={() => jump('food-month-other', true)}>其他</button>
      </nav>

      <ul className="food-legend" aria-label="圖例">
        {STATUSES.map((s) => (
          <li key={s} className={'food-cell ' + s}><StatusIcon status={s} />{FOOD_STATUS_NAMES[s]}</li>
        ))}
      </ul>

      {FOOD_GROUPS.map((g) => (
        <section key={g.month} id={`food-month-${g.month}`} className={'card food-section' + (g.month === current ? ' current' : '')}>
          <h2>
            {g.month} 個月
            {g.month === current && <span className="current-badge">目前月齡</span>}
          </h2>
          <ul className="food-grid">{g.items.map(([no, name]) => cell(name, no))}</ul>
        </section>
      ))}
      <section id="food-month-other" className="card food-section">
        <h2>其他</h2>
        {custom.length === 0
          ? <p className="hint">新增紀錄時輸入表上沒有的食材，會出現在這裡。</p>
          : <ul className="food-grid">{custom.map((f) => cell(f))}</ul>}
      </section>

      {sheetFood && (
        <StatusSheet food={sheetFood} status={foodStatus(sheetFood, records, marksMap)}
          onChoose={(s) => void choose(sheetFood, s)} onClose={() => setSheetFood(null)} />
      )}
    </>
  );
}

/** 從下方跳出的狀態選單。 */
function StatusSheet({
  food, status, onChoose, onClose,
}: {
  food: string;
  status: FoodStatus;
  onChoose: (s: FoodStatus) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);

  return (
    <dialog ref={ref} className="sheet-dialog" aria-labelledby="sheet-title"
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      <div className="panel">
        <p className="title" id="sheet-title">{food}</p>
        <div className="sheet-options">
          {STATUSES.map((s) => (
            <button key={s} type="button" className={'food-cell ' + s + (s === status ? ' selected' : '')}
              aria-pressed={s === status} onClick={() => onChoose(s)}>
              <StatusIcon status={s} />{FOOD_STATUS_NAMES[s]}
            </button>
          ))}
        </div>
        <button className="btn" type="button" onClick={onClose}>取消</button>
      </div>
    </dialog>
  );
}
