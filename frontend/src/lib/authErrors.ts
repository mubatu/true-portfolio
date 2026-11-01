import { isAuthError } from '@supabase/supabase-js';

/** Supabase auth error codes with their own message under ``auth.errors.<code>``. */
const TRANSLATED = new Set([
  'provider_disabled',
  'signup_disabled',
  'user_banned',
  'over_request_rate_limit',
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
  }
  return fallback;
}
