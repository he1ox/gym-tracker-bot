import { describe, expect, it } from 'vitest';
import { CB, parseCallback } from './callback-data';
import { MUSCLE_GROUPS } from '@gym-tracker/core';

describe('callback-data', () => {
  it('builds namespaced ids', () => {
    expect(CB.day(7)).toBe('day:7');
    expect(CB.ex(42)).toBe('ex:42');
    expect(CB.free).toBe('free');
    expect(CB.restCancel).toBe('rest:cancel');
  });

  it('round-trips every builder through the parser', () => {
    expect(parseCallback(CB.day(7))).toEqual({ type: 'day', routineDayId: 7 });
    expect(parseCallback(CB.ex(42))).toEqual({ type: 'ex', exerciseId: 42 });
    expect(parseCallback(CB.free)).toEqual({ type: 'free' });
    expect(parseCallback(CB.rec)).toEqual({ type: 'rec' });
    expect(parseCallback(CB.wPlus)).toEqual({ type: 'weight', direction: 1 });
    expect(parseCallback(CB.wMinus)).toEqual({ type: 'weight', direction: -1 });
    expect(parseCallback(CB.rPlus)).toEqual({ type: 'reps', delta: 1 });
    expect(parseCallback(CB.rMinus)).toEqual({ type: 'reps', delta: -1 });
    expect(parseCallback(CB.warmup)).toEqual({ type: 'warmup' });
    expect(parseCallback(CB.list)).toEqual({ type: 'list' });
    expect(parseCallback(CB.add)).toEqual({ type: 'add' });
    expect(parseCallback(CB.restCancel)).toEqual({ type: 'rest_cancel' });
  });

  it('el ajuste de peso devuelve dirección, no incremento', () => {
    // El incremento es una preferencia del usuario; este parser sigue siendo puro.
    expect(parseCallback('w+')).toEqual({ type: 'weight', direction: 1 });
    expect(parseCallback('w-')).toEqual({ type: 'weight', direction: -1 });
  });

  it('maps unknown or malformed data to { type: "unknown" }', () => {
    expect(parseCallback('nope')).toEqual({ type: 'unknown' });
    expect(parseCallback('day:notanumber')).toEqual({ type: 'unknown' });
    expect(parseCallback('')).toEqual({ type: 'unknown' });
    // Reject hex notation
    expect(parseCallback('day:0x10')).toEqual({ type: 'unknown' });
    // Reject whitespace
    expect(parseCallback('day: ')).toEqual({ type: 'unknown' });
    // Reject sign prefix
    expect(parseCallback('day:+7')).toEqual({ type: 'unknown' });
    // Reject decimal notation
    expect(parseCallback('day:1.0')).toEqual({ type: 'unknown' });
    // Reject negative values
    expect(parseCallback('day:-3')).toEqual({ type: 'unknown' });
    expect(parseCallback('ex:-3')).toEqual({ type: 'unknown' });
    // Reject empty suffix
    expect(parseCallback('day:')).toEqual({ type: 'unknown' });
  });
});

