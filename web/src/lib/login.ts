import type { Sql } from './db';
import { envValue } from './env';
import { hashToken } from './onboarding';

interface LinkRow {
  estado: string;
  expira_en: Date | string;
  usuario_id: string;
}

// Espejo de app/auth.py:consume_dashboard_login_token. Devuelve el auth_user_id
// vinculado o null; nunca distingue los casos de rechazo.
export async function consumeDashboardLoginToken(
  sql: Sql,
  token: unknown,
  now: Date = new Date(),
): Promise<string | null> {
  if (typeof token !== 'string' || !token) return null;

  let tokenHash: string;
  try {
    tokenHash = await hashToken(token);
  } catch {
    // hashToken lanza RangeError si el token supera MAX_TOKEN_LENGTH.
    return null;
  }

  try {
    return await sql.begin(async (tx): Promise<string | null> => {
      const links = await tx<LinkRow[]>`
        SELECT estado, expira_en, usuario_id
        FROM dashboard_login_link
        WHERE token_hash = ${tokenHash}
        FOR UPDATE
      `;
      const link = links[0];
      if (!link || link.estado !== 'pendiente') return null;

      const expiresAt = link.expira_en instanceof Date ? link.expira_en : new Date(link.expira_en);
      if (expiresAt <= now) {
        // Python persiste "vencido" vía ORM (el onupdate toca actualizado_en).
        await tx`
          UPDATE dashboard_login_link
          SET estado = 'vencido', actualizado_en = ${now}
          WHERE token_hash = ${tokenHash}
        `;
        return null;
      }

      const users = await tx<{ auth_user_id: string | null }[]>`
        SELECT auth_user_id FROM usuario WHERE id = ${link.usuario_id}::uuid
      `;
      const user = users[0];
      // Sin auth_user_id la fila queda pendiente (Python no la toca).
      if (!user || user.auth_user_id === null) return null;

      await tx`
        UPDATE dashboard_login_link
        SET estado = 'consumido',
            consumido_en = ${now},
            actualizado_en = ${now}
        WHERE token_hash = ${tokenHash}
      `;
      return user.auth_user_id;
    });
  } catch {
    // Cualquier error de DB → rechazo opaco (sql.begin hace rollback).
    return null;
  }
}

// Espejo de auth.py:mock_auth_enabled.
export function mockAuthEnabled(): boolean {
  const appEnv = (envValue('APP_ENV') ?? 'development').trim().toLowerCase();
  const enabled = (envValue('ENABLE_MOCK_AUTH') ?? 'true').trim().toLowerCase() === 'true';
  return appEnv === 'development' && enabled;
}

export function getMockAuthUserId(): string {
  return envValue('MOCK_AUTH_USER_ID') || '00000000-0000-0000-0000-000000000001';
}
