/**
 * Acceso único a variables de entorno del server.
 *
 * En dev, Vite reemplaza `import.meta.env` por un snapshot literal del módulo
 * (y las server-only no llegan ahí), así que lo primero es `process.env` con
 * una clave dinámica que Vite no puede reemplazar (`process.env[name]`); los
 * procesos de producción cargan esas variables en `process.env` al arrancar.
 * `import.meta.env` queda como fallback para las `PUBLIC_*` (también las ve el
 * cliente, donde `process` no existe).
 */
export function envValue(name: string): string | undefined {
  if (typeof process !== 'undefined' && process.env) {
    const fromProcess = process.env[name];
    if (fromProcess !== undefined) return fromProcess;
  }

  const meta = (import.meta as { env?: Record<string, string | undefined> }).env;
  return meta?.[name];
}
