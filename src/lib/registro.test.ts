import { describe, expect, it } from 'vitest';

import type { Sql } from './db';
import { hashToken, validateRegistrationToken } from './onboarding';
import {
  AUTH_ERROR_MESSAGES,
  REGISTRO_NOINDEX,
  isTermsAccepted,
  registroStateView,
  registroView,
  renderAuthErrorPage,
  type RegistroState,
} from './registro';

const TOKEN = 'token-secreto-de-prueba';
const PHONE = '5491199998888';
const INVITATION_ID = '76aecc76-0e88-4bae-a08f-c3c3297ed20a';
const AGREEMENT_ID = '1b6f0d5e-7a2c-4a1d-9c3e-5f8a2b7d4c10';

interface InvitationRow {
  id: string;
  whatsapp_id: string;
  estado: string;
  expira_en: Date;
  usuario_id: string | null;
  consumida_en: Date | null;
  revocada_en: Date | null;
}

function invitation(overrides: Partial<InvitationRow> = {}): InvitationRow {
  return {
    id: INVITATION_ID,
    whatsapp_id: PHONE,
    estado: 'pendiente',
    expira_en: new Date(Date.now() + 60 * 60 * 1000),
    usuario_id: null,
    consumida_en: null,
    revocada_en: null,
    ...overrides,
  };
}

const agreement = {
  id: AGREEMENT_ID,
  version: '2026-07',
  contenido: 'Términos completos y política de privacidad de prueba.',
  vigente_desde: new Date('2026-07-01T00:00:00Z'),
};

interface FakeQuery {
  text: string;
  values: unknown[];
}

function fakeSql(handler: (query: FakeQuery) => unknown[]): {
  sql: Sql;
  queries: FakeQuery[];
} {
  const queries: FakeQuery[] = [];
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    const query = { text: strings.join('$'), values };
    queries.push(query);
    return Promise.resolve(handler(query));
  }) as unknown as Sql;
  return { sql, queries };
}

function registrationSql(options: {
  invitation?: InvitationRow | null;
  agreement?: typeof agreement | null;
  fail?: boolean;
}) {
  return fakeSql((query) => {
    if (options.fail) throw new Error('database down');
    if (query.text.includes('FROM onboarding_invitacion')) {
      return options.invitation ? [options.invitation] : [];
    }
    if (query.text.includes('FROM acuerdo_version')) {
      return options.agreement ? [options.agreement] : [];
    }
    throw new Error(`unexpected query: ${query.text}`);
  });
}

const EXPECTED_STATES: Array<[RegistroState, string, string]> = [
  [
    'invalid',
    'Enlace inválido',
    'Este enlace de registro no es válido. Solicitá uno nuevo desde WhatsApp.',
  ],
  [
    'consumed',
    'Enlace ya utilizado',
    'Este enlace ya fue utilizado. Iniciá sesión para continuar.',
  ],
  [
    'expired',
    'Enlace vencido',
    'Este enlace venció. Escribile nuevamente a Luka para recibir otro.',
  ],
  [
    'terms_unavailable',
    'Registro temporalmente no disponible',
    'El registro no está disponible temporalmente porque los términos todavía no fueron publicados.',
  ],
  [
    'configuration_error',
    'Registro temporalmente no disponible',
    'La autenticación no está disponible temporalmente. Intentá nuevamente más tarde.',
  ],
  [
    'error',
    'No pudimos verificar el enlace',
    'No pudimos verificar el enlace. Intentá nuevamente en unos minutos.',
  ],
];

describe('registroStateView', () => {
  it.each(EXPECTED_STATES)('maps %s to the Python copy', (status, heading, message) => {
    expect(registroStateView(status)).toEqual({ kind: 'state', heading, message });
  });
});

