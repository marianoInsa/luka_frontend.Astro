import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (f: string) => readFileSync(resolve(import.meta.dirname, f), 'utf8');

describe('brand tokens en CSS legacy', () => {
  it('style.css importa tokens y no conserva la paleta legacy', () => {
    const css = read('style.css').toLowerCase();
    expect(css).toContain('@import "./tokens.css"');
    for (const hex of ['#6366f1', '#8b5cf6', '#a5b4fc', '#c7d2fe', '#080b14', '#0f1424', '#161d30', '#f1f5f9', '#94a3b8']) {
      expect(css).not.toContain(hex);
    }
  });

  it('admin_flows.css no hardcodea la paleta legacy', () => {
    const css = read('admin_flows.css').toLowerCase();
    for (const hex of ['#6366f1', '#818cf8', '#a5b4fc', '#5eead4', '#99f6e4']) {
      expect(css).not.toContain(hex);
    }
  });
});
