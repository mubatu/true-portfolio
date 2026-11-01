import { useEffect, useRef } from 'react';
import { createNonce, loadGoogleIdentity } from '@/lib/googleIdentity';

interface GoogleSignInButtonProps {
  clientId: string;
  /** Google's ID token plus the raw nonce whose hash it carries. */
  onCredential: (credential: string, nonce: string) => void;
  onLoadError: () => void;
  theme: 'light' | 'dark';
  locale: string;
}

/** Google's own "Continue with Google" button (Google Identity Services). */
export function GoogleSignInButton({ clientId, onCredential, onLoadError, theme, locale }: GoogleSignInButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Parents pass new callbacks on every render; keep them out of the effect's
  // dependencies so the button is not torn down and rebuilt each time.
  const onCredentialRef = useRef(onCredential);
  const onLoadErrorRef = useRef(onLoadError);
  useEffect(() => {
    onCredentialRef.current = onCredential;
    onLoadErrorRef.current = onLoadError;
  });

  useEffect(() => {
    let cancelled = false;

    Promise.all([loadGoogleIdentity(), createNonce()])
      .then(([accountsId, nonce]) => {
        const container = containerRef.current;
        if (cancelled || !container) return;

        accountsId.initialize({
          client_id: clientId,
          nonce: nonce.hashed,
          callback: (response) => {
            if (response.credential) onCredentialRef.current(response.credential, nonce.raw);
          },
        });
        container.replaceChildren();
        accountsId.renderButton(container, {
          type: 'standard',
          theme: theme === 'dark' ? 'filled_black' : 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'pill',
          locale,
          width: Math.min(400, container.offsetWidth || 320),
        });
      })
      .catch(() => {
        if (!cancelled) onLoadErrorRef.current();
      });

    return () => {
      cancelled = true;
    };
  }, [clientId, theme, locale]);

  return <div ref={containerRef} className="flex justify-center min-h-11" data-testid="google-button" />;
}
