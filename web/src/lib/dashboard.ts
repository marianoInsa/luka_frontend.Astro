import { todayLocal } from './dates';
import type { Sql } from './db';
import { parseUuid } from './onboarding';

export interface DashboardUser {
  id: string;
  whatsapp_id: string | null;
}

export interface SummaryStats {
  total_spent: number;
  total_income: number;
  transaction_count: number;
  top_category: string;
  avg_per_day: number;
}

export interface CategoryExpense {
  category: string;
  total: number;
  color: string;
}

export interface RecentTransaction {
  id: string;
  amount: number;
  tipo: string;
  moneda: string;
  category: string;
  description: string;
  date: string;
  time: string;
  color: string;
}

export interface BudgetUsage {
  category: string;
  limit: number;
  spent: number;
  remaining: number;
  pct: number;
  color: string;
  over: boolean;
}

export interface PatrimonioNeto {
  total_ars: number;
  usd_rate: number;
  is_positive: boolean;
}

export interface ConsumoPresupuesto {
  pct: number;
  spent: number;
  limit: number;
  over?: boolean;
}

export interface MonthlyFlowPoint {
  month: string;
  ingresos: number;
  egresos: number;
}

export interface PortfolioPoint {
  month: string;
  ARS: number;
  USD: number;
}

export const CATEGORY_COLORS: Record<string, string> = {
  Comida: '#6366f1',
  Transporte: '#8b5cf6',
  Entretenimiento: '#ec4899',
  Salud: '#14b8a6',
  // Ojo: con tilde. La semilla de onboarding usa "Educacion" sin tilde y por
  // eso cae al color default (#64748b); es la paridad actual con Python.
  Educación: '#f59e0b',
  Hogar: '#10b981',
  Ropa: '#f97316',
  Otro: '#64748b',
};

// TODO: Reemplazar con cotización cacheada real (paridad con app/dashboard.py).
export const USD_TO_ARS_RATE = 1300.0;

export const MONTH_NAMES_ES = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
];

// Meses en inglés para el formato "%d %b %Y" de strftime (locale-independent).
const MONTH_NAMES_EN = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

// round() de Python: half-even sobre el binario (2.5→2, 3.5→4, -2.5→-2).
export function pythonRound(value: number): number {
  const floor = Math.floor(value);
  const diff = value - floor;
  if (diff > 0.5) return floor + 1;
  if (diff < 0.5) return floor;
  return floor % 2 === 0 ? floor : floor + 1;
}

// (to - from) en días, vía Date.UTC (paridad con date - date).
export function dayDiff(fromIso: string, toIso: string): number {
  const [fromYear, fromMonth, fromDay] = fromIso.split('-').map(Number);
  const [toYear, toMonth, toDay] = toIso.split('-').map(Number);
  return Math.round(
    (Date.UTC(toYear, toMonth - 1, toDay) - Date.UTC(fromYear, fromMonth - 1, fromDay)) /
      86_400_000,
  );
}

// Filtros de fecha opcionales e independientes, como los `if date_from/date_to`
// de Python. El alias de la tabla siempre es `m`.
function dateFilters(
  sql: Sql,
  dateFrom: string | null | undefined,
  dateTo: string | null | undefined,
) {
  return sql`
    ${dateFrom ? sql`AND m.fecha_movimiento >= ${dateFrom}::date` : sql``}
    ${dateTo ? sql`AND m.fecha_movimiento <= ${dateTo}::date` : sql``}
  `;
}

export async function getUserByAuthId(
  sql: Sql,
  authUserId: string,
): Promise<DashboardUser | null> {
  const parsed = parseUuid(authUserId);
  if (!parsed) return null;
  const rows = await sql<DashboardUser[]>`
    SELECT id, whatsapp_id FROM usuario WHERE auth_user_id = ${parsed}::uuid
  `;
  return rows[0] ?? null;
}

