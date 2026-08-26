'use client';

import { useAuth } from '@/lib/AuthProvider';
import GoogleSignInButton from './GoogleSignInButton';

export default function AppHeader() {
  const { session, signOut } = useAuth();

  return (
    <header className="print-hide border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <span className="text-sm font-semibold text-slate-800">AI Opportunity Assessment</span>
        <div className="flex items-center gap-3">
          {session ? (
            <div className="flex items-center gap-2">
              {session.picture && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={session.picture}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="h-7 w-7 rounded-full"
                />
              )}
              <span className="hidden text-xs text-slate-600 sm:inline">{session.name}</span>
              <button
                onClick={signOut}
                className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50"
              >
                Sign out
              </button>
            </div>
          ) : (
            <GoogleSignInButton />
          )}
        </div>
      </div>
    </header>
  );
}
