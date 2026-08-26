export interface Session {
  name: string;
  email: string;
  picture: string | null;
  /** Google's stable user id (JWT `sub` claim). */
  sub: string;
  signedInAt: string;
}

const STORAGE_KEY = 'oia_session_v1';

export function readStoredSession(): Session | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function writeStoredSession(session: Session | null) {
  if (session) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  else window.localStorage.removeItem(STORAGE_KEY);
}

/**
 * Decodes a Google Identity Services JWT credential client-side to read the profile fields for
 * display. This does NOT verify the token's signature — fine here because nothing in this app is
 * gated behind identity (see AuthProvider). A backend that needs to trust the identity must
 * verify the token against Google's public keys itself.
 */
export function decodeGoogleCredential(credential: string): Session {
  const payloadB64 = credential.split('.')[1];
  const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));
  return {
    name: payload.name ?? payload.email,
    email: payload.email,
    picture: payload.picture ?? null,
    sub: payload.sub,
    signedInAt: new Date().toISOString(),
  };
}
