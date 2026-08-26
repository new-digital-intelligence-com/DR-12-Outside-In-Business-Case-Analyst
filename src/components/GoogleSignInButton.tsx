'use client';

import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import { useAuth } from '@/lib/AuthProvider';
import { decodeGoogleCredential } from '@/lib/auth';

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          renderButton: (parent: HTMLElement, options: Record<string, string>) => void;
        };
      };
    };
  }
}

export default function GoogleSignInButton() {
  const { signIn } = useAuth();
  const buttonRef = useRef<HTMLDivElement>(null);
  const [scriptReady, setScriptReady] = useState(false);

  useEffect(() => {
    if (!scriptReady || !CLIENT_ID || !buttonRef.current || !window.google) return;
    window.google.accounts.id.initialize({
      client_id: CLIENT_ID,
      callback: (response) => signIn(decodeGoogleCredential(response.credential)),
    });
    window.google.accounts.id.renderButton(buttonRef.current, {
      theme: 'outline',
      size: 'medium',
      type: 'standard',
      shape: 'pill',
    });
  }, [scriptReady, signIn]);

  if (!CLIENT_ID) {
    return (
      <span
        className="rounded-full border border-dashed border-slate-300 px-3 py-1.5 text-xs text-slate-400"
        title="Set NEXT_PUBLIC_GOOGLE_CLIENT_ID (a Google Cloud OAuth Client ID) to enable sign-in"
      >
        Google Sign-In not configured
      </span>
    );
  }

  return (
    <>
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onLoad={() => setScriptReady(true)}
      />
      <div ref={buttonRef} />
    </>
  );
}
