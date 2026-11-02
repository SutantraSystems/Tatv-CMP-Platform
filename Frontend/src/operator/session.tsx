import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { opsApi } from './api/mock';
import { ACCESS, type Operator, type OpsApi } from './api/types';

interface OpsSession {
  api: OpsApi;
  op?: Operator;
  access: (typeof ACCESS)[keyof typeof ACCESS];
  signIn: (id: string) => Promise<void>;
  signOut: () => void;
}

const Ctx = createContext<OpsSession | undefined>(undefined);

export function OpsSessionProvider({ children }: { children: ReactNode }) {
  const [op, setOp] = useState<Operator>();
  const value: OpsSession = {
    api: opsApi,
    op,
    access: ACCESS[op?.role ?? 'business-admin'],
    async signIn(id) {
      setOp(await opsApi.signIn(id));
    },
    signOut: () => setOp(undefined),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOps(): OpsSession {
  const s = useContext(Ctx);
  if (!s) throw new Error('useOps must be used inside OpsSessionProvider');
  return s;
}

/** Re-runs `load` whenever the operator API reports a change. */
export function useOpsLive<T>(load: () => Promise<T>, deps: unknown[] = []): T | undefined {
  const { api } = useOps();
  const [data, setData] = useState<T>();
  useEffect(() => {
    let live = true;
    const run = () => void load().then((d) => live && setData(d));
    run();
    const off = api.subscribe(run);
    return () => {
      live = false;
      off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return data;
}
