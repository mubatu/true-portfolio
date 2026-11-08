import { createClient, processLock } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

/**
 * Every Supabase call (auth, and PostgREST through its token lookup) waits on
 * one auth lock, and the client gives up after 10 s with an AbortError ("The
 * operation was aborted."). Two things could hold that lock indefinitely:
 * - the default Navigator LockManager lock is shared by every tab of the site,
 *   so a frozen or suspended background tab blocked the active one;
 * - an auth request (session refresh) that never answered kept it forever.
 * So the lock is per tab (processLock) and auth requests time out before
 * waiting callers would. A timed-out refresh is a retryable network error for
 * the client; it keeps the session and tries again.
 */
const AUTH_FETCH_TIMEOUT_MS = 8000;

const authFetch: typeof fetch = (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (!url.includes('/auth/v1/')) return fetch(input, init);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AUTH_FETCH_TIMEOUT_MS);
  const outer = init?.signal;
  if (outer) {
    if (outer.aborted) controller.abort();
    else outer.addEventListener('abort', () => controller.abort(), { once: true });
  }
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    lock: processLock,
  },
  global: { fetch: authFetch },
});