export async function getSummaryStats(
  sql: Sql,
  userId: string,
  dateFrom: string | null = null,
  dateTo: string | null = null,
): Promise<SummaryStats> {
  // Una sola pasada agrupada por tipo: solo egreso/ingreso cuentan (igual que
  // las dos queries + len() de Python).
  const totals = await sql<{ tipo: string; count: number; total: string }[]>`
    SELECT m.tipo,
           count(*)::int AS count,
           COALESCE(SUM(m.cantidad), 0)::text AS total
    FROM movimientos_financieros m
    WHERE m.usuario_id = ${userId}::uuid
      AND m.anulado_en IS NULL
      ${dateFilters(sql, dateFrom, dateTo)}
    GROUP BY m.tipo
  `;

  let totalSpent = 0;
  let totalIncome = 0;
  let transactionCount = 0;
  for (const row of totals) {
    if (row.tipo === 'egreso') {
      totalSpent = Number(row.total);
      transactionCount += row.count;
    } else if (row.tipo === 'ingreso') {
      totalIncome = Number(row.total);
      transactionCount += row.count;
    }
  }

  const topRows = await sql<{ nombre: string | null }[]>`
    SELECT c.nombre
    FROM movimientos_financieros m
    LEFT JOIN categorias c ON c.id = m.categoria_id
    WHERE m.usuario_id = ${userId}::uuid
      AND m.tipo = 'egreso'
      AND m.anulado_en IS NULL
      ${dateFilters(sql, dateFrom, dateTo)}
    GROUP BY c.nombre
    ORDER BY SUM(m.cantidad) DESC
    LIMIT 1
  `;
  const topCategory = topRows[0] ? (topRows[0].nombre ?? 'Otro') : '—';

  const today = todayLocal();
  const end = dateTo ? (dateTo < today ? dateTo : today) : today;
  const start = dateFrom || end;
  const daysRange = Math.max(1, dayDiff(start, end) + 1);

  return {
    total_spent: totalSpent,
    total_income: totalIncome,
    transaction_count: transactionCount,
    top_category: topCategory,
    avg_per_day: totalSpent / daysRange,
  };
}

export async function getExpensesByCategory(
  sql: Sql,
  userId: string,
  dateFrom: string | null = null,
  dateTo: string | null = null,
): Promise<CategoryExpense[]> {
  // GROUP BY del nombre crudo (sin COALESCE) para no fusionar un movimiento sin
  // categoría con una categoría llamada "Otro", igual que Python.
  const rows = await sql<{ categoria_nombre: string | null; total: string }[]>`
    SELECT c.nombre AS categoria_nombre, SUM(m.cantidad)::text AS total
    FROM movimientos_financieros m
    LEFT JOIN categorias c ON c.id = m.categoria_id
    WHERE m.usuario_id = ${userId}::uuid
      AND m.tipo = 'egreso'
      AND m.anulado_en IS NULL
      ${dateFilters(sql, dateFrom, dateTo)}
    GROUP BY c.nombre
    ORDER BY SUM(m.cantidad) DESC
  `;
  return rows.map((row) => {
    const category = row.categoria_nombre || 'Otro';
    return {
      category,
      total: Number(row.total),
      color: CATEGORY_COLORS[category] ?? '#64748b',
    };
  });
}

interface RecentTransactionRow {
  id: string;
  amount: string;
  tipo: string;
  moneda: string;
  categoria: string | null;
  descripcion: string | null;
  day: number;
  month: number;
  year: number;
  hour: number | null;
  minute: number | null;
}

export async function getRecentTransactions(
  sql: Sql,
  userId: string,
  limit = 15,
  dateFrom: string | null = null,
  dateTo: string | null = null,
): Promise<RecentTransaction[]> {
  const rows = await sql<RecentTransactionRow[]>`
    SELECT m.id,
           m.cantidad::text AS amount,
           m.tipo,
           m.moneda,
           c.nombre AS categoria,
           m.descripcion,
           EXTRACT(DAY FROM m.fecha_movimiento)::int AS day,
           EXTRACT(MONTH FROM m.fecha_movimiento)::int AS month,
           EXTRACT(YEAR FROM m.fecha_movimiento)::int AS year,
           EXTRACT(HOUR FROM m.creado_en)::int AS hour,
           EXTRACT(MINUTE FROM m.creado_en)::int AS minute
    FROM movimientos_financieros m
    LEFT JOIN categorias c ON c.id = m.categoria_id
    WHERE m.usuario_id = ${userId}::uuid
      AND m.anulado_en IS NULL
      ${dateFilters(sql, dateFrom, dateTo)}
    ORDER BY m.creado_en DESC
    LIMIT ${limit}
  `;
  const pad = (value: number) => String(value).padStart(2, '0');
  return rows.map((row) => {
    const category = row.categoria || 'Otro';
    return {
      id: row.id,
      amount: Number(row.amount),
      tipo: row.tipo,
      moneda: row.moneda,
      category,
      description: row.descripcion || '—',
      date: `${pad(row.day)} ${MONTH_NAMES_EN[row.month - 1]} ${row.year}`,
      time:
        row.hour !== null && row.minute !== null
          ? `${pad(row.hour)}:${pad(row.minute)}`
          : '00:00',
      color: row.tipo === 'ingreso' ? '#10b981' : (CATEGORY_COLORS[category] ?? '#64748b'),
    };
  });
}

