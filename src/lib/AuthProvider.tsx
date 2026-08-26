'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { readStoredSession, writeStoredSession, type Session } from './auth';

interface AuthContextValue {
  session: Session | null;
  signIn: (session: Session) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);

  // Reading localStorage must happen after hydration, not during the initial render — doing it
  // eagerly (e.g. via a useState lazy initializer) would make the client's first render diverge
  // from the server-rendered (always signed-out) HTML and trigger a hydration mismatch.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setSession(readStoredSession());
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  function signIn(next: Session) {
    writeStoredSession(next);
    setSession(next);
  }

  function signOut() {
    writeStoredSession(null);
    setSession(null);
  }

  return <AuthContext.Provider value={{ session, signIn, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
