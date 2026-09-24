import { envValue } from './env';

// Espejo de app/services/conversation_flow_admin.py:is_flow_admin (CSV,
// case-insensitive). El panel completo se porta en F4.
export function isFlowAdmin(authUserId: string): boolean {
  const configured = envValue('FLOW_ADMIN_AUTH_USER_IDS') ?? '';
  const allowed = new Set(
    configured
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
  return allowed.size > 0 && allowed.has(authUserId.trim().toLowerCase());
}
