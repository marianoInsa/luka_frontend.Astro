import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDb, getDb, type Sql } from './db';
import { consumeDashboardLoginToken } from './login';
import { hashToken } from './onboarding';

// Guarded integration test: hits the real Postgres. Skipped unless explicitly
// opted in, so `npm test` (and CI) stays hermetic.
const RUN = process.env.RUN_DB_INTEGRATION === '1';

describe.skipIf(!RUN)('consumeDashboardLoginToken (Postgres integration)', () => {
  const suffix = randomUUID();
  const authUserId = randomUUID();
  const userId = randomUUID();
  const email = `login-int-${suffix}@example.com`;

  const otherAuthUserId = randomUUID();
  const otherUserId = randomUUID();
  const otherEmail = `login-int-other-${suffix}@example.com`;

  // El índice dashboard_login_link_usuario_pendiente_uidx permite un solo link
  // pendiente por usuario, así que el token vencido vive en su propio usuario.
  const expiredAuthUserId = randomUUID();
  const expiredUserId = randomUUID();
  const expiredEmail = `login-int-expired-${suffix}@example.com`;

  const unlinkedUserId = randomUUID();
  const unlinkedEmail = `login-int-unlinked-${suffix}@example.com`;

  const validToken = `valid-${suffix}`;
  const expiredToken = `expired-${suffix}`;
  const consumedToken = `consumed-${suffix}`;
  const unlinkedToken = `unlinked-${suffix}`;
  const otherToken = `other-${suffix}`;

  let sql: Sql | undefined;

  function db(): Sql {
    if (!sql) throw new Error('integration DB client not initialized');
    return sql;
  }

  async function linkRows(token: string) {
    return db()<
      { estado: string; consumido_en: Date | null; actualizado_en: Date | null }[]
    >`
      SELECT estado, consumido_en, actualizado_en
      FROM dashboard_login_link
      WHERE token_hash = ${await hashToken(token)}
    `;
  }

  beforeAll(async () => {
    sql = getDb();
    const now = new Date();
    const past = new Date(now.getTime() - 60 * 60 * 1000);
    const future = new Date(now.getTime() + 60 * 60 * 1000);

    // usuario.auth_user_id tiene FK real a auth.users(id) en esta DB.
    await db()`
      INSERT INTO auth.users (id, email, created_at, updated_at)
      VALUES (${authUserId}::uuid, ${email}, ${now}, ${now})
    `;
    await db()`
      INSERT INTO auth.users (id, email, created_at, updated_at)
      VALUES (${otherAuthUserId}::uuid, ${otherEmail}, ${now}, ${now})
    `;
    await db()`
      INSERT INTO auth.users (id, email, created_at, updated_at)
      VALUES (${expiredAuthUserId}::uuid, ${expiredEmail}, ${now}, ${now})
    `;
    await db()`
      INSERT INTO usuario (id, nombre, email, auth_user_id, whatsapp_id, creado_en, actualizado_en)
      VALUES (${userId}::uuid, 'Login Int', ${email}, ${authUserId}::uuid, NULL, ${now}, ${now})
    `;
    await db()`
      INSERT INTO usuario (id, nombre, email, auth_user_id, whatsapp_id, creado_en, actualizado_en)
      VALUES (${otherUserId}::uuid, 'Login Int Otro', ${otherEmail}, ${otherAuthUserId}::uuid, NULL, ${now}, ${now})
    `;
    await db()`
      INSERT INTO usuario (id, nombre, email, auth_user_id, whatsapp_id, creado_en, actualizado_en)
      VALUES (${expiredUserId}::uuid, 'Login Int Vencido', ${expiredEmail}, ${expiredAuthUserId}::uuid, NULL, ${now}, ${now})
    `;
    await db()`
      INSERT INTO usuario (id, nombre, email, auth_user_id, whatsapp_id, creado_en, actualizado_en)
      VALUES (${unlinkedUserId}::uuid, 'Login Int Sin Link', ${unlinkedEmail}, NULL, NULL, ${now}, ${now})
    `;

    const insertLink = async (
      token: string,
      targetUserId: string,
      estado: string,
      createdAt: Date,
      expiresAt: Date,
      consumedAt: Date | null,
    ) => {
      await db()`
        INSERT INTO dashboard_login_link
          (id, usuario_id, token_hash, estado, expira_en, reenvios, consumido_en, creado_en, actualizado_en)
        VALUES
          (${randomUUID()}::uuid, ${targetUserId}::uuid, ${await hashToken(token)}, ${estado},
           ${expiresAt}, 0, ${consumedAt}, ${createdAt}, ${createdAt})
      `;
    };

    // El check dashboard_login_link_expiracion_check exige expira_en > creado_en.
    const pastCreated = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    await insertLink(validToken, userId, 'pendiente', now, future, null);
    await insertLink(expiredToken, expiredUserId, 'pendiente', pastCreated, past, null);
    await insertLink(consumedToken, userId, 'consumido', now, future, now);
    await insertLink(unlinkedToken, unlinkedUserId, 'pendiente', now, future, null);
    await insertLink(otherToken, otherUserId, 'pendiente', now, future, null);
  });

  afterAll(async () => {
    if (sql) {
      try {
        await sql`DELETE FROM dashboard_login_link WHERE usuario_id = ${userId}::uuid OR usuario_id = ${otherUserId}::uuid OR usuario_id = ${expiredUserId}::uuid OR usuario_id = ${unlinkedUserId}::uuid`;
        await sql`DELETE FROM usuario WHERE id = ${userId}::uuid OR id = ${otherUserId}::uuid OR id = ${expiredUserId}::uuid OR id = ${unlinkedUserId}::uuid`;
        await sql`DELETE FROM auth.users WHERE id = ${authUserId}::uuid OR id = ${otherAuthUserId}::uuid OR id = ${expiredAuthUserId}::uuid`;
      } catch {
        // ponytail: best-effort cleanup; the post-run verification query is the real check
      }
    }
    await closeDb();
  });

  it('consume el token válido y marca la fila como consumida', async () => {
    await expect(consumeDashboardLoginToken(db(), validToken)).resolves.toBe(authUserId);

    const rows = await linkRows(validToken);
    expect(rows[0].estado).toBe('consumido');
    expect(rows[0].consumido_en).not.toBeNull();
    expect(rows[0].actualizado_en).not.toBeNull();
  });

  it('no permite reusar un token ya consumido', async () => {
    await expect(consumeDashboardLoginToken(db(), validToken)).resolves.toBeNull();
    await expect(consumeDashboardLoginToken(db(), consumedToken)).resolves.toBeNull();
  });

  it('marca vencido y rechaza un token expirado', async () => {
    await expect(consumeDashboardLoginToken(db(), expiredToken)).resolves.toBeNull();

    const rows = await linkRows(expiredToken);
    expect(rows[0].estado).toBe('vencido');
    expect(rows[0].actualizado_en).not.toBeNull();
  });

  it('rechaza un token desconocido', async () => {
    await expect(consumeDashboardLoginToken(db(), `desconocido-${suffix}`)).resolves.toBeNull();
  });

  it('rechaza un usuario sin auth_user_id y deja la fila pendiente', async () => {
    await expect(consumeDashboardLoginToken(db(), unlinkedToken)).resolves.toBeNull();

    const rows = await linkRows(unlinkedToken);
    expect(rows[0].estado).toBe('pendiente');
    expect(rows[0].consumido_en).toBeNull();
  });

  it('devuelve la identidad del dueño del token, no otra', async () => {
    await expect(consumeDashboardLoginToken(db(), otherToken)).resolves.toBe(otherAuthUserId);
  });

  it('rechaza tokens que no son string, vacíos o demasiado largos', async () => {
    await expect(consumeDashboardLoginToken(db(), null)).resolves.toBeNull();
    await expect(consumeDashboardLoginToken(db(), undefined)).resolves.toBeNull();
    await expect(consumeDashboardLoginToken(db(), '')).resolves.toBeNull();
    await expect(consumeDashboardLoginToken(db(), 12345)).resolves.toBeNull();
    await expect(consumeDashboardLoginToken(db(), 'x'.repeat(4097))).resolves.toBeNull();
  });
});
