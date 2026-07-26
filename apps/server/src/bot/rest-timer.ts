import { snapshot, withCurrent } from '../i18n/current';
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
      // El aviso se construye MÁS TARDE, fuera del ciclo de vida de este update:
      // si leyera el estado global en ese momento cogería el idioma de cualquier
      // otro update que hubiera entrado en medio. Se congela aquí.
      const prefs = snapshot();
      const handle = setTimeout(() => {
        void (async () => {
          entries.delete(userId);
          try {
            // deps.rerender queda FUERA de withCurrent a propósito: el mensaje de
            // sesión debe pintarse con el idioma actual del usuario, no con el de
            // hace tres minutos.
            const messageId = await deps.send(
              chatId,
              withCurrent(prefs, () => T.restDoneMessage(exerciseName)),
            );
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