describe('callback-data — pick: namespace', () => {
  it('builds every pick variant with its origin segment', () => {
    expect(CB.pickGroups('c')).toBe('pick:c:g');
    expect(CB.pickGroup('c', 4, 10)).toBe('pick:c:g:4:10');
    expect(CB.pickExercise('c', 37)).toBe('pick:c:x:37');
    expect(CB.pickSearch('c')).toBe('pick:c:s');
    expect(CB.pickGroups('l')).toBe('pick:l:g');
    expect(CB.pickGroup('l', 0, 0)).toBe('pick:l:g:0:0');
    expect(CB.pickExercise('l', 1)).toBe('pick:l:x:1');
    expect(CB.pickSearch('l')).toBe('pick:l:s');
  });

  it('round-trips every builder through the parser', () => {
    expect(parseCallback(CB.pickGroups('c'))).toEqual({ type: 'pick_groups', origin: 'c' });
    expect(parseCallback(CB.pickGroup('c', 4, 10))).toEqual({
      type: 'pick_group',
      origin: 'c',
      groupIndex: 4,
      offset: 10,
    });
    expect(parseCallback(CB.pickExercise('c', 37))).toEqual({
      type: 'pick_exercise',
      origin: 'c',
      exerciseId: 37,
    });
    expect(parseCallback(CB.pickSearch('c'))).toEqual({ type: 'pick_search', origin: 'c' });
    expect(parseCallback(CB.pickGroups('l'))).toEqual({ type: 'pick_groups', origin: 'l' });
    expect(parseCallback(CB.pickExercise('l', 1))).toEqual({
      type: 'pick_exercise',
      origin: 'l',
      exerciseId: 1,
    });
  });

  it('accepts the last valid group index and rejects the one past it', () => {
    const last = MUSCLE_GROUPS.length - 1; // 16
    expect(parseCallback(CB.pickGroup('c', last, 0))).toEqual({
      type: 'pick_group',
      origin: 'c',
      groupIndex: last,
      offset: 0,
    });
    expect(parseCallback(`pick:c:g:${MUSCLE_GROUPS.length}:0`)).toEqual({ type: 'unknown' });
  });

  it('rejects malformed pick data', () => {
    expect(parseCallback('pick:x:g')).toEqual({ type: 'unknown' }); // origen desconocido
    expect(parseCallback('pick:g')).toEqual({ type: 'unknown' }); // sin origen
    expect(parseCallback('pick:c')).toEqual({ type: 'unknown' });
    expect(parseCallback('pick:c:')).toEqual({ type: 'unknown' });
    expect(parseCallback('pick:c:z')).toEqual({ type: 'unknown' }); // pantalla desconocida
    expect(parseCallback('pick:c:g:-1:0')).toEqual({ type: 'unknown' }); // índice negativo
    expect(parseCallback('pick:c:g:2:-10')).toEqual({ type: 'unknown' }); // offset negativo
    expect(parseCallback('pick:c:g:2')).toEqual({ type: 'unknown' }); // falta el offset
    expect(parseCallback('pick:c:g:2:10:3')).toEqual({ type: 'unknown' }); // sobra un segmento
    expect(parseCallback('pick:c:g:a:0')).toEqual({ type: 'unknown' }); // índice no numérico
    expect(parseCallback('pick:c:g:0x2:0')).toEqual({ type: 'unknown' }); // hexadecimal
    expect(parseCallback('pick:c:g:2.0:0')).toEqual({ type: 'unknown' }); // decimal
    expect(parseCallback('pick:c:x:0')).toEqual({ type: 'unknown' }); // id 0
    expect(parseCallback('pick:c:x:-3')).toEqual({ type: 'unknown' });
    expect(parseCallback('pick:c:x:')).toEqual({ type: 'unknown' });
    expect(parseCallback('pick:c:x: 3')).toEqual({ type: 'unknown' }); // espacio
    expect(parseCallback('pick:c:s:1')).toEqual({ type: 'unknown' }); // sufijo de más
  });

  it('parses an offset past the end of a group without complaining', () => {
    // El parser no conoce el catálogo: el rango real lo resuelve el render.
    expect(parseCallback(CB.pickGroup('c', 0, 9990))).toEqual({
      type: 'pick_group',
      origin: 'c',
      groupIndex: 0,
      offset: 9990,
    });
  });

  it('keeps every pick payload within Telegram 64-byte callback_data limit', () => {
    const worst = CB.pickGroup('c', MUSCLE_GROUPS.length - 1, 9990);
    expect(Buffer.byteLength(worst, 'utf8')).toBeLessThanOrEqual(64);
  });
});

describe('welcome callback space', () => {
  it('keeps the six wc: constants distinct and short', () => {
    const all = [CB.wcStart, CB.wcRoutines, CB.wcHistory, CB.wcHelp, CB.wcChart, CB.wcBack];
    expect(new Set(all).size).toBe(6);
    for (const data of all) {
      expect(data.startsWith('wc:')).toBe(true);
      expect(Buffer.byteLength(data, 'utf8')).toBeLessThanOrEqual(64);
    }
  });

  it('does not collide with the day:, ex: or pick: spaces', () => {
    for (const data of [CB.wcStart, CB.wcRoutines, CB.wcHistory, CB.wcHelp, CB.wcChart, CB.wcBack]) {
      // parseCallback es el despachador del catch-all de capture.ts, que se
      // registra DESPUÉS de registerWelcome: un wc: que llegue hasta él es un
      // error de orden de registro, y 'unknown' es la respuesta correcta (D6).
      expect(parseCallback(data)).toEqual({ type: 'unknown' });
    }
  });
});

describe('gráfica de /last: espacio ch:', () => {
  it('no colisiona con day:, ex: o pick: — llegar al catch-all de capture.ts es un error de registro', () => {
    // Igual que wc:*: su handler (registerLast, con filtro por regexp) se registra
    // ANTES del catch-all de capture.ts. Si un ch: llegara hasta parseCallback,
    // 'unknown' es la única respuesta segura — nunca confundirlo con otra acción.
    expect(parseCallback(CB.chart(1))).toEqual({ type: 'unknown' });
  });
});