export async function getBudgetsWithUsage(
  sql: Sql,
  userId: string,
  dateFrom: string | null = null,
  dateTo: string | null = null,
): Promise<BudgetUsage[]> {
  // Una sola query con LEFT JOIN en vez del N+1 de Python. Los filtros de fecha
  // van dentro del ON para no descartar presupuestos sin movimientos.
  const rows = await sql<{ categoria: string | null; cantidad_max: string; spent: string }[]>`
    SELECT c.nombre AS categoria,
           l.cantidad_max::text AS cantidad_max,
           COALESCE(SUM(m.cantidad), 0)::text AS spent
    FROM limite_categoria l
    LEFT JOIN categorias c ON c.id = l.categoria_id
    LEFT JOIN movimientos_financieros m
      ON m.categoria_id = l.categoria_id
     AND m.usuario_id = l.usuario_id
     AND m.tipo = 'egreso'
     AND m.anulado_en IS NULL
     ${dateFrom ? sql`AND m.fecha_movimiento >= ${dateFrom}::date` : sql``}
     ${dateTo ? sql`AND m.fecha_movimiento <= ${dateTo}::date` : sql``}
    WHERE l.usuario_id = ${userId}::uuid
    GROUP BY l.id, c.nombre, l.cantidad_max
  `;
  return rows.map((row) => {
    const category = row.categoria || 'Otro';
    const limit = Number(row.cantidad_max);
    const spent = Number(row.spent);
    return {
      category,
      limit,
      spent,
      remaining: Math.max(limit - spent, 0),
      pct: limit > 0 ? Math.min(pythonRound((spent / limit) * 100), 100) : 0,
      color: CATEGORY_COLORS[category] ?? '#64748b',
      over: spent > limit,
    };
  });
}

export async function getPatrimonioNeto(
  sql: Sql,
  userId: string,
  dateFrom: string | null = null,
  dateTo: string | null = null,
): Promise<PatrimonioNeto> {
  // La conversión USD y la resta viven en Postgres (numeric exacto, como el
  // Decimal de Python); se pasa a number una sola vez al final.
  const rows = await sql<{ total_ars: string }[]>`
    SELECT COALESCE(SUM(CASE WHEN convertido.tipo = 'ingreso' THEN convertido.amt ELSE -convertido.amt END), 0)::text AS total_ars
    FROM (
      SELECT m.tipo,
             CASE
               WHEN upper(coalesce(m.moneda, '')) = 'USD'
                 THEN m.cantidad * ${USD_TO_ARS_RATE}::numeric
               ELSE m.cantidad
             END AS amt
      FROM movimientos_financieros m
      WHERE m.usuario_id = ${userId}::uuid
        AND m.anulado_en IS NULL
        ${dateFilters(sql, dateFrom, dateTo)}
    ) AS convertido
  `;
  const totalArs = Number(rows[0].total_ars);
  return {
    total_ars: totalArs,
    usd_rate: USD_TO_ARS_RATE,
    is_positive: totalArs >= 0,
  };
}

export async function getConsumoPresupuesto(
  sql: Sql,
  userId: string,
  dateFrom: string | null = null,
  dateTo: string | null = null,
): Promise<ConsumoPresupuesto> {
  const budgets = await sql<{ cantidad_max: string; categoria_id: string }[]>`
    SELECT cantidad_max::text AS cantidad_max, categoria_id
    FROM limite_categoria
    WHERE usuario_id = ${userId}::uuid
  `;
  if (budgets.length === 0) return { pct: 0, spent: 0, limit: 0 };

  const totalLimit = budgets.reduce((sum, budget) => sum + Number(budget.cantidad_max), 0);
  if (totalLimit === 0) return { pct: 0, spent: 0, limit: 0 };

  const categoryIds = budgets.map((budget) => budget.categoria_id);
  const spentRows = await sql<{ spent: string }[]>`
    SELECT COALESCE(SUM(m.cantidad), 0)::text AS spent
    FROM movimientos_financieros m
    WHERE m.usuario_id = ${userId}::uuid
      AND m.tipo = 'egreso'
      AND m.categoria_id IN ${sql(categoryIds)}
      AND m.anulado_en IS NULL
      ${dateFilters(sql, dateFrom, dateTo)}
  `;
  const spent = Number(spentRows[0].spent);
  return {
    pct: Math.min(pythonRound((spent / totalLimit) * 100), 100),
    spent,
    limit: totalLimit,
    over: spent > totalLimit,
  };
}

