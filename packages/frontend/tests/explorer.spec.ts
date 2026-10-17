import { describe, expect, it, beforeEach } from 'vitest';
import { explorerNumber, explorerLabelFor, getExplorerLabel } from '../src/explorer';
import { readFileSync } from 'node:fs';

const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
};

describe('explorer label', () => {
  beforeEach(() => store.clear());

  it('derives a stable 4-digit number', () => {
    const id = 'a'.repeat(32);
    expect(explorerNumber(id)).toMatch(/^\d{4}$/);
    expect(explorerNumber(id)).toBe(explorerNumber(id));
    expect(explorerLabelFor(id)).toMatch(/^Explorer #\d{4}$/);
  });

  it('creates a random ID once and reuses it', () => {
    const first = getExplorerLabel();
    expect(first).toMatch(/^Explorer #\d{4}$/);
    const id = store.get('wondereye.explorerId')!;
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(getExplorerLabel()).toBe(first);
    expect(store.get('wondereye.explorerId')).toBe(id);
  });

  it('never reads Even account or device info', () => {
    const src = readFileSync(new URL('../src/explorer.ts', import.meta.url), 'utf8')
      + readFileSync(new URL('../src/api.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/getUserInfo|getDeviceInfo/);
  });
});
