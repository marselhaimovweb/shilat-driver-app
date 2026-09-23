import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, setApiToken, type Session } from '../api';
import { storage } from '../lib/storage';

const KEY = 'carwash.session';

interface SessionContextValue {
  session: Session | null;
  ready: boolean;
  signIn(session: Session): Promise<void>;
  signOut(): Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    storage
      .get(KEY)
      .then((raw) => {
        if (!raw) return;
        const saved = JSON.parse(raw) as Session;
        // demo tokens do not survive a reload of the in-memory data
        if (api.mode === 'demo' && saved.role === 'customer' && !saved.token.startsWith('demo-')) return;
        setApiToken(saved.token);
        setSession(saved);
      })
      .catch(() => undefined)
      .finally(() => setReady(true));
  }, []);

  const signIn = useCallback(async (next: Session) => {
    setApiToken(next.token);
    setSession(next);
    await storage.set(KEY, JSON.stringify(next));
  }, []);

  const signOut = useCallback(async () => {
    setApiToken(null);
    setSession(null);
    await storage.set(KEY, null);
  }, []);

  const value = useMemo(() => ({ session, ready, signIn, signOut }), [session, ready, signIn, signOut]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** Staff (owner / manager / worker) see the management panel. */
export const isStaff = (session: Session | null) => !!session?.adminRole;

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}
