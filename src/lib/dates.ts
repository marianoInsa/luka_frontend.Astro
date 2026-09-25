const DATE_PARAM = /^\d{4}-\d{2}-\d{2}$/;

// Espejo de date.fromisoformat: solo YYYY-MM-DD con fecha real de calendario.
// 2026-02-30, 2026-02-29 (no bisiesto) y 2026-8-1 son inválidos.
export function isValidDateParam(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_PARAM.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  // ponytail: Date.UTC mapea años 00xx a 19xx y por eso se rechazan; irrelevante
  // para fechas de un dashboard.
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

// Fecha local del server en YYYY-MM-DD (paridad con date.today()).
export function todayLocal(now: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// Espejo de _get_default_dates: valida cada fecha por separado (inválida → null,
// la otra se conserva); si ambas quedan null, mes en curso.
export function defaultDateRange(
  dateFrom: string | null | undefined,
  dateTo: string | null | undefined,
  today: string = todayLocal(),
): { from: string | null; to: string | null } {
  const from = isValidDateParam(dateFrom) ? dateFrom : null;
  const to = isValidDateParam(dateTo) ? dateTo : null;
  if (from === null && to === null) {
    return { from: `${today.slice(0, 8)}01`, to: today };
  }
  return { from, to };
}
