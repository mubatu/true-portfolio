import { isAuthError } from '@supabase/supabase-js';

/** Supabase auth error codes with their own message under ``auth.errors.<code>``. */
const TRANSLATED = new Set([
  'invalid_credentials',
  'email_not_confirmed',
  'user_already_exists',
  'email_exists',
  'weak_password',
  'same_password',
  'email_address_invalid',
  'signup_disabled',
  'over_request_rate_limit',
  'over_email_send_rate_limit',
  'reauthentication_needed',
  'session_expired',
  'session_not_found',
]);

/**
 * i18n key for an error from Supabase auth, so its English message is
 * never shown as is; ``fallback`` for anything without its own text.
 */
export function authErrorKey(error: unknown, fallback: string): string {
  if (isAuthError(error)) {
    if (error.code && TRANSLATED.has(error.code)) return `auth.errors.${error.code}`;
    if (error.name === 'AuthRetryableFetchError') return 'auth.errors.network';
    // Older servers send no code for a wrong password.
    if (/invalid login credentials/i.test(error.message)) return 'auth.errors.invalid_credentials';
  }
  return fallback;
}
