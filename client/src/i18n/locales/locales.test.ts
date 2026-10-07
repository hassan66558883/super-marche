import { describe, expect, it } from 'vitest';
import fr from './fr';
import en from './en';
import ar from './ar';

type Tree = { [k: string]: string | Tree };

const keys = (t: Tree, prefix = ''): string[] =>
  Object.entries(t).flatMap(([k, v]) => (typeof v === 'string' ? [`${prefix}${k}`] : keys(v, `${prefix}${k}.`)));

/** Plural suffixes differ between languages (Arabic has six forms), so compare base keys */
const base = (k: string) => k.replace(/_(zero|one|two|few|many|other)$/, '');
const placeholders = (s: string) => (s.match(/\{\{\s*\w+\s*\}\}/g) ?? []).map((p) => p.replace(/\s/g, '')).sort();

const lookup = (t: Tree, path: string) => path.split('.').reduce<Tree | string | undefined>((n, k) => (n && typeof n === 'object' ? n[k] : undefined), t);

describe('translations', () => {
  const frKeys = keys(fr as unknown as Tree);

  for (const [name, locale] of [['en', en], ['ar', ar]] as const) {
    it(`${name} translates every French text`, () => {
      const have = new Set(keys(locale as unknown as Tree).map(base));
      expect(frKeys.map(base).filter((k) => !have.has(k))).toEqual([]);
    });

    it(`${name} keeps the same placeholders`, () => {
      // Singular and dual forms may spell the number out ("بيع واحد"), so they can omit {{count}}
      const wrong = frKeys.filter((k) => !/_(one|two)$/.test(k)).filter((k) => {
        const theirs = lookup(locale as unknown as Tree, k);
        return typeof theirs === 'string' && placeholders(theirs).join() !== placeholders(lookup(fr as unknown as Tree, k) as string).join();
      });
      expect(wrong).toEqual([]);
    });
  }
});