describe('registroView', () => {
  it('renders the agreement form for a pending invitation and hashes the token', async () => {
    const { sql, queries } = registrationSql({ invitation: invitation(), agreement });
    const result = await validateRegistrationToken(sql, TOKEN);

    expect(result.status).toBe('valid');
    const view = registroView(result);
    expect(view.kind).toBe('form');
    if (view.kind !== 'form') throw new Error('unreachable');
    expect(view.heading).toBe('Registrá tu cuenta');
    expect(view.version).toBe('2026-07');
    expect(view.content).toBe(agreement.contenido);
    expect(view.effectiveFrom).toBe('01/07/2026');
    expect(queries[0]?.values).toContain(await hashToken(TOKEN));
  });

  it('maps a consumed invitation', async () => {
    const { sql } = registrationSql({ invitation: invitation({ estado: 'consumida' }) });
    const result = await validateRegistrationToken(sql, TOKEN);
    expect(registroView(result)).toEqual(registroStateView('consumed'));
  });

  it('maps an expired pending invitation', async () => {
    const { sql } = registrationSql({
      invitation: invitation({ expira_en: new Date(Date.now() - 1000) }),
    });
    const result = await validateRegistrationToken(sql, TOKEN);
    expect(registroView(result)).toEqual(registroStateView('expired'));
  });

  it('maps terms_unavailable when there is no current agreement', async () => {
    const { sql } = registrationSql({ invitation: invitation(), agreement: null });
    const result = await validateRegistrationToken(sql, TOKEN);
    expect(registroView(result)).toEqual(registroStateView('terms_unavailable'));
  });

  it('maps a database failure to error without leaking details', async () => {
    const { sql } = registrationSql({ fail: true });
    const result = await validateRegistrationToken(sql, TOKEN);
    expect(registroView(result)).toEqual(registroStateView('error'));
  });

  it('never renders the token, its hash or the phone number', async () => {
    const hash = await hashToken(TOKEN);
    const { sql } = registrationSql({ invitation: invitation(), agreement });
    const rendered = JSON.stringify(registroView(await validateRegistrationToken(sql, TOKEN)));

    expect(rendered).not.toContain(TOKEN);
    expect(rendered).not.toContain(hash);
    expect(rendered).not.toContain(PHONE);

    const { sql: failingSql } = registrationSql({ fail: true });
    const errorView = JSON.stringify(registroView(await validateRegistrationToken(failingSql, TOKEN)));
    expect(errorView).not.toContain(TOKEN);
    expect(errorView).not.toContain(PHONE);
  });
});

describe('terms gate', () => {
  it('accepts only the exact "accepted" value', () => {
    expect(isTermsAccepted('accepted')).toBe(true);
    expect(isTermsAccepted('on')).toBe(false);
    expect(isTermsAccepted('')).toBe(false);
    expect(isTermsAccepted(null)).toBe(false);
    expect(isTermsAccepted(undefined)).toBe(false);
    expect(isTermsAccepted(['accepted'])).toBe(false);
  });
});

describe('noindex marker', () => {
  it('marks the registration and auth error pages noindex, nofollow', () => {
    expect(REGISTRO_NOINDEX).toBe('noindex, nofollow');
    expect(renderAuthErrorPage(AUTH_ERROR_MESSAGES.termsRequired)).toContain(
      'content="noindex, nofollow"',
    );
  });
});

describe('auth error copy', () => {
  it('keeps the Python messages', () => {
    expect(AUTH_ERROR_MESSAGES).toEqual({
      sessionExpired: 'Tu sesión de registro venció. Volvé a abrir el enlace de WhatsApp.',
      termsRequired: 'Debés aceptar los términos y la política de privacidad para continuar.',
      invitationExpired: 'El enlace venció antes de iniciar Google. Solicitá uno nuevo por WhatsApp.',
      termsChanged: 'Los términos cambiaron. Volvé a abrir el enlace de registro para revisarlos.',
      invalidRegistration: 'No pudimos validar tu registro. Solicitá un nuevo enlace por WhatsApp.',
      unavailable: 'La autenticación no está disponible temporalmente. Intentá más tarde.',
      googleFailed: 'No pudimos iniciar Google. Intentá nuevamente en unos minutos.',
    });
  });

  it('escapes the message in the auth error page', () => {
    const html = renderAuthErrorPage('<script>alert(1)</script>');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
