import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRestTimers } from './rest-timer';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('createRestTimers', () => {
  it('fires after the configured delay, sends, stores ephemeral and rerenders', async () => {
    const sent: Array<{ chatId: number; text: string }> = [];
    const stored: Array<{ userId: number; messageId: number }> = [];
    const rerendered: number[] = [];
    const timers = createRestTimers({
      send: async (chatId, text) => {
        sent.push({ chatId, text });
        return 777;
      },
      storeEphemeral: (userId, messageId) => void stored.push({ userId, messageId }),
      rerender: async (userId) => void rerendered.push(userId),
    });

    timers.schedule({ userId: 1, chatId: 555, seconds: 90, exerciseName: 'Press banca' });
    expect(timers.activeSeconds(1)).toBe(90);

    await vi.advanceTimersByTimeAsync(90_000);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.chatId).toBe(555);
    expect(stored).toEqual([{ userId: 1, messageId: 777 }]);
    expect(rerendered).toEqual([1]);
    expect(timers.activeSeconds(1)).toBeUndefined();
  });

  it('cancel stops a pending timer', async () => {
    const sent: number[] = [];
    const timers = createRestTimers({
      send: async () => {
        sent.push(1);
        return 1;
      },
      storeEphemeral: () => {},
      rerender: async () => {},
    });
    timers.schedule({ userId: 1, chatId: 555, seconds: 60, exerciseName: 'x' });
    timers.cancel(1);
    expect(timers.activeSeconds(1)).toBeUndefined();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sent).toHaveLength(0);
  });

  it('scheduling again replaces the previous timer', async () => {
    const sent: string[] = [];
    const timers = createRestTimers({
      send: async (_chatId, text) => {
        sent.push(text);
        return 1;
      },
      storeEphemeral: () => {},
      rerender: async () => {},
    });
    timers.schedule({ userId: 1, chatId: 5, seconds: 60, exerciseName: 'A' });
    timers.schedule({ userId: 1, chatId: 5, seconds: 30, exerciseName: 'B' });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sent).toHaveLength(1); // solo el segundo timer sobrevive
  });
});
