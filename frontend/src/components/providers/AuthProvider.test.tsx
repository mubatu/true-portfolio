// @vitest-environment jsdom
import { useEffect } from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthContextType } from '@/hooks/authContext';
import { useAuth } from '@/hooks/useAuth';

const auth = vi.hoisted(() => ({
  getSession: vi.fn(async () => ({ data: { session: null } })),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: () => {} } } })),
  signInWithIdToken: vi.fn(async () => ({ error: null })),
  signOut: vi.fn(async () => ({ error: null })),
}));
vi.mock('@/lib/supabase', () => ({ supabase: { auth } }));

const { AuthProvider } = await import('./AuthProvider');

function renderProvider() {
  const ctx: { current: AuthContextType | null } = { current: null };
  function Capture() {
    const value = useAuth();
    useEffect(() => {
      ctx.current = value;
    });
    return null;
  }
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthProvider>
        <Capture />
      </AuthProvider>
    </QueryClientProvider>
  );
  return () => ctx.current!;
}

afterEach(() => {
  cleanup();
  delete window.google;
});

describe('AuthProvider', () => {
  it('signs in with the Google ID token and nonce', async () => {
    const ctx = renderProvider();
    await waitFor(() => expect(ctx().isLoading).toBe(false));

    const result = await ctx().signInWithGoogle('google-id-token', 'raw-nonce');

    expect(result.error).toBeNull();
    expect(auth.signInWithIdToken).toHaveBeenCalledWith({ provider: 'google', token: 'google-id-token', nonce: 'raw-nonce' });
  });

  it('turns off Google auto-select on sign out', async () => {
    const disableAutoSelect = vi.fn();
    window.google = { accounts: { id: { initialize: vi.fn(), renderButton: vi.fn(), disableAutoSelect } } };
    const ctx = renderProvider();
    await waitFor(() => expect(ctx().isLoading).toBe(false));

    await act(() => ctx().signOut());

    expect(disableAutoSelect).toHaveBeenCalled();
    expect(auth.signOut).toHaveBeenCalled();
  });
});
