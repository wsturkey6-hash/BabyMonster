import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../src/db/db';
import { runSync, useSyncStatus } from '../src/sync/autoSync';

// useSyncStatus 是 React hook；測試裡沒有 renderer，直接讓 useSyncExternalStore 回傳當下的快照
vi.mock('react', async (orig) => ({
  ...(await orig<typeof import('react')>()),
  useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot(),
}));

beforeEach(async () => {
  await db.records.clear();
  await db.outbox.clear();
  await db.syncState.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe('runSync 的狀態', () => {
  it('同步結束時 outbox 仍非空（伺服器拒收而留著）→ 不是 idle，也不更新 lastSync', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await db.records.add({ id: 'r1', babyId: 'b', timestamp: 1, hasUrine: false });
    const fetchFn = vi.fn(async (_u: unknown, init: RequestInit) => {
      const { changes } = JSON.parse(init.body as string);
      const results = changes.map((c: any) => ({ kind: c.kind, id: c.id, applied: false, reason: 'invalid' }));
      return new Response(JSON.stringify({ cursor: 0, changes: [], results }), { headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchFn);
    await runSync();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(await db.outbox.count()).toBe(1);
    const status = useSyncStatus();
    expect(status.phase).toBe('requestError');
    expect(status.lastSync).toBeNull();
  });
});
