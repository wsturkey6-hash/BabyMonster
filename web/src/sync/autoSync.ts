import { liveQuery } from 'dexie';
import { useSyncExternalStore } from 'react';
import { db } from '../db/db';
import { NeedsLoginError, RequestError, syncOnce } from './sync';

export interface SyncStatus {
  // offline（這支手機沒網路）和 serverDown（有網路但家裡伺服器連不到）要分開：
  // 都顯示「離線」的話，伺服器掛掉時使用者會跑去檢查自己的 wifi
  // requestError：伺服器有回應但回 4xx，是我們自己的請求有問題，不能怪伺服器或使用者的時鐘
  phase: 'idle' | 'syncing' | 'offline' | 'serverDown' | 'needsLogin' | 'requestError';
  /** 最近一次成功同步（epoch ms）；從沒成功過是 null */
  lastSync: number | null;
  /** 最近一次同步中被伺服器略過的筆數 */
  skipped: number;
}

let status: SyncStatus = { phase: 'idle', lastSync: null, skipped: 0 };
const listeners = new Set<() => void>();

function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  listeners.forEach((l) => l());
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => status,
  );
}

/**
 * fetch 連不出去時會丟 TypeError；伺服器有回應但狀態碼不對是我們自己丟的 Error。
 * navigator.onLine 為 false 就一定是本機沒網路，不必再看錯誤型別。
 */
export function failurePhase(e: unknown): SyncStatus['phase'] {
  if (e instanceof NeedsLoginError) return 'needsLogin';
  if (e instanceof RequestError) return 'requestError';
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
  return e instanceof TypeError ? 'offline' : 'serverDown';
}

let running = false;
let rerun = false;

/** 立即同步一次；同步進行中被再次呼叫時，等這輪結束後補跑一輪（期間的新寫入才不會漏）。 */
export async function runSync(): Promise<void> {
  if (running) {
    rerun = true;
    return;
  }
  running = true;
  setStatus({ phase: 'syncing' });
  try {
    const { skipped, kept } = await syncOnce();
    // 只有「被伺服器拒收而留著」才算出問題。不能改看 outbox 是否非空：
    // 使用者在同步進行中按儲存也會讓它非空，那完全正常，顯示錯誤是謊報
    if (kept > 0) setStatus({ phase: 'requestError', skipped });
    else setStatus({ phase: 'idle', skipped, lastSync: Date.now() });
  } catch (e) {
    setStatus({ phase: failurePhase(e) });
  } finally {
    running = false;
  }
  if (rerun) {
    rerun = false;
    await runSync();
  }
}

/** 啟動時、回到前景、恢復連線、本機寫入後（防抖 1 秒）、前景每 15 秒各同步一次。回傳停止函式。 */
export function startAutoSync(): () => void {
  void db.syncState.get('lastSync').then((r) => r && setStatus({ lastSync: r.v }));
  void runSync();

  const onVisible = () => document.visibilityState === 'visible' && void runSync();
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', onVisible);
  const timer = setInterval(onVisible, 15_000);

  // 本機每寫一筆 seq 計數器就會變，套用遠端資料不會動它
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let first = true;
  const sub = liveQuery(() => db.syncState.get('seq')).subscribe(() => {
    if (first) return void (first = false); // 訂閱當下的初始值不算寫入
    clearTimeout(debounce);
    debounce = setTimeout(() => void runSync(), 1000);
  });

  return () => {
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('online', onVisible);
    clearInterval(timer);
    clearTimeout(debounce);
    sub.unsubscribe();
  };
}
