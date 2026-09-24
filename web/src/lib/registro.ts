import tokensCss from '../../../docs/marca/tokens/tokens.css?raw';
import registroCss from '../styles/registro.css?raw';

import type { RegistrationValidation } from './onboarding';

export const REGISTRO_NOINDEX = 'noindex, nofollow';

export type RegistroState =
  | 'invalid'
  | 'consumed'
  | 'expired'
  | 'terms_unavailable'
  | 'configuration_error'
  | 'error';

export type RegistroValidation = RegistrationValidation | { status: 'configuration_error' };

export interface RegistroFormView {
  kind: 'form';
  eyebrow: string;
  heading: string;
  intro: string;
  version: string;
  effectiveFrom: string | null;
  content: string;
  checkboxLabel: string;
  buttonLabel: string;
}

export interface RegistroStateView {
  kind: 'state';
  heading: string;
  message: string;
}

export type RegistroView = RegistroFormView | RegistroStateView;

const STATE_COPY: Record<RegistroState, { heading: string; message: string }> = {
  invalid: {
    heading: 'Enlace inválido',
    message: 'Este enlace de registro no es válido. Solicitá uno nuevo desde WhatsApp.',
  },
  consumed: {
    heading: 'Enlace ya utilizado',
    message: 'Este enlace ya fue utilizado. Iniciá sesión para continuar.',
  },
  expired: {
    heading: 'Enlace vencido',
    message: 'Este enlace venció. Escribile nuevamente a Luka para recibir otro.',
  },
  terms_unavailable: {
    heading: 'Registro temporalmente no disponible',
    message:
      'El registro no está disponible temporalmente porque los términos todavía no fueron publicados.',
  },
  configuration_error: {
    heading: 'Registro temporalmente no disponible',
    message: 'La autenticación no está disponible temporalmente. Intentá nuevamente más tarde.',
  },
  error: {
    heading: 'No pudimos verificar el enlace',
    message: 'No pudimos verificar el enlace. Intentá nuevamente en unos minutos.',
  },
};

export const AUTH_ERROR_MESSAGES = {
  sessionExpired: 'Tu sesión de registro venció. Volvé a abrir el enlace de WhatsApp.',
  termsRequired: 'Debés aceptar los términos y la política de privacidad para continuar.',
  invitationExpired:
    'El enlace venció antes de iniciar Google. Solicitá uno nuevo por WhatsApp.',
  termsChanged:
    'Los términos cambiaron. Volvé a abrir el enlace de registro para revisarlos.',
  invalidRegistration: 'No pudimos validar tu registro. Solicitá un nuevo enlace por WhatsApp.',
  unavailable: 'La autenticación no está disponible temporalmente. Intentá más tarde.',
  googleFailed: 'No pudimos iniciar Google. Intentá nuevamente en unos minutos.',
} as const;

export function registroStateView(status: RegistroState): RegistroStateView {
  const copy = STATE_COPY[status];
  return { kind: 'state', heading: copy.heading, message: copy.message };
}

export function formatEffectiveFrom(value: Date | null): string | null {
  if (!value) return null;
  const day = String(value.getUTCDate()).padStart(2, '0');
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${value.getUTCFullYear()}`;
}

export function registroView(registration: RegistroValidation): RegistroView {
  if (registration.status !== 'valid') {
    return registroStateView(registration.status);
  }
  return {
    kind: 'form',
    eyebrow: 'Creá tu acceso seguro',
    heading: 'Registrá tu cuenta',
    intro: 'Vamos a vincular tu cuenta con el WhatsApp desde el cual recibiste este enlace.',
    version: registration.version,
    effectiveFrom: formatEffectiveFrom(registration.effectiveFrom),
    content: registration.content,
    checkboxLabel: 'Leí y acepto los términos y la política de privacidad.',
    buttonLabel: 'Continuar con Google',
  };
}

export function isTermsAccepted(value: unknown): boolean {
  return value === 'accepted';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderAuthErrorPage(message: string): string {
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="${REGISTRO_NOINDEX}" />
    <title>LUKA · Autenticación</title>
    <style>${tokensCss}
${registroCss}</style>
  </head>
  <body class="registration-body">
    <main class="registration-container">
      <section class="registration-card" aria-labelledby="auth-error-title">
        <header class="registration-brand">
          <img class="registration-logo" src="/logo-luka.svg" alt="" width="44" height="39" />
          <span class="registration-brand-name">LUKA</span>
        </header>
        <div class="registration-state" role="alert">
          <div class="registration-state-icon" aria-hidden="true">!</div>
          <h1 id="auth-error-title">No pudimos continuar</h1>
          <p>${escapeHtml(message)}</p>
          <button class="google-button registration-back" type="button" onclick="history.back()">
            Volver e intentar nuevamente
          </button>
        </div>
      </section>
    </main>
  </body>
</html>`;
}
