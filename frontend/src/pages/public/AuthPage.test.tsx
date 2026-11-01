// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContextType } from '@/hooks/authContext';
import i18n from '@/i18n';

// The page reads the client ID when it is imported, so set it first.
vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test-client.apps.googleusercontent.com');
const { AuthPage } = await import('./AuthPage');
const { AuthContext } = await import('@/hooks/authContext');
const { ThemeContext } = await import('@/hooks/themeContext');

interface InitConfig {
  client_id: string;
  nonce?: string;
  callback: (response: { credential?: string }) => void;
}

let initConfig: InitConfig | null = null;
const renderButton = vi.fn();

function stubGoogle() {
  initConfig = null;
  window.google = {
    accounts: {
      id: {
        initialize: vi.fn((config: InitConfig) => {
          initConfig = config;
        }),
        renderButton,
        disableAutoSelect: vi.fn(),
      },
    },
  };
}

function renderPage(signInWithGoogle: AuthContextType['signInWithGoogle']) {
  const auth: AuthContextType = {
    user: null,
    session: null,
    isAuthenticated: false,
    isLoading: false,
    signInWithGoogle,
    signOut: async () => {},
  };
  return render(
    <ThemeContext.Provider value={{ theme: 'light', toggleTheme: () => {}, setTheme: () => {} }}>
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={['/auth']}>
          <Routes>
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/explore" element={<p>explore page</p>} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </ThemeContext.Provider>
  );
}

async function sha256Hex(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

beforeEach(async () => {
  stubGoogle();
  renderButton.mockClear();
  await i18n.changeLanguage('tr');
});

afterEach(() => {
  cleanup();
  delete window.google;
});

describe('AuthPage', () => {
  it('renders the Google button and signs in with the credential and raw nonce', async () => {
    const signInWithGoogle = vi.fn(async () => ({ error: null }));
    renderPage(signInWithGoogle);

    await waitFor(() => expect(renderButton).toHaveBeenCalled());
    expect(initConfig?.client_id).toBe('test-client.apps.googleusercontent.com');
    expect(renderButton.mock.calls[0][1]).toMatchObject({ text: 'continue_with', shape: 'pill', locale: 'tr' });

    await act(async () => initConfig!.callback({ credential: 'google-id-token' }));

    expect(await screen.findByText('explore page')).toBeTruthy();
    const [credential, rawNonce] = signInWithGoogle.mock.calls[0] as unknown as [string, string];
    expect(credential).toBe('google-id-token');
    // Google gets the hash, Supabase the raw value it was made from.
    expect(await sha256Hex(rawNonce)).toBe(initConfig!.nonce);
  });

  it('shows a translated error and offers the button again when Supabase rejects the token', async () => {
    // Like the real network call: the page shows its spinner, then the button again.
    const signInWithGoogle = vi.fn(
      () => new Promise<{ error: Error }>((resolve) => setTimeout(() => resolve({ error: new Error('Bad ID token') }), 10))
    );
    renderPage(signInWithGoogle);
    await waitFor(() => expect(renderButton).toHaveBeenCalledTimes(1));

    await act(async () => initConfig!.callback({ credential: 'expired-token' }));

    expect((await screen.findByRole('alert')).textContent).toBe(i18n.t('auth.errors.googleFailed'));
    await waitFor(() => expect(renderButton).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('explore page')).toBeNull();
  });

  it('reports when Google Identity Services cannot load', async () => {
    delete window.google;
    const append = vi.spyOn(document.head, 'appendChild').mockImplementation((node) => {
      queueMicrotask(() => (node as HTMLScriptElement).onerror?.(new Event('error')));
      return node;
    });
    renderPage(vi.fn());

    expect((await screen.findByRole('alert')).textContent).toBe(i18n.t('auth.errors.googleUnavailable'));
    append.mockRestore();
  });
});
