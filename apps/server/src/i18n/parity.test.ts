import { describe, expect, it } from 'vitest';
import { en } from './locales/en';
import { es } from './locales/es';

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix === '' ? key : `${prefix}.${key}`;
    if (typeof value === 'string') {
      out.set(path, value);
    } else {
      for (const [k, v] of flatten(value, path)) {
        out.set(k, v);
      }
    }
  }
  return out;
}

const variables = (value: string): string[] =>
  [...value.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1] as string).sort();

describe('paridad de catálogos', () => {
  const flatEs = flatten(es as Tree);
  const flatEn = flatten(en as Tree);

  it('los dos idiomas tienen exactamente las mismas claves', () => {
    expect([...flatEn.keys()].sort()).toEqual([...flatEs.keys()].sort());
  });

  it('cada mensaje usa las mismas variables en los dos idiomas', () => {
    for (const [key, valueEs] of flatEs) {
      expect(variables(valueEs), `variables de ${key}`).toEqual(variables(flatEn.get(key) ?? ''));
    }
  });

  it('ningún valor está vacío', () => {
    for (const [key, value] of [...flatEs, ...flatEn]) {
      expect(value.trim(), `valor de ${key}`).not.toBe('');
    }
  });

  it('cubre los 17 grupos musculares y los 51 ejercicios en los dos idiomas', () => {
    for (const flat of [flatEs, flatEn]) {
      expect([...flat.keys()].filter((k) => k.startsWith('muscleGroup.'))).toHaveLength(17);
      expect([...flat.keys()].filter((k) => k.startsWith('exercise.'))).toHaveLength(51);
    }
  });
});
