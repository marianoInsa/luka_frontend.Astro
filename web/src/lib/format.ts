import { pythonRound } from './dashboard';

// Espejos de los formatos de Jinja usados por los templates del dashboard:
//   "{:,.0f}"  → formatInt        (agrupación de miles, half-even)
//   "%.0f"     → formatPlainInt   (sin separadores, half-even)
//   "{:,.2f}"  → formatDecimals   (agrupación de miles, 2 decimales)

function groupThousands(text: string): string {
  return text.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
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
  return `${sign}${groupThousands(Math.abs(value).toFixed(digits))}`;
}
