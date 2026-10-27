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
    if (!raw) return null;
    const session = JSON.parse(raw) as Session;
    return { ...session, name: repairUtf8(session.name) };
  } catch {
    return null;
  }
}

/** Sessions saved before the UTF-8 fix below hold names like "JÃ¼rgen"; this turns them back into "Jürgen". */
function repairUtf8(text: string): string {
  if (typeof text !== 'string' || !/[Â-ô][\u0080-¿]/.test(text) || /[^\u0000-ÿ]/.test(text)) {
    return text;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(text, (c) => c.charCodeAt(0)));
  } catch {
    return text; // not UTF-8 read as Latin-1 after all
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
  // atob gives one character per byte; decode those bytes as UTF-8 so names like "Jürgen" survive.
  const bytes = Uint8Array.from(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
  const payload = JSON.parse(new TextDecoder().decode(bytes));
  return {
    name: payload.name ?? payload.email,
    email: payload.email,
    picture: payload.picture ?? null,
    sub: payload.sub,
    signedInAt: new Date().toISOString(),
  };
}
