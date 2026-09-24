export function envValue(name: string): string | undefined {
  const meta = (import.meta as { env?: Record<string, string | undefined> }).env;
  return meta?.[name] ?? process.env[name];
}
