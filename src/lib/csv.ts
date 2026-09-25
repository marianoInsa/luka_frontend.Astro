import type { Sql } from './db';

export const CSV_HEADER = 'Fecha,Monto,Moneda,Categoria,Descripcion\r\n';

export interface CsvRecord {
  fecha: string;
  monto: string;
  moneda: string;
  categoria: string;
  descripcion: string;
}

// str(float) de Python: JS omite el ".0" de los enteros y el signo de -0.
// ponytail: para montos fuera de [1e-4, 1e16) Python usa notación exponencial
// ("1e-05") y esto no; son magnitudes imposibles para plata.
export function pythonFloatString(value: number): string {
  if (Object.is(value, -0)) return '-0.0';
  const text = String(value);
  return /[.eE]/.test(text) ? text : `${text}.0`;
}

// QUOTE_MINIMAL de Python: comillas solo si el campo contiene " , \r o \n.
export function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function csvRecordLine(record: CsvRecord): string {
  return `${[record.fecha, record.monto, record.moneda, record.categoria, record.descripcion]
    .map(csvField)
    .join(',')}\r\n`;
}

interface CsvRow {
  fecha: string;
  monto: string;
  moneda: string | null;
  categoria: string | null;
  descripcion: string | null;
  creado_en: string;
  id: string;
}

interface CsvCursor {
  fecha: string;
  creadoEn: string;
  id: string;
}

// Keyset pagination para no cargar todas las filas en memoria (Python usaba
// yield_per(100) sobre un cursor). El header sale como primer chunk.
export function createCsvStream(
  sql: Sql,
  userId: string,
  dateFrom: string | null,
  dateTo: string | null,
  batchSize = 500,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let cursor: CsvCursor | null = null;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(CSV_HEADER));
    },
    async pull(controller) {
      try {
        // ponytail: `id DESC` es desempate agregado al orden de Python para que
        // el keyset sea un orden total (fecha+creado_en pueden empatar). Y
        // `creado_en::text` evita que JS Date trunque los microsegundos del
        // timestamptz: con la precisión recortada el keyset se saltaría filas.
        const rows = await sql<CsvRow[]>`
          SELECT m.fecha_movimiento::text AS fecha,
                 m.cantidad::text AS monto,
                 m.moneda,
                 c.nombre AS categoria,
                 m.descripcion,
                 m.creado_en::text AS creado_en,
                 m.id
          FROM movimientos_financieros m
          LEFT JOIN categorias c ON c.id = m.categoria_id
          WHERE m.usuario_id = ${userId}::uuid
            AND m.anulado_en IS NULL
            ${dateFrom ? sql`AND m.fecha_movimiento >= ${dateFrom}::date` : sql``}
            ${dateTo ? sql`AND m.fecha_movimiento <= ${dateTo}::date` : sql``}
            ${
              cursor
                ? sql`AND (m.fecha_movimiento, m.creado_en, m.id) < (${cursor.fecha}::date, ${cursor.creadoEn}::timestamptz, ${cursor.id}::uuid)`
                : sql``
            }
          ORDER BY m.fecha_movimiento DESC, m.creado_en DESC, m.id DESC
          LIMIT ${batchSize}
        `;
        if (rows.length === 0) {
          controller.close();
          return;
        }
        const text = rows
          .map((row) =>
            csvRecordLine({
              fecha: row.fecha,
              monto: pythonFloatString(Number(row.monto)),
              moneda: row.moneda || 'ARS',
              categoria: row.categoria || 'Otro',
              descripcion: row.descripcion || '',
            }),
          )
          .join('');
        controller.enqueue(encoder.encode(text));
        const last = rows[rows.length - 1];
        cursor = { fecha: last.fecha, creadoEn: last.creado_en, id: last.id };
      } catch (error) {
        controller.error(error);
      }
    },
  });
}
