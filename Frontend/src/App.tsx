import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { Activity } from './pages/Activity';
import { Catalog } from './pages/Catalog';
import { CreateResource } from './pages/CreateResource';
import { Dashboard } from './pages/Dashboard';
import { Databases } from './pages/Databases';
import { Iam } from './pages/Iam';
import { KubernetesClusters } from './pages/KubernetesClusters';
import { Monitoring } from './pages/Monitoring';
import { Network } from './pages/Network';
import { ResourceDetail } from './pages/ResourceDetail';
import { Search } from './pages/Search';
import { SignIn } from './pages/SignIn';
import { Storage } from './pages/Storage';
import { VirtualMachines } from './pages/VirtualMachines';
import { SessionProvider, useSession } from './session';

function Routed() {
  const { user } = useSession();
  if (!user) return <SignIn />;
  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/catalog" element={<Catalog />} />
        <Route path="/catalog/:itemId/create" element={<CreateResource />} />
        <Route path="/network" element={<Network />} />
        <Route path="/vms" element={<VirtualMachines />} />
        <Route path="/kubernetes" element={<KubernetesClusters />} />
        <Route path="/storage" element={<Storage />} />
        <Route path="/databases" element={<Databases />} />
        <Route path="/r/:id" element={<ResourceDetail />} />
        <Route path="/iam" element={<Iam />} />
        <Route path="/monitoring" element={<Monitoring />} />
        <Route path="/activity" element={<Activity />} />
        <Route path="/search" element={<Search />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppLayout>
  );
}

export function App() {
  return (
    // HashRouter keeps the prototype working as a single static file.
    <HashRouter>
      <SessionProvider>
        <Routed />
      </SessionProvider>
    </HashRouter>
  );
}
