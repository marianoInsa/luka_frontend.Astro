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

  it('el hero conserva las dos tarjetas y renombra el Dashboard', () => {
    expect(source).toContain('Dashboard');
    expect(source).not.toContain('Gastos de octubre');
    expect(source).toContain('data-card="dashboard"');
    expect(source).toContain('data-card="phone"');
    expect(source).toContain('aria-pressed');
  });

  it('la secuencia del hero carga gastos e ingresos', () => {
    for (const text of [
      'Cobré 850000 de sueldo',
      'Listo: sueldo,',
      'Gasté 5000 en nafta',
      'Pagué 12000 de internet',
    ]) {
      expect(source).toContain(text);
    }
    expect(source).toContain('data-seq');
    expect(source).toContain('data-seg="typing"');
  });

  it('el chat respeta el formato de WhatsApp (sin íconos ni barras custom)', () => {
    for (const banned of ['bubble__check', 'mini-balance', 'tabular money-in']) {
      expect(source).not.toContain(banned);
    }
    expect(source).toContain('Cuenta comercial');
    expect(source).toContain('bubble__ticks');
    expect(source).toContain('Balance del mes:');
  });

  it('el logo del chat es el mismo de la página', () => {
    expect(source.match(/logo-luka\.png/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it('el Dashboard refleja los datos del chat y las categorías extra', () => {
    for (const text of [
      'mini-dash__menu',
      'bar__fill--comida',
      'bar__fill--servicios',
      'bar__fill--ocio',
      'bar__fill--transporte',
      '$20.000',
      '$12.000',
      '$8.000',
      '$5.000',
      '$805.000',
    ]) {
      expect(source).toContain(text);
    }
    for (const banned of ['$833.000', '$17.000', 'dot--coral']) {
      expect(source).not.toContain(banned);
    }
  });
});
