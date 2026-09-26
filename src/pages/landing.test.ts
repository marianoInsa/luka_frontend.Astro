import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(import.meta.dirname, 'index.astro'), 'utf8');

describe('landing v2', () => {
  it('usa el CTA de WhatsApp con el número acordado', () => {
    expect(source).toContain('https://wa.me/15556378961?text=Hola%20Luka%21');
  });

  it('conserva las secciones narrativas', () => {
    for (const id of ['como-funciona', 'beneficios', 'faq', 'cierre']) {
      expect(source).toContain(`id="${id}"`);
    }
  });

  it('incluye el H1 y el plan aprobados', () => {
    expect(source).toContain('Hacete cargo de tu plata sin planillas ni culpa');
    expect(source).toContain('Escribilo y olvidate. LUKA se acuerda por vos.');
  });

  it('no menciona precios ni costos', () => {
    for (const banned of ['precio', 'costo', 'gratis', 'café', 'cafe']) {
      expect(source.toLowerCase()).not.toContain(banned);
    }
  });

  it('no incluye eyebrow ni microcopy del hero', () => {
    expect(source).not.toContain('ASISTENTE FINANCIERO POR WHATSAPP');
    expect(source).not.toContain('Sin instalaciones');
    expect(source).not.toContain('Configuración en 30 segundos');
  });

  it('no incluye marquee ni efectos de pulso', () => {
    for (const banned of ['marquee', 'pulse', 'parpade']) {
      expect(source.toLowerCase()).not.toContain(banned);
    }
  });

  it('toda imagen tiene alt', () => {
    const imgs = source.match(/<img\b[^>]*>/g) ?? [];
    for (const img of imgs) expect(img).toContain('alt=');
  });

  it('el FAQ usa details/summary nativo', () => {
    expect((source.match(/<details/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });

  it('el footer es simple y sin link de WhatsApp', () => {
    expect(source).toContain('Todos los derechos reservados');
    expect(source).not.toContain('Escribinos por WhatsApp');
  });
});
