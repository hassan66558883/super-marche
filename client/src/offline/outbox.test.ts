import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '@/services/api';
import { db } from './db';
import { enqueueSale, flushOutbox, listOutbox, pendingForBranch, useOfflineStore } from './outbox';
import { localSaleNumber } from './provisional';

const sale = (clientRef: string, createdAt: string, branchId = 'b1') => ({
  clientRef, branchId, userId: 'u1', localNumber: `HL-${clientRef}`, total: '1000', createdAt,
  input: { clientRef, items: [{ productId: 'p1', quantity: 1 }], payments: [{ method: 'CASH', amount: 1000 }], priceList: 'RETAIL' as const },
});

describe('offline outbox', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await (await db()).clear('outbox');
    useOfflineStore.setState({ pending: 0, failed: 0, reachable: true, syncing: false });
  });

  it('queues sales and counts them per branch', async () => {
    await enqueueSale(sale('a', '2026-10-06T10:00:00Z'));
    await enqueueSale(sale('b', '2026-10-06T10:01:00Z', 'b2'));
    expect(useOfflineStore.getState().pending).toBe(2);
    expect(await pendingForBranch('b1')).toBe(1);
  });

  it('sends oldest first with the branch header and empties the queue', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ success: true, data: {} } as never);
    await enqueueSale(sale('late', '2026-10-06T11:00:00Z'));
    await enqueueSale(sale('early', '2026-10-06T09:00:00Z'));
    expect(await flushOutbox()).toBe(2);
    expect(post.mock.calls.map((c) => (c[1] as { clientRef: string }).clientRef)).toEqual(['early', 'late']);
    expect(post.mock.calls[0][2]).toEqual({ 'X-Branch-Id': 'b1' });
    expect(await listOutbox()).toHaveLength(0);
    expect(useOfflineStore.getState().pending).toBe(0);
  });

  it('keeps a refused sale for review and carries on with the next one', async () => {
    vi.spyOn(api, 'post')
      .mockRejectedValueOnce(new ApiError(400, 'OFFLINE_CREDIT', 'refused'))
      .mockResolvedValueOnce({ success: true, data: {} } as never);
    await enqueueSale(sale('bad', '2026-10-06T09:00:00Z'));
    await enqueueSale(sale('good', '2026-10-06T09:05:00Z'));
    expect(await flushOutbox()).toBe(1);
    const [left] = await listOutbox();
    expect(left).toMatchObject({ clientRef: 'bad', status: 'failed', error: { code: 'OFFLINE_CREDIT' } });
    expect(useOfflineStore.getState().failed).toBe(1);
  });

  it('stops on a network error and keeps every sale pending', async () => {
    const post = vi.spyOn(api, 'post').mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'offline'));
    await enqueueSale(sale('a', '2026-10-06T09:00:00Z'));
    await enqueueSale(sale('b', '2026-10-06T09:05:00Z'));
    expect(await flushOutbox()).toBe(0);
    expect(post).toHaveBeenCalledTimes(1);
    expect((await listOutbox()).map((s) => s.status)).toEqual(['pending', 'pending']);
    expect(useOfflineStore.getState().reachable).toBe(false);
  });

  it('runs a single sync at a time', async () => {
    let release!: () => void;
    const post = vi.spyOn(api, 'post').mockImplementation(() => new Promise((r) => { release = () => r({ success: true, data: {} } as never); }));
    await enqueueSale(sale('a', '2026-10-06T09:00:00Z'));
    const first = flushOutbox();
    const second = flushOutbox();
    await vi.waitFor(() => expect(post).toHaveBeenCalled());
    release();
    expect(await first).toBe(1);
    expect(await second).toBe(1);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('builds a short provisional number from the branch, date and reference', () => {
    expect(localSaleNumber('NDJ', '3f2a9c10-aaaa-bbbb', new Date(2026, 9, 6))).toBe('HL-NDJ-0610-3F2A');
  });
});
