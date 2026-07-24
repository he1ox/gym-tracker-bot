import { T } from './texts';

export interface RestTimers {
  schedule(p: { userId: number; chatId: number; seconds: number; exerciseName: string }): void;
  cancel(userId: number): void;
  activeSeconds(userId: number): number | undefined;
}

interface Entry {
  seconds: number;
  handle: ReturnType<typeof setTimeout>;
}

export function createRestTimers(deps: {
  send: (chatId: number, text: string) => Promise<number>;
  storeEphemeral: (userId: number, messageId: number) => void;
  rerender: (userId: number) => Promise<void>;
}): RestTimers {
  const entries = new Map<number, Entry>();

  function cancel(userId: number): void {
    const entry = entries.get(userId);
    if (entry) {
      clearTimeout(entry.handle);
      entries.delete(userId);
    }
  }

  return {
    schedule({ userId, chatId, seconds, exerciseName }) {
      cancel(userId);
      const handle = setTimeout(() => {
        void (async () => {
          entries.delete(userId);
          try {
            const messageId = await deps.send(chatId, T.restDoneMessage(exerciseName));
            deps.storeEphemeral(userId, messageId);
            await deps.rerender(userId);
          } catch (error) {
            console.log(`[rest-timer] failed to fire for user=${userId}: ${String(error)}`);
          }
        })();
      }, seconds * 1000);
      entries.set(userId, { seconds, handle });
    },
    cancel,
    activeSeconds(userId) {
      return entries.get(userId)?.seconds;
    },
  };
}
