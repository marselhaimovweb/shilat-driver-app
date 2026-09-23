import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AccessibilityInfo } from 'react-native';
import { storage } from '../lib/storage';

/*
 * In-app accessibility settings (IS 5568 / WCAG 2.0 AA): larger text, high
 * contrast and reduced motion. They add to the phone's own settings - the
 * system font size is always respected as well.
 */
export type TextScale = 1 | 1.15 | 1.3;

interface A11yState {
  textScale: TextScale;
  highContrast: boolean;
  reduceMotion: boolean;
}

interface A11yContextValue extends A11yState {
  update(patch: Partial<A11yState>): void;
}

const KEY = 'carwash.a11y';
const DEFAULTS: A11yState = { textScale: 1, highContrast: false, reduceMotion: false };
const A11yContext = createContext<A11yContextValue>({ ...DEFAULTS, update: () => undefined });

export function AccessibilityProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<A11yState>(DEFAULTS);

  useEffect(() => {
    Promise.all([storage.get(KEY), AccessibilityInfo.isReduceMotionEnabled().catch(() => false)]).then(([raw, systemReduce]) => {
      const saved = raw ? (JSON.parse(raw) as Partial<A11yState>) : {};
      setState({ ...DEFAULTS, reduceMotion: systemReduce, ...saved });
    });
  }, []);

  const value = useMemo<A11yContextValue>(
    () => ({
      ...state,
      update(patch) {
        setState((prev) => {
          const next = { ...prev, ...patch };
          storage.set(KEY, JSON.stringify(next)).catch(() => undefined);
          return next;
        });
      },
    }),
    [state],
  );

  return <A11yContext.Provider value={value}>{children}</A11yContext.Provider>;
}

export const useA11y = () => useContext(A11yContext);
