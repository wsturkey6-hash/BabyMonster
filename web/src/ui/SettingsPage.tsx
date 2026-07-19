import { useRef, useState } from 'react';
import { db } from '../db/db';
import { allData, deleteBabyCascade, importMerge } from '../db/repository';
import { decodeAny, encodeV2 } from '../logic/dataTransfer';
import { ageDisplayText, babyAge } from '../logic/babyAge';
import type { ProfileData } from '../logic/types';
import { BabySwitcher } from './BabySwitcher';
import { Toast } from './components/Toast';
import { dateInputValue, msFromDateInput, ymdCompact } from './format';
import type { PageProps } from './App';

export default function SettingsPage({ profiles, currentBaby, onSelectBaby }: PageProps) {
  const [editingId, setEditingId] = useState<string | null>(null); // 'new' = 新增
  const [name, setName] = useState('');
  const [birth, setBirth] = useState(() => dateInputValue(Date.now()));
  const [exportScope, setExportScope] = useState('all');
  const [toast, setToast] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function show(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }

  function startEdit(p: ProfileData) {
    setEditingId(p.id);
    setName(p.name);
    setBirth(dateInputValue(p.birthDate));
  }

  function startAdd() {
    setEditingId('new');
    setName('');
    setBirth(dateInputValue(Date.now()));
  }

  async function saveBaby() {
    try {
      const n = name.trim() || 'BabyMonster';
      const b = msFromDateInput(birth);
      if (!Number.isFinite(b)) {
        show('請先選擇生日');
        return;
      }
      if (editingId === 'new') {
        const p: ProfileData = { id: crypto.randomUUID(), name: n, birthDate: b };
        await db.profiles.add(p);
        onSelectBaby(p.id);
      } else if (editingId) {
        await db.profiles.update(editingId, { name: n, birthDate: b });
      }
      setEditingId(null);
    } catch (e) {
      show(`儲存失敗：${(e as Error).message}`);
    }
  }

  async function removeBaby(p: ProfileData) {
    const count = await db.records.where('babyId').equals(p.id).count();
    if (confirm(`將一併刪除「${p.name}」的 ${count} 筆記錄，確定刪除？`)) {
      await deleteBabyCascade(p.id);
      if (editingId === p.id) setEditingId(null);
    }
  }

  async function doExport() {
    try {
      const data = await allData();
      const scoped =
        exportScope === 'all'
          ? data
          : {
              profiles: data.profiles.filter((p) => p.id === exportScope),
              records: data.records.filter((r) => r.babyId === exportScope),
            };
      const babyName = exportScope === 'all' ? null : scoped.profiles[0]?.name ?? null;
      const filename = babyName
        ? `BabyMonster-${babyName}-${ymdCompact(Date.now())}.json`
        : `BabyMonster-${ymdCompact(Date.now())}.json`;
      const json = encodeV2(scoped);
      const file = new File([json], filename, { type: 'application/json' });

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'BabyMonster 備份' });
      } else {
        const url = URL.createObjectURL(file);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
      }
      show('已匯出');
    } catch (e) {
      if ((e as Error).name !== 'AbortError') show(`匯出失敗：${(e as Error).message}`);
    }
  }

  async function onImportFile(f: File | undefined) {
    if (!f) return;
    try {
      const payload = decodeAny(await f.text());
      await importMerge(payload);
      show(`匯入成功：${payload.profiles.length} 位寶寶、${payload.records.length} 筆記錄已合併`);
    } catch (e) {
      show(`匯入失敗：${(e as Error).message}`);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <main className="page">
      <header className="page-header">
        <h1>設定</h1>
        <BabySwitcher profiles={profiles} currentBaby={currentBaby} onSelect={onSelectBaby} />
      </header>

      <section className="card">
        <h2>寶寶</h2>
        {profiles.map((p) => (
          <div key={p.id} className="list-row">
            <div onClick={() => startEdit(p)}>
              <div>{p.name}</div>
              <div className="hint" style={{ margin: 0 }}>{ageDisplayText(babyAge(p.birthDate, Date.now()))}</div>
            </div>
            <button className="btn btn-danger" type="button" onClick={() => void removeBaby(p)}>刪除</button>
          </div>
        ))}
        {profiles.length === 0 && <p className="hint">尚未建立寶寶；第一筆記錄儲存時會自動建立。</p>}

        {editingId !== null ? (
          <div style={{ marginTop: 12 }}>
            <div className="field">
              <label className="field-label">名字</label>
              <input type="text" placeholder="BabyMonster" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field">
              <label className="field-label">生日</label>
              <input type="date" value={birth} onChange={(e) => setBirth(e.target.value)} />
            </div>
            <button className="btn btn-primary" type="button" onClick={() => void saveBaby()}>
              {editingId === 'new' ? '新增寶寶' : '儲存變更'}
            </button>
            <button className="btn" type="button" style={{ width: '100%', marginTop: 8 }} onClick={() => setEditingId(null)}>
              取消
            </button>
          </div>
        ) : (
          <button className="btn" type="button" style={{ width: '100%', marginTop: 12 }} onClick={startAdd}>
            ＋ 新增寶寶
          </button>
        )}
      </section>

      <section className="card">
        <h2>匯出資料</h2>
        <div className="field">
          <label className="field-label">範圍</label>
          <select value={exportScope} onChange={(e) => setExportScope(e.target.value)}>
            <option value="all">全部寶寶</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>只有 {p.name}</option>
            ))}
          </select>
        </div>
        <button className="btn btn-primary" type="button" onClick={() => void doExport()}>
          匯出 / 分享（JSON）
        </button>
        <p className="hint">iPhone 上會開分享面板，可直接傳 LINE；電腦上會下載檔案。</p>
      </section>

      <section className="card">
        <h2>匯入資料</h2>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          onChange={(e) => void onImportFile(e.target.files?.[0])}
        />
        <p className="hint">
          支援本 App（v2）與 iOS 版（v1）匯出檔。以記錄 id 聯集合併，重複記錄保留本機版本；驗證失敗不會變動現有資料。
        </p>
      </section>

      <Toast message={toast} />
    </main>
  );
}
