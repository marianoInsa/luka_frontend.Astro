import { pythonRound } from './dashboard';

// Formato es-AR del dashboard:
//   formatInt      → miles con `.`, sin decimales (half-even)
//   formatPlainInt → sin separadores (half-even)
//   formatDecimals → miles con `.`, decimales con `,`

function groupThousands(text: string): string {
  return text.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function formatInt(value: number): string {
  const rounded = pythonRound(value);
  const sign = rounded < 0 ? '-' : '';
  return `${sign}${groupThousands(String(Math.abs(rounded)))}`;
}

export function formatPlainInt(value: number): string {
  return String(pythonRound(value));
}

export function formatDecimals(value: number, digits = 2): string {
  const sign = value < 0 ? '-' : '';
  const [entero, decimales] = Math.abs(value).toFixed(digits).split('.');
  return `${sign}${groupThousands(entero)}${decimales ? `,${decimales}` : ''}`;
}