interface MonthTotalRow {
  year: number;
  month: number;
  total: string;
}

export async function getMonthlyFlow(
  sql: Sql,
  userId: string,
  dateFrom: string | null = null,
  dateTo: string | null = null,
): Promise<MonthlyFlowPoint[]> {
  const rows = await sql<(MonthTotalRow & { tipo: string })[]>`
    SELECT EXTRACT(YEAR FROM m.fecha_movimiento)::int AS year,
           EXTRACT(MONTH FROM m.fecha_movimiento)::int AS month,
           m.tipo,
           COALESCE(SUM(m.cantidad), 0)::text AS total
    FROM movimientos_financieros m
    WHERE m.usuario_id = ${userId}::uuid
      AND m.anulado_en IS NULL
      ${dateFilters(sql, dateFrom, dateTo)}
    GROUP BY EXTRACT(YEAR FROM m.fecha_movimiento),
             EXTRACT(MONTH FROM m.fecha_movimiento),
             m.tipo
    ORDER BY year, month
  `;

  const flow = new Map<number, { year: number; month: number; ingresos: number; egresos: number }>();
  for (const row of rows) {
    const key = row.year * 100 + row.month;
    let entry = flow.get(key);
    if (!entry) {
      entry = { year: row.year, month: row.month, ingresos: 0, egresos: 0 };
      flow.set(key, entry);
    }
    // Cualquier tipo distinto de "ingreso" cae en egresos, como Python.
    if (row.tipo === 'ingreso') {
      entry.ingresos = Number(row.total);
    } else {
      entry.egresos = Number(row.total);
    }
  }

  let points = [...flow.values()].sort((a, b) => a.year - b.year || a.month - b.month);
  if (!dateFrom && !dateTo) points = points.slice(-6);

  return points.map((point) => ({
    month: `${MONTH_NAMES_ES[point.month - 1]} ${point.year}`,
    ingresos: point.ingresos,
    egresos: point.egresos,
  }));
}

export async function getPortfolioByCurrency(
  sql: Sql,
  userId: string,
  dateFrom: string | null = null,
  dateTo: string | null = null,
): Promise<PortfolioPoint[]> {
  const rows = await sql<(MonthTotalRow & { moneda: string | null })[]>`
    SELECT EXTRACT(YEAR FROM m.fecha_movimiento)::int AS year,
           EXTRACT(MONTH FROM m.fecha_movimiento)::int AS month,
           m.moneda,
           COALESCE(SUM(m.cantidad), 0)::text AS total
    FROM movimientos_financieros m
    WHERE m.usuario_id = ${userId}::uuid
      AND m.tipo = 'egreso'
      AND m.anulado_en IS NULL
      ${dateFilters(sql, dateFrom, dateTo)}
    GROUP BY EXTRACT(YEAR FROM m.fecha_movimiento),
             EXTRACT(MONTH FROM m.fecha_movimiento),
             m.moneda
    ORDER BY year, month
  `;

  const portfolio = new Map<number, { year: number; month: number; ARS: number; USD: number }>();
  for (const row of rows) {
    const key = row.year * 100 + row.month;
    let entry = portfolio.get(key);
    if (!entry) {
      entry = { year: row.year, month: row.month, ARS: 0, USD: 0 };
      portfolio.set(key, entry);
    }
    const moneda = (row.moneda || 'ARS').toUpperCase();
    const amount = Number(row.total);
    if (moneda === 'USD') {
      entry.USD += amount * USD_TO_ARS_RATE;
    } else {
      entry.ARS += amount;
    }
  }

  let points = [...portfolio.values()].sort((a, b) => a.year - b.year || a.month - b.month);
  if (!dateFrom && !dateTo) points = points.slice(-6);

  return points.map((point) => ({
    month: `${MONTH_NAMES_ES[point.month - 1]} ${point.year}`,
    ARS: point.ARS,
    USD: point.USD,
  }));
}

// TODO: Implementar racha real (paridad con el placeholder de Python).
export function getDiasRacha(): number {
  return 0;
}
