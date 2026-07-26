import { MIGRATIONS_DIR, getUserByTelegramId, openDatabase, runMigrations } from '@gym-tracker/db';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setCurrent } from '../i18n/current';
import { initI18n } from '../i18n/index';
import { renderSettings } from './settings';
import {
  BOT_INFO,
  callbackUpdate,
  commandUpdate,
  lastKeyboardDatas,
  makeHarness,
  outgoingTexts,
} from './test-harness';

const config = { allowedTelegramIds: [111], timezone: 'Europe/Madrid' };

describe('renderSettings', () => {
  beforeAll(() => initI18n());

  it('marca con ✓ la opción activa de cada fila', () => {
    setCurrent({ locale: 'es', unit: 'kg', step: 2.5 });
    const { text, keyboard } = renderSettings({ locale: 'es', unit: 'kg', step: 2.5 });
    const labels = keyboard.inline_keyboard.flat().map((b) => ('text' in b ? b.text : ''));
    expect(text).toContain('⚙️ Ajustes');
    expect(labels).toContain('✓ Español');
    expect(labels).toContain('English');
    expect(labels).toContain('✓ kg');
    expect(labels).toContain('lb');
    expect(labels).toContain('✓ 2.5');
  });

  it('se pinta en el idioma activo', () => {
    setCurrent({ locale: 'en', unit: 'lb', step: 5 });
    const { keyboard, text } = renderSettings({ locale: 'en', unit: 'lb', step: 5 });
    const labels = keyboard.inline_keyboard.flat().map((b) => ('text' in b ? b.text : ''));
    expect(text).toContain('⚙️ Settings');
    expect(labels).toContain('✓ English');
    expect(labels).toContain('✓ lb');
    expect(labels).toContain('✓ 5');
  });
});

describe('/settings', () => {
  let db: DatabaseSync;
  beforeAll(() => initI18n());
  beforeEach(() => {
    db = openDatabase(':memory:');
    runMigrations(db, MIGRATIONS_DIR);
  });
  afterEach(() => db.close());

  it('responde con un mensaje NUEVO, no editando', async () => {
    const { bot, outgoing } = makeHarness(db, BOT_INFO, config);
    await bot.handleUpdate(commandUpdate(1, 'settings'));
    expect(outgoingTexts(outgoing, 'sendMessage')[0]).toContain('Ajustes');
    expect(outgoing.filter((c) => c.method === 'editMessageText')).toHaveLength(0);
  });

  it('cambiar de idioma persiste y repinta en el idioma nuevo', async () => {
    const { bot, outgoing } = makeHarness(db, BOT_INFO, config);
    await bot.handleUpdate(commandUpdate(1, 'settings'));
    await bot.handleUpdate(callbackUpdate(2, 'set:l:en', 500));
    expect(getUserByTelegramId(db, 111)?.locale).toBe('en');
    expect(outgoingTexts(outgoing, 'editMessageText').at(-1)).toContain('Settings');
  });

  it('cambiar la unidad no convierte nada y persiste', async () => {
    const { bot } = makeHarness(db, BOT_INFO, config);
    await bot.handleUpdate(commandUpdate(1, 'settings'));
    await bot.handleUpdate(callbackUpdate(2, 'set:u:lb', 500));
    expect(getUserByTelegramId(db, 111)?.weightUnit).toBe('lb');
  });

  it('cambiar el salto persiste y los botones de peso lo reflejan', async () => {
    const { bot, outgoing } = makeHarness(db, BOT_INFO, config);
    await bot.handleUpdate(commandUpdate(1, 'settings'));
    await bot.handleUpdate(callbackUpdate(2, 'set:s:5', 500));
    expect(getUserByTelegramId(db, 111)?.weightStep).toBe(5);
    expect(lastKeyboardDatas(outgoing, 'editMessageText')).toContain('set:s:5');
  });

  it('ignora un valor no permitido sin escribir en la BD', async () => {
    const { bot } = makeHarness(db, BOT_INFO, config);
    await bot.handleUpdate(commandUpdate(1, 'settings'));
    await bot.handleUpdate(callbackUpdate(2, 'set:s:3', 500));
    await bot.handleUpdate(callbackUpdate(3, 'set:l:fr', 500));
    const user = getUserByTelegramId(db, 111);
    expect(user?.weightStep).toBe(2.5);
    // Sigue en 'es' (el language_code del harness): ningún handler atendió
    // 'set:l:fr' ni 'set:s:3', así que no se escribió nada.
    expect(user?.locale).toBe('es');
  });
});
