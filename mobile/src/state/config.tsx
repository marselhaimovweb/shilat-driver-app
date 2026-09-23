import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, type PublicConfig } from '../api';

interface ConfigContextValue {
  config: PublicConfig | null;
  error: string | null;
  reload(): Promise<void>;
  priceOf(vehicleTypeCode: string, serviceCode: string): number | null;
}

const ConfigContext = createContext<ConfigContextValue | null>(null);

/** Business config (feature switches, prices, hours) - reloaded whenever screens need fresh values. */
export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setConfig(await api.getConfig());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה בטעינת הנתונים');
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const priceOf = useCallback(
    (v: string, s: string) => config?.prices.find((p) => p.vehicleTypeCode === v && p.serviceCode === s)?.price ?? null,
    [config],
  );

  return <ConfigContext.Provider value={{ config, error, reload, priceOf }}>{children}</ConfigContext.Provider>;
}

export function useConfig() {
  const ctx = useContext(ConfigContext);
  if (!ctx) throw new Error('useConfig must be used inside ConfigProvider');
  return ctx;
}
