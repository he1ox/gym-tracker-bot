import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config';

const base = {
  TELEGRAM_BOT_TOKEN: '123:abc',
  ALLOWED_TELEGRAM_IDS: '111,222',
  TIMEZONE: 'Europe/Madrid',
  DB_PATH: '/tmp/gym.db',
};

describe('loadConfig', () => {
  it('parses a full valid environment', () => {
    expect(loadConfig(base, 'linux')).toEqual({
      telegramBotToken: '123:abc',
      allowedTelegramIds: [111, 222],
      timezone: 'Europe/Madrid',
      dbPath: '/tmp/gym.db',
    });
  });

  it('throws ConfigError when the token is missing', () => {
    const { TELEGRAM_BOT_TOKEN, ...rest } = base;
    expect(() => loadConfig(rest, 'linux')).toThrow(ConfigError);
  });

  it('throws ConfigError when allowed ids are missing or malformed', () => {
    expect(() => loadConfig({ ...base, ALLOWED_TELEGRAM_IDS: '' }, 'linux')).toThrow(ConfigError);
    expect(() => loadConfig({ ...base, ALLOWED_TELEGRAM_IDS: '111,abc' }, 'linux')).toThrow(ConfigError);
  });

  it('rejects an invalid IANA timezone', () => {
    expect(() => loadConfig({ ...base, TIMEZONE: 'Not/AZone' }, 'linux')).toThrow(ConfigError);
  });

  it('defaults the timezone to the system zone when TIMEZONE is unset', () => {
    const { TIMEZONE, ...rest } = base;
    const cfg = loadConfig(rest, 'linux');
    expect(cfg.timezone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });

  it('computes an OS-standard db path when DB_PATH is unset', () => {
    const { DB_PATH, ...rest } = base;
    const win = loadConfig({ ...rest, APPDATA: 'C:\\Users\\x\\AppData\\Roaming' }, 'win32');
    expect(win.dbPath).toContain('gym-tracker');
    const linux = loadConfig({ ...rest, XDG_DATA_HOME: '/home/x/.local/share' }, 'linux');
    expect(linux.dbPath).toBe('/home/x/.local/share/gym-tracker/gym-tracker.db');
  });
});
