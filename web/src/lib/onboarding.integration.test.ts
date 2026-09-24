import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDb, getDb, type Sql } from './db';
import { DEFAULT_CATEGORIES, finalizeOnboarding, hashToken } from './onboarding';

// Guarded integration test: hits the real Postgres. Skipped unless explicitly
// opted in, so `npm test` (and CI) stays hermetic.
const RUN = process.env.RUN_DB_INTEGRATION === '1';

const DISPLAY_NAME = 'Integracion Luka';

describe.skipIf(!RUN)('finalizeOnboarding (Postgres integration)', () => {
  const suffix = randomUUID();
  const whatsappId = `test-int-${suffix}`;
  const email = `test-int-${suffix}@example.com`;
  const authUserId = randomUUID();
  const userId = randomUUID();
  const invitationId = randomUUID();

  let sql: Sql | undefined;
  let agreementId = '';

  function db(): Sql {
    if (!sql) throw new Error('integration DB client not initialized');
    return sql;
  }

  beforeAll(async () => {
    sql = getDb();

    const agreements = await db()<{ id: string }[]>`
      SELECT id FROM acuerdo_version WHERE esta_vigente = true LIMIT 1
    `;
    expect(agreements[0]).toBeDefined();
    agreementId = agreements[0].id;

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 60 * 60 * 1000);
    const tokenHash = await hashToken(randomUUID());

    // usuario.auth_user_id has a real FK to auth.users(id) in this DB, so the
    // fake identity needs a matching auth.users row.
    await db()`
      INSERT INTO auth.users (id, email, created_at, updated_at)
      VALUES (${authUserId}::uuid, ${email}, ${now}, ${now})
    `;
    await db()`
      INSERT INTO usuario (id, nombre, email, auth_user_id, whatsapp_id, creado_en, actualizado_en)
      VALUES (${userId}::uuid, ${'Usuario Previo'}, ${email}, NULL, NULL, ${now}, ${now})
    `;
    await db()`
      INSERT INTO onboarding_invitacion
        (id, whatsapp_id, token_hash, estado, expira_en, intentos, reenvios,
         usuario_id, consumida_en, revocada_en, creado_en, actualizado_en)
      VALUES
        (${invitationId}::uuid, ${whatsappId}, ${tokenHash}, 'pendiente', ${expiresAt}, 0, 0,
         NULL, NULL, NULL, ${now}, ${now})
    `;
  });

  afterAll(async () => {
    if (sql) {
      try {
        await sql`DELETE FROM acuerdo_aceptado WHERE usuario_id = ${userId}::uuid`;
        await sql`DELETE FROM categorias WHERE usuario_id = ${userId}::uuid`;
        await sql`DELETE FROM onboarding_invitacion WHERE id = ${invitationId}::uuid`;
        await sql`DELETE FROM usuario WHERE id = ${userId}::uuid`;
        await sql`DELETE FROM auth.users WHERE id = ${authUserId}::uuid`;
      } catch {
        // ponytail: best-effort cleanup; the post-run verification query is the real check
      }
    }
    await closeDb();
  });

  it('links the identity, records consent, seeds categories and consumes the invitation', async () => {
    const result = await finalizeOnboarding(
      db(),
      invitationId,
      agreementId,
      { authUserId, provider: 'google', email },
      DISPLAY_NAME,
    );
    expect(result.status).toBe('success');
    expect(result.userId).toBe(userId);

    const users = await db()<
      { nombre: string; email: string; auth_user_id: string | null; whatsapp_id: string | null }[]
    >`
      SELECT nombre, email, auth_user_id, whatsapp_id
      FROM usuario WHERE id = ${userId}::uuid
    `;
    expect(users).toHaveLength(1);
    expect(users[0].nombre).toBe(DISPLAY_NAME);
    expect(users[0].email).toBe(email);
    expect(users[0].auth_user_id).toBe(authUserId);
    expect(users[0].whatsapp_id).toBe(whatsappId);

    const acceptances = await db()<{ count: number }[]>`
      SELECT count(*)::int AS count FROM acuerdo_aceptado
      WHERE usuario_id = ${userId}::uuid AND origen = 'web_onboarding'
    `;
    expect(acceptances[0].count).toBe(1);

    const categories = await db()<
      { es_default: boolean; esta_eliminado: boolean }[]
    >`
      SELECT es_default, esta_eliminado FROM categorias WHERE usuario_id = ${userId}::uuid
    `;
    expect(categories).toHaveLength(DEFAULT_CATEGORIES.length);
    expect(categories.every((category) => category.es_default && !category.esta_eliminado)).toBe(
      true,
    );

    const invitations = await db()<
      { estado: string; consumida_en: Date | null; usuario_id: string | null }[]
    >`
      SELECT estado, consumida_en, usuario_id
      FROM onboarding_invitacion WHERE id = ${invitationId}::uuid
    `;
    expect(invitations[0].estado).toBe('consumida');
    expect(invitations[0].consumida_en).not.toBeNull();
    expect(invitations[0].usuario_id).toBe(userId);
  });

  it('rejects a double submit without adding rows', async () => {
    const result = await finalizeOnboarding(
      db(),
      invitationId,
      agreementId,
      { authUserId, provider: 'google', email },
      DISPLAY_NAME,
    );
    expect(result.status).toBe('invitation_consumed');

    const categories = await db()<{ count: number }[]>`
      SELECT count(*)::int AS count FROM categorias WHERE usuario_id = ${userId}::uuid
    `;
    expect(categories[0].count).toBe(DEFAULT_CATEGORIES.length);

    const acceptances = await db()<{ count: number }[]>`
      SELECT count(*)::int AS count FROM acuerdo_aceptado WHERE usuario_id = ${userId}::uuid
    `;
    expect(acceptances[0].count).toBe(1);
  });
});
