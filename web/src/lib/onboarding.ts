import postgres from 'postgres';

import type { Sql } from './db';

export const MAX_TOKEN_LENGTH = 4096;

// Debe coincidir exactamente con DEFAULT_CATEGORIES de
// app/services/onboarding_finalization.py, incluido "Educacion" sin tilde
// (el cambio de acento es un ticket aparte).
export const DEFAULT_CATEGORIES = [
  'Servicios',
  'Comida',
  'Transporte',
  'Ocio',
  'Vivienda',
  'Salud',
  'Ingresos',
  'Educacion',
  'Ropa',
] as const;

export interface VerifiedIdentity {
  authUserId: string;
  provider: string;
  email: string;
}

export type RegistrationValidation =
  | { status: 'invalid' | 'consumed' | 'expired' | 'terms_unavailable' | 'error' }
  | {
      status: 'valid';
      invitationId: string;
      agreementVersionId: string;
      expiresAt: Date;
      version: string;
      content: string;
      effectiveFrom: Date | null;
    };

export type FinalizationStatus =
  | 'success'
  | 'invalid_identity'
  | 'invitation_not_found'
  | 'invitation_revoked'
  | 'invitation_expired'
  | 'invitation_consumed'
  | 'invitation_invalid'
  | 'agreement_not_found'
  | 'agreement_changed'
  | 'identity_conflict'
  | 'database_error';

export interface FinalizationResult {
  status: FinalizationStatus;
  userId?: string;
}

interface InvitationRow {
  id: string;
  whatsapp_id: string;
  estado: string;
  expira_en: Date;
  usuario_id: string | null;
  consumida_en: Date | null;
  revocada_en: Date | null;
}

interface CurrentAgreementRow {
  id: string;
  version: string;
  contenido: string;
  vigente_desde: Date | null;
}

interface AgreementRow extends CurrentAgreementRow {
  esta_vigente: boolean;
}

