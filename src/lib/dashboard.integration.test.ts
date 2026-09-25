import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createCsvStream } from './csv';
import {
  getBudgetsWithUsage,
  getConsumoPresupuesto,
  getExpensesByCategory,
  getMonthlyFlow,
  getPatrimonioNeto,
  getPortfolioByCurrency,
  getRecentTransactions,
  getSummaryStats,
  getUserByAuthId,
} from './dashboard';
import { closeDb, getDb, type Sql } from './db';

// Guarded integration test: hits the real Postgres. Skipped unless explicitly
// opted in, so `npm test` (and CI) stays hermetic.
const RUN = process.env.RUN_DB_INTEGRATION === '1';

const CREATED_BASE = new Date('2026-05-20T12:00:00Z');
const ANULADO_AT = new Date('2026-05-25T00:00:00Z');

function createdAt(offsetMinutes: number): Date {
  return new Date(CREATED_BASE.getTime() + offsetMinutes * 60_000);
}

interface SeedMovement {
  id: string;
  usuarioId: string;
  tipo: string;
  cantidad: string;
  moneda: string;
  fecha: string;
  categoriaId: string | null;
  descripcion: string | null;
  creadoOffset: number;
  anulado?: boolean;
}

describe.skipIf(!RUN)('dashboard data layer (Postgres integration)', () => {
  const suffix = randomUUID();
  const authUserId = randomUUID();
  const userId = randomUUID();
  const email = `dash-int-${suffix}@example.com`;
  const whatsappId = `test-dash-${suffix}`;

  const otherUserId = randomUUID();
  const otherEmail = `dash-int-other-${suffix}@example.com`;

  const catFoodId = randomUUID();
  const catEduId = randomUUID();

  const ids = {
    activeFood: randomUUID(),
    activeIncome: randomUUID(),
    annulledExpense: randomUUID(),
    annulledIncome: randomUUID(),
    usdExpense: randomUUID(),
    usdIncome: randomUUID(),
    aprilEdu: randomUUID(),
    marchFood: randomUUID(),
    febIncome: randomUUID(),
    janExpense: randomUUID(),
    decExpense: randomUUID(),
    novExpense: randomUUID(),
    otherUser: randomUUID(),
  };

  let sql: Sql | undefined;

  function db(): Sql {
    if (!sql) throw new Error('integration DB client not initialized');
    return sql;
  }

  beforeAll(async () => {
    sql = getDb();
    const now = new Date();

    // usuario.auth_user_id tiene FK real a auth.users(id) en esta DB.
    await db()`
      INSERT INTO auth.users (id, email, created_at, updated_at)
      VALUES (${authUserId}::uuid, ${email}, ${now}, ${now})
    `;
    await db()`
      INSERT INTO usuario (id, nombre, email, auth_user_id, whatsapp_id, creado_en, actualizado_en)
      VALUES (${userId}::uuid, 'Dashboard Int', ${email}, ${authUserId}::uuid, ${whatsappId}, ${now}, ${now})
    `;
    await db()`
      INSERT INTO usuario (id, nombre, email, auth_user_id, whatsapp_id, creado_en, actualizado_en)
      VALUES (${otherUserId}::uuid, 'Otro Usuario', ${otherEmail}, NULL, NULL, ${now}, ${now})
    `;

    await db()`
      INSERT INTO categorias (id, usuario_id, nombre, es_default, esta_eliminado)
      VALUES (${catFoodId}::uuid, ${userId}::uuid, 'Comida', false, false)
    `;
    await db()`
      INSERT INTO categorias (id, usuario_id, nombre, es_default, esta_eliminado)
      VALUES (${catEduId}::uuid, ${userId}::uuid, 'Educación', false, false)
    `;

    await db()`
      INSERT INTO limite_categoria (id, usuario_id, categoria_id, cantidad_max, inicio_periodo, fin_periodo)
      VALUES (${randomUUID()}::uuid, ${userId}::uuid, ${catFoodId}::uuid, ${'10000.00'}::numeric, ${'2026-05-01'}::date, ${'2026-05-31'}::date)
    `;
    await db()`
      INSERT INTO limite_categoria (id, usuario_id, categoria_id, cantidad_max, inicio_periodo, fin_periodo)
      VALUES (${randomUUID()}::uuid, ${userId}::uuid, ${catEduId}::uuid, ${'3000.00'}::numeric, ${'2026-04-01'}::date, ${'2026-04-30'}::date)
    `;

    const movements: SeedMovement[] = [
      // Mayo 2026: activos, un anulado y un USD por cada tipo.
      {
        id: ids.activeFood,
        usuarioId: userId,
        tipo: 'egreso',
        cantidad: '1500.00',
        moneda: 'ARS',
        fecha: '2026-05-10',
        categoriaId: catFoodId,
        descripcion: 'Almuerzo, "especial"',
        creadoOffset: 0,
      },
      {
        id: ids.activeIncome,
        usuarioId: userId,
        tipo: 'ingreso',
        cantidad: '12000.00',
        moneda: 'ARS',
        fecha: '2026-05-10',
        categoriaId: null,
        descripcion: 'Sueldo',
        creadoOffset: 1,
      },
      {
        id: ids.annulledExpense,
        usuarioId: userId,
        tipo: 'egreso',
        cantidad: '9999.00',
        moneda: 'ARS',
        fecha: '2026-05-11',
        categoriaId: catFoodId,
        descripcion: 'Gasto anulado',
        creadoOffset: 2,
        anulado: true,
      },
      {
        id: ids.annulledIncome,
        usuarioId: userId,
        tipo: 'ingreso',
        cantidad: '7000.00',
        moneda: 'ARS',
        fecha: '2026-05-11',
        categoriaId: null,
        descripcion: 'Ingreso anulado',
        creadoOffset: 3,
        anulado: true,
      },
      {
        id: ids.usdExpense,
        usuarioId: userId,
        tipo: 'egreso',
        cantidad: '2.00',
        moneda: 'USD',
        fecha: '2026-05-12',
        categoriaId: null,
        descripcion: 'Café USD',
        creadoOffset: 4,
      },
      {
        id: ids.usdIncome,
        usuarioId: userId,
        tipo: 'ingreso',
        cantidad: '10.00',
        moneda: 'USD',
        fecha: '2026-05-12',
        categoriaId: null,
        descripcion: 'Cobro USD',
        creadoOffset: 5,
      },
      // Meses previos para el flujo/portfolio y el recorte a últimos 6.
      {
        id: ids.aprilEdu,
        usuarioId: userId,
        tipo: 'egreso',
        cantidad: '4000.00',
        moneda: 'ARS',
        fecha: '2026-04-15',
        categoriaId: catEduId,
        descripcion: 'Curso',
        creadoOffset: 6,
      },
      {
        id: ids.marchFood,
        usuarioId: userId,
        tipo: 'egreso',
        cantidad: '1000.00',
        moneda: 'ARS',
        fecha: '2026-03-05',
        categoriaId: catFoodId,
        descripcion: null,
        creadoOffset: 7,
      },
      {
        id: ids.febIncome,
        usuarioId: userId,
        tipo: 'ingreso',
        cantidad: '500.00',
        moneda: 'ARS',
        fecha: '2026-02-05',
        categoriaId: null,
        descripcion: null,
        creadoOffset: 8,
      },
      {
        id: ids.janExpense,
        usuarioId: userId,
        tipo: 'egreso',
        cantidad: '300.00',
        moneda: 'ARS',
        fecha: '2026-01-05',
        categoriaId: null,
        descripcion: null,
        creadoOffset: 9,
      },
      {
        id: ids.decExpense,
        usuarioId: userId,
        tipo: 'egreso',
        cantidad: '200.00',
        moneda: 'ARS',
        fecha: '2025-12-05',
        categoriaId: null,
        descripcion: null,
        creadoOffset: 10,
      },
      {
        id: ids.novExpense,
        usuarioId: userId,
        tipo: 'egreso',
        cantidad: '100.00',
        moneda: 'ARS',
        fecha: '2025-11-05',
        categoriaId: null,
        descripcion: null,
        creadoOffset: 11,
      },
      // Otro usuario: no debe aparecer en ninguna consulta.
      {
        id: ids.otherUser,
        usuarioId: otherUserId,
        tipo: 'egreso',
        cantidad: '4200.00',
        moneda: 'ARS',
        fecha: '2026-05-10',
        categoriaId: null,
        descripcion: 'Ajeno',
        creadoOffset: 12,
      },
    ];

    for (const movement of movements) {
      await db()`
        INSERT INTO movimientos_financieros
          (id, usuario_id, categoria_id, tipo, cantidad, moneda, descripcion,
           fecha_movimiento, anulado_en, creado_en)
        VALUES
          (${movement.id}::uuid, ${movement.usuarioId}::uuid, ${movement.categoriaId}::uuid,
           ${movement.tipo}, ${movement.cantidad}::numeric, ${movement.moneda},
           ${movement.descripcion}, ${movement.fecha}::date,
           ${movement.anulado ? ANULADO_AT : null}, ${createdAt(movement.creadoOffset)})
      `;
    }
  });

  afterAll(async () => {
    if (sql) {
      try {
        await sql`DELETE FROM movimientos_financieros WHERE usuario_id = ${userId}::uuid OR usuario_id = ${otherUserId}::uuid`;
        await sql`DELETE FROM limite_categoria WHERE usuario_id = ${userId}::uuid`;
        await sql`DELETE FROM categorias WHERE usuario_id = ${userId}::uuid OR usuario_id = ${otherUserId}::uuid`;
        await sql`DELETE FROM usuario WHERE id = ${userId}::uuid OR id = ${otherUserId}::uuid`;
        await sql`DELETE FROM auth.users WHERE id = ${authUserId}::uuid`;
      } catch {
        // ponytail: best-effort cleanup; the post-run verification query is the real check
      }
    }
    await closeDb();
  });

  async function readStream(stream: ReadableStream<Uint8Array>): Promise<string> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let text = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }
    return text;
  }

  it('getUserByAuthId resuelve el uuid válido y rechaza el resto', async () => {
    await expect(getUserByAuthId(db(), authUserId)).resolves.toEqual({
      id: userId,
      whatsapp_id: whatsappId,
    });
    await expect(getUserByAuthId(db(), 'no-es-un-uuid')).resolves.toBeNull();
    await expect(getUserByAuthId(db(), randomUUID())).resolves.toBeNull();
  });

  it('getSummaryStats suma activos, cuenta solo egreso/ingreso y elige la top categoría', async () => {
    const all = await getSummaryStats(db(), userId);
    expect(all.total_spent).toBe(7102);
    expect(all.total_income).toBe(12510);
    expect(all.transaction_count).toBe(10);
    expect(all.top_category).toBe('Educación');
    // Sin fechas, Python usa start = end = hoy → days_range 1.
    expect(all.avg_per_day).toBe(7102);

    const may = await getSummaryStats(db(), userId, '2026-05-01', '2026-05-31');
    expect(may.total_spent).toBe(1502);
    expect(may.total_income).toBe(12010);
    expect(may.transaction_count).toBe(4);
    expect(may.top_category).toBe('Comida');
    expect(may.avg_per_day).toBe(1502 / 31);
  });

  it('getExpensesByCategory ordena desc, colorea por nombre y no fusiona null con "Otro"', async () => {
    await expect(getExpensesByCategory(db(), userId)).resolves.toEqual([
      { category: 'Educación', total: 4000, color: '#f59e0b' },
      { category: 'Comida', total: 2500, color: '#6366f1' },
      { category: 'Otro', total: 602, color: '#64748b' },
    ]);

    await expect(
      getExpensesByCategory(db(), userId, '2026-05-01', '2026-05-31'),
    ).resolves.toEqual([
      { category: 'Comida', total: 1500, color: '#6366f1' },
      { category: 'Otro', total: 2, color: '#64748b' },
    ]);
  });

  it('getRecentTransactions formatea fecha/hora, ordena desc y respeta el límite', async () => {
    const rows = await getRecentTransactions(db(), userId);
    expect(rows.map((row) => row.id)).toEqual([
      ids.novExpense,
      ids.decExpense,
      ids.janExpense,
      ids.febIncome,
      ids.marchFood,
      ids.aprilEdu,
      ids.usdIncome,
      ids.usdExpense,
      ids.activeIncome,
      ids.activeFood,
    ]);

    expect(rows[0]).toMatchObject({
      amount: 100,
      tipo: 'egreso',
      moneda: 'ARS',
      category: 'Otro',
      description: '—',
      date: '05 Nov 2025',
      time: '12:11',
      color: '#64748b',
    });
    expect(rows.find((row) => row.id === ids.activeFood)).toMatchObject({
      amount: 1500,
      category: 'Comida',
      description: 'Almuerzo, "especial"',
      date: '10 May 2026',
      time: '12:00',
      color: '#6366f1',
    });
    expect(rows.find((row) => row.id === ids.activeIncome)).toMatchObject({
      amount: 12000,
      tipo: 'ingreso',
      category: 'Otro',
      color: '#10b981',
    });

    const limited = await getRecentTransactions(db(), userId, 3);
    expect(limited.map((row) => row.id)).toEqual([ids.novExpense, ids.decExpense, ids.janExpense]);

    const may = await getRecentTransactions(db(), userId, 15, '2026-05-01', '2026-05-31');
    expect(may.map((row) => row.id)).toEqual([
      ids.usdIncome,
      ids.usdExpense,
      ids.activeIncome,
      ids.activeFood,
    ]);
  });

  it('getBudgetsWithUsage calcula spent/pct/remaining/over en una sola query', async () => {
    const all = await getBudgetsWithUsage(db(), userId);
    const byCategory = Object.fromEntries(all.map((budget) => [budget.category, budget]));
    expect(byCategory.Comida).toEqual({
      category: 'Comida',
      limit: 10000,
      spent: 2500,
      remaining: 7500,
      pct: 25,
      color: '#6366f1',
      over: false,
    });
    expect(byCategory['Educación']).toEqual({
      category: 'Educación',
      limit: 3000,
      spent: 4000,
      remaining: 0,
      pct: 100,
      color: '#f59e0b',
      over: true,
    });

    const may = await getBudgetsWithUsage(db(), userId, '2026-05-01', '2026-05-31');
    const mayByCategory = Object.fromEntries(may.map((budget) => [budget.category, budget]));
    expect(mayByCategory.Comida).toMatchObject({ spent: 1500, remaining: 8500, pct: 15, over: false });
    expect(mayByCategory['Educación']).toMatchObject({ spent: 0, remaining: 3000, pct: 0, over: false });
  });

  it('getPatrimonioNeto convierte USD con la tasa fija y excluye anulados', async () => {
    await expect(getPatrimonioNeto(db(), userId)).resolves.toEqual({
      total_ars: 15800,
      usd_rate: 1300,
      is_positive: true,
    });

    const may = await getPatrimonioNeto(db(), userId, '2026-05-01', '2026-05-31');
    expect(may.total_ars).toBe(12000 + 13000 - 1500 - 2600);
  });

  it('getConsumoPresupuesto suma límites y egresos de esas categorías', async () => {
    await expect(getConsumoPresupuesto(db(), userId)).resolves.toEqual({
      pct: 50,
      spent: 6500,
      limit: 13000,
      over: false,
    });
    await expect(
      getConsumoPresupuesto(db(), userId, '2026-05-01', '2026-05-31'),
    ).resolves.toEqual({ pct: 12, spent: 1500, limit: 13000, over: false });

    const noBudgets = await getConsumoPresupuesto(db(), otherUserId);
    expect(noBudgets).toEqual({ pct: 0, spent: 0, limit: 0 });
    expect(noBudgets.over).toBeUndefined();
  });

  it('getMonthlyFlow agrupa por mes, etiqueta en español y recorta a 6 sin fechas', async () => {
    await expect(getMonthlyFlow(db(), userId)).resolves.toEqual([
      { month: 'Dic 2025', ingresos: 0, egresos: 200 },
      { month: 'Ene 2026', ingresos: 0, egresos: 300 },
      { month: 'Feb 2026', ingresos: 500, egresos: 0 },
      { month: 'Mar 2026', ingresos: 0, egresos: 1000 },
      { month: 'Abr 2026', ingresos: 0, egresos: 4000 },
      { month: 'May 2026', ingresos: 12010, egresos: 1502 },
    ]);

    await expect(getMonthlyFlow(db(), userId, '2026-04-01', '2026-05-31')).resolves.toEqual([
      { month: 'Abr 2026', ingresos: 0, egresos: 4000 },
      { month: 'May 2026', ingresos: 12010, egresos: 1502 },
    ]);
  });

  it('getPortfolioByCurrency separa ARS/USD, convierte y recorta a 6 sin fechas', async () => {
    await expect(getPortfolioByCurrency(db(), userId)).resolves.toEqual([
      { month: 'Nov 2025', ARS: 100, USD: 0 },
      { month: 'Dic 2025', ARS: 200, USD: 0 },
      { month: 'Ene 2026', ARS: 300, USD: 0 },
      { month: 'Mar 2026', ARS: 1000, USD: 0 },
      { month: 'Abr 2026', ARS: 4000, USD: 0 },
      { month: 'May 2026', ARS: 1500, USD: 2600 },
    ]);

    await expect(
      getPortfolioByCurrency(db(), userId, '2026-05-01', '2026-05-31'),
    ).resolves.toEqual([{ month: 'May 2026', ARS: 1500, USD: 2600 }]);
  });

  it('el CSV reproduce el formato de Python y pagina por keyset', async () => {
    const user = await getUserByAuthId(db(), authUserId);
    expect(user).not.toBeNull();

    const may = await readStream(createCsvStream(db(), user!.id, '2026-05-01', '2026-05-31'));
    expect(may).toBe(
      'Fecha,Monto,Moneda,Categoria,Descripcion\r\n' +
        '2026-05-12,10.0,USD,Otro,Cobro USD\r\n' +
        '2026-05-12,2.0,USD,Otro,Café USD\r\n' +
        '2026-05-10,12000.0,ARS,Otro,Sueldo\r\n' +
        '2026-05-10,1500.0,ARS,Comida,"Almuerzo, ""especial"""\r\n',
    );

    // Con lotes chicos el keyset debe devolver exactamente lo mismo.
    const smallBatches = await readStream(createCsvStream(db(), user!.id, null, null, 2));
    const oneBatch = await readStream(createCsvStream(db(), user!.id, null, null, 500));
    expect(smallBatches).toBe(oneBatch);
    expect(smallBatches.split('\r\n').filter(Boolean)).toHaveLength(11);
    expect(smallBatches).not.toContain('9999');
    expect(smallBatches).not.toContain('Ajeno');
    expect(smallBatches).not.toContain('4200');
  });
});
