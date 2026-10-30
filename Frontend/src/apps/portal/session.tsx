import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '@/mocks/portalApi';
import type { CmpApi, Organisation, Project, RegionId, User } from '@/shared/api/types';

interface Session {
  api: CmpApi;
  user?: User;
  organisations: Organisation[];
  projects: Project[];
  organisation?: Organisation;
  project?: Project;
  /** Region the console is scoped to; lists and new resources use it. */
  region: RegionId;
  setRegion: (r: RegionId) => void;
  /** True when the signed-in user is an organisation admin or owner in the current tenant. */
  isAdmin: boolean;
  signIn: (userId: string) => Promise<void>;
  signOut: () => void;
  selectOrganisation: (id: string) => void;
  selectProject: (id: string) => void;
}

const Ctx = createContext<Session | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User>();
  const [organisations, setOrganisations] = useState<Organisation[]>([]);
  const [organisation, setOrganisation] = useState<Organisation>();
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project>();
  const [region, setRegion] = useState<RegionId>('in-west');

  useEffect(() => {
    if (!organisation) return;
    let live = true;
    void api.listProjects(organisation.id).then((ps) => {
      if (!live) return;
      setProjects(ps);
      setProject(ps[0]);
    });
    return () => {
      live = false;
    };
  }, [organisation]);

  const value: Session = {
    api,
    user,
    organisations,
    projects,
    organisation,
    project,
    region,
    setRegion,
    isAdmin: !!organisation && (user?.roles[organisation.id] ?? []).some((r) => r === 'org-admin' || r === 'org-owner'),
    async signIn(userId) {
      const u = await api.signIn(userId);
      const orgs = await api.listOrganisations(u);
      setUser(u);
      setOrganisations(orgs);
      setOrganisation(orgs[0]);
    },
    signOut() {
      setUser(undefined);
      setOrganisations([]);
      setOrganisation(undefined);
      setProjects([]);
      setProject(undefined);
    },
    selectOrganisation: (id) => setOrganisation(organisations.find((o) => o.id === id)),
    selectProject: (id) => setProject(projects.find((p) => p.id === id)),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSession must be used inside SessionProvider');
  return s;
}

/** Re-runs `load` whenever the mock API reports a change (a server-sent event stream in production). */
export function useLive<T>(load: () => Promise<T>, deps: unknown[]): T | undefined {
  const { api: client } = useSession();
  const [data, setData] = useState<T>();
  useEffect(() => {
    let live = true;
    const run = () => void load().then((d) => live && setData(d));
    run();
    const off = client.subscribe(run);
    return () => {
      live = false;
      off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return data;
}

export const newIdempotencyKey = () => crypto.randomUUID();