interface UserRow {
  id: string;
  nombre: string;
  email: string;
  auth_user_id: string | null;
  whatsapp_id: string | null;
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

const UUID_HEX = /^[0-9a-f]{32}$/i;

// Espejo de uuid.UUID(str(value)): acepta mayúsculas, guiones, llaves y
// prefijo urn:uuid; devuelve la forma canónica en minúsculas.
function parseUuid(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const hex = value.replace(/^urn:uuid:/i, '').replace(/[{}-]/g, '');
  if (!UUID_HEX.test(hex)) return null;
  const lower = hex.toLowerCase();
  return `${lower.slice(0, 8)}-${lower.slice(8, 12)}-${lower.slice(12, 16)}-${lower.slice(16, 20)}-${lower.slice(20)}`;
}

export async function hashToken(token: string): Promise<string> {
  if (Array.from(token).length > MAX_TOKEN_LENGTH) {
    throw new RangeError(`token exceeds MAX_TOKEN_LENGTH (${MAX_TOKEN_LENGTH})`);
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function cleanProfileText(value: unknown): string {
  if (typeof value !== 'string') return '';
  const collapsed = value
    .replace(/\p{C}/gu, ' ')
    .split(/\s+/u)
    .filter(Boolean)
    .join(' ');
  return Array.from(collapsed).slice(0, 120).join('').trim();
}

export function normalizeDisplayName(value: unknown, verifiedEmail: string): string {
  const normalized = cleanProfileText(value);
  if (normalized) return normalized;
  const localPart = verifiedEmail.trim().split('@', 1)[0];
  return cleanProfileText(localPart) || 'Usuario Luka';
}

export function parseIdentity(
  identity: VerifiedIdentity,
): { authUserId: string; email: string } | null {
  if (identity.provider !== 'google') return null;
  const authUserId = parseUuid(identity.authUserId);
  if (!authUserId) return null;

  const email = typeof identity.email === 'string' ? identity.email.trim().toLowerCase() : '';
  if (!email || email.length > 320 || email.split('@').length !== 2 || /[\r\n\0]/.test(email)) {
    return null;
  }
  const [localPart, domain] = email.split('@');
  if (!localPart || !domain) return null;
  return { authUserId, email };
}

function rejectionFor(
  invitation: InvitationRow | undefined,
  now: Date,
): { status: 'invalid' | 'consumed' | 'expired' } | null {
  if (!invitation || invitation.estado === 'revocada') return { status: 'invalid' };
  if (invitation.estado === 'consumida') return { status: 'consumed' };
  if (invitation.estado === 'vencida') return { status: 'expired' };
  if (invitation.estado !== 'pendiente') return { status: 'invalid' };
  if (toDate(invitation.expira_en) <= now) return { status: 'expired' };
  return null;
}

function validResult(
  invitation: InvitationRow,
  agreement: CurrentAgreementRow,
): RegistrationValidation {
  return {
    status: 'valid',
    invitationId: invitation.id,
    agreementVersionId: agreement.id,
    expiresAt: toDate(invitation.expira_en),
    version: agreement.version,
    content: agreement.contenido,
    effectiveFrom: agreement.vigente_desde === null ? null : toDate(agreement.vigente_desde),
  };
}

export async function validateRegistrationToken(
  sql: Sql,
  token: string | null | undefined,
  now: Date = new Date(),
): Promise<RegistrationValidation> {
  if (!token || !token.trim() || Array.from(token).length > MAX_TOKEN_LENGTH) {
    return { status: 'invalid' };
  }

  const tokenHash = await hashToken(token);
  try {
    const invitations = await sql<InvitationRow[]>`
      SELECT id, whatsapp_id, estado, expira_en, usuario_id, consumida_en, revocada_en
      FROM onboarding_invitacion
      WHERE token_hash = ${tokenHash}
    `;
    if (invitations.length > 1) return { status: 'error' };
    const rejection = rejectionFor(invitations[0], now);
    if (rejection) return rejection;

    const agreements = await sql<CurrentAgreementRow[]>`
      SELECT id, version, contenido, vigente_desde
      FROM acuerdo_version
      WHERE esta_vigente = true
    `;
    if (agreements.length > 1) return { status: 'error' };
    const agreement = agreements[0];
    if (!agreement) return { status: 'terms_unavailable' };

    return validResult(invitations[0], agreement);
  } catch {
    return { status: 'error' };
  }
}

export async function validateRegistrationContext(
  sql: Sql,
  invitationId: string,
  agreementVersionId: string,
  now: Date = new Date(),
): Promise<RegistrationValidation> {
  const parsedInvitationId = parseUuid(invitationId);
  const parsedAgreementId = parseUuid(agreementVersionId);
  if (!parsedInvitationId || !parsedAgreementId) return { status: 'invalid' };

  try {
    const invitations = await sql<InvitationRow[]>`
      SELECT id, whatsapp_id, estado, expira_en, usuario_id, consumida_en, revocada_en
      FROM onboarding_invitacion
      WHERE id = ${parsedInvitationId}::uuid
    `;
    const rejection = rejectionFor(invitations[0], now);
    if (rejection) return rejection;

    const agreements = await sql<CurrentAgreementRow[]>`
      SELECT id, version, contenido, vigente_desde
      FROM acuerdo_version
      WHERE id = ${parsedAgreementId}::uuid AND esta_vigente = true
    `;
    const agreement = agreements[0];
    if (!agreement) return { status: 'terms_unavailable' };

    return validResult(invitations[0], agreement);
  } catch {
    return { status: 'error' };
  }
}

export async function finalizeOnboarding(
  sql: Sql,
  invitationId: unknown,
  agreementVersionId: unknown,
  identity: VerifiedIdentity,
  displayName: unknown,
  now: Date = new Date(),
): Promise<FinalizationResult> {
  const parsedInvitationId = parseUuid(invitationId);
  const parsedAgreementId = parseUuid(agreementVersionId);
  if (!parsedInvitationId || !parsedAgreementId) return { status: 'invitation_not_found' };

  const parsedIdentity = parseIdentity(identity);
  if (!parsedIdentity) return { status: 'invalid_identity' };
  const { authUserId, email } = parsedIdentity;
  const normalizedName = normalizeDisplayName(displayName, email);

  try {
    return await sql.begin(async (tx): Promise<FinalizationResult> => {
      const invitations = await tx<InvitationRow[]>`
        SELECT id, whatsapp_id, estado, expira_en, usuario_id, consumida_en, revocada_en
        FROM onboarding_invitacion
        WHERE id = ${parsedInvitationId}::uuid
        FOR UPDATE
      `;
      const invitation = invitations[0];
      if (!invitation) return { status: 'invitation_not_found' };
      if (invitation.estado === 'revocada' || invitation.revocada_en !== null) {
        return { status: 'invitation_revoked' };
      }
      if (invitation.estado === 'consumida') return { status: 'invitation_consumed' };
      if (invitation.estado === 'vencida') return { status: 'invitation_expired' };
      if (invitation.estado !== 'pendiente') return { status: 'invitation_invalid' };
      if (invitation.usuario_id !== null || invitation.consumida_en !== null) {
        return { status: 'invitation_invalid' };
      }
      if (toDate(invitation.expira_en) <= now) return { status: 'invitation_expired' };

      const agreements = await tx<AgreementRow[]>`
        SELECT id, version, contenido, esta_vigente, vigente_desde
        FROM acuerdo_version
        WHERE id = ${parsedAgreementId}::uuid
        FOR UPDATE
      `;
      const agreement = agreements[0];
      if (!agreement) return { status: 'agreement_not_found' };
      if (!agreement.esta_vigente || agreement.vigente_desde === null) {
        return { status: 'agreement_changed' };
      }

      const candidates = await tx<UserRow[]>`
        SELECT id, nombre, email, auth_user_id, whatsapp_id
        FROM usuario
        WHERE auth_user_id = ${authUserId}::uuid
           OR lower(email) = ${email}
           OR whatsapp_id = ${invitation.whatsapp_id}
        FOR UPDATE
      `;
      if (candidates.length > 1) return { status: 'identity_conflict' };

      let userId: string;
      const candidate = candidates[0];
      if (!candidate) {
        userId = crypto.randomUUID();
        await tx`
          INSERT INTO usuario (id, nombre, email, auth_user_id, whatsapp_id, creado_en, actualizado_en)
          VALUES (${userId}::uuid, ${normalizedName}, ${email}, ${authUserId}::uuid, ${invitation.whatsapp_id}, ${now}, ${now})
        `;
      } else {
        const compatible =
          (candidate.auth_user_id === null ||
            candidate.auth_user_id.toLowerCase() === authUserId) &&
          (candidate.whatsapp_id === null || candidate.whatsapp_id === invitation.whatsapp_id) &&
          candidate.email.trim().toLowerCase() === email;
        if (!compatible) return { status: 'identity_conflict' };

        userId = candidate.id;
        await tx`
          UPDATE usuario
          SET auth_user_id = ${authUserId}::uuid,
              whatsapp_id = ${invitation.whatsapp_id},
              email = ${email},
              nombre = ${normalizedName},
              actualizado_en = ${now}
          WHERE id = ${userId}::uuid
        `;
      }

      const acceptances = await tx<{ id: string }[]>`
        SELECT id FROM acuerdo_aceptado
        WHERE usuario_id = ${userId}::uuid AND version_acuerdo_id = ${parsedAgreementId}::uuid
        FOR UPDATE
      `;
      if (!acceptances[0]) {
        await tx`
          INSERT INTO acuerdo_aceptado (id, usuario_id, version_acuerdo_id, aceptado_en, origen)
          VALUES (${crypto.randomUUID()}::uuid, ${userId}::uuid, ${parsedAgreementId}::uuid, ${now}, 'web_onboarding')
        `;
      }

      const activeCategories = await tx<{ id: string }[]>`
        SELECT id FROM categorias
        WHERE usuario_id = ${userId}::uuid AND esta_eliminado = false
        LIMIT 1
      `;
      if (!activeCategories[0]) {
        for (const nombre of DEFAULT_CATEGORIES) {
          await tx`
            INSERT INTO categorias (id, usuario_id, nombre, es_default, esta_eliminado, creado_en)
            VALUES (${crypto.randomUUID()}::uuid, ${userId}::uuid, ${nombre}, true, false, ${now})
          `;
        }
      }

      await tx`
        UPDATE onboarding_invitacion
        SET estado = 'consumida',
            usuario_id = ${userId}::uuid,
            consumida_en = ${now},
            actualizado_en = ${now}
        WHERE id = ${parsedInvitationId}::uuid
      `;

      return { status: 'success', userId };
    });
  } catch (error) {
    if (error instanceof postgres.PostgresError && error.code.startsWith('23')) {
      return { status: 'identity_conflict' };
    }
    return { status: 'database_error' };
  }
}
