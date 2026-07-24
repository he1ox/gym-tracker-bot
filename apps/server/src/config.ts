import { homedir } from 'node:os';
import { posix, win32 } from 'node:path';

export interface Config {
  telegramBotToken: string;
  allowedTelegramIds: number[];
  timezone: string;
  dbPath: string;
}

export class ConfigError extends Error {}

function defaultDbPath(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string {
  // Usamos explícitamente `path.win32`/`path.posix` (en vez del `join` genérico,
  // que se resuelve según el SO real del proceso) para que el resultado dependa
  // del parámetro `platform` recibido y no del SO donde corren los tests.
  const path = platform === 'win32' ? win32 : posix;
  if (platform === 'win32') {
    const base = env.APPDATA ?? path.join(homedir(), 'AppData', 'Roaming');
    return path.join(base, 'gym-tracker', 'gym-tracker.db');
  }
  if (platform === 'darwin') {
    return path.join(homedir(), 'Library', 'Application Support', 'gym-tracker', 'gym-tracker.db');
  }
  const base = env.XDG_DATA_HOME ?? path.join(homedir(), '.local', 'share');
  return path.join(base, 'gym-tracker', 'gym-tracker.db');
}

function isValidTimezone(tz: string): boolean {
  try {
    // Lanza RangeError si la zona no es IANA válida.
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): Config {
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    throw new ConfigError('TELEGRAM_BOT_TOKEN is required');
  }

  const rawIds = env.ALLOWED_TELEGRAM_IDS?.trim();
  if (!rawIds) {
    throw new ConfigError('ALLOWED_TELEGRAM_IDS is required (comma-separated Telegram user ids)');
  }
  const allowedTelegramIds = rawIds.split(',').map((part) => {
    const n = Number(part.trim());
    if (!Number.isInteger(n) || n <= 0) {
      throw new ConfigError(`ALLOWED_TELEGRAM_IDS contains an invalid id: "${part}"`);
    }
    return n;
  });

  const timezone = env.TIMEZONE?.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (!isValidTimezone(timezone)) {
    throw new ConfigError(`TIMEZONE is not a valid IANA timezone: "${timezone}"`);
  }

  const dbPath = env.DB_PATH?.trim() || defaultDbPath(env, platform);

  return { telegramBotToken: token, allowedTelegramIds, timezone, dbPath };
}
