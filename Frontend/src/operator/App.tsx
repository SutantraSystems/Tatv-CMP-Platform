import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { OpsLayout } from './Layout';
import { Approvals } from './pages/Approvals';
import { Audit } from './pages/Audit';
import { Capacity } from './pages/Capacity';
import { OpsMonitoring } from './pages/Monitoring';
import { Onboard } from './pages/Onboard';
import { Operations } from './pages/Operations';
import { Overview } from './pages/Overview';
import { Revenue } from './pages/Revenue';
import { OpsSignIn } from './pages/SignIn';
import { TenantDetail } from './pages/TenantDetail';
import { Tenants } from './pages/Tenants';
import { OpsSessionProvider, useOps } from './session';

function Routed() {
  const { op, access } = useOps();
  if (!op) return <OpsSignIn />;
  const allow = (key: string, el: JSX.Element) => (access.pages.includes(key) ? el : <Navigate to="/" replace />);
  return (
    <OpsLayout>
      <Routes>
        <Route path="/" element={<Overview />} />
        <Route path="/tenants" element={allow('tenants', <Tenants />)} />
        <Route path="/tenants/:id" element={allow('tenants', <TenantDetail />)} />
        <Route path="/capacity" element={allow('capacity', <Capacity />)} />
        <Route path="/revenue" element={allow('revenue', <Revenue />)} />
        <Route path="/operations" element={allow('operations', <Operations />)} />
        <Route path="/monitoring" element={allow('monitoring', <OpsMonitoring />)} />
        <Route path="/approvals" element={allow('approvals', <Approvals />)} />
        <Route path="/audit" element={allow('audit', <Audit />)} />
        <Route path="/onboard" element={allow('onboard', <Onboard />)} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </OpsLayout>
  );
}

export function OpsApp() {
  return (
    <HashRouter>
      <OpsSessionProvider>
        <Routed />
      </OpsSessionProvider>
    </HashRouter>
  );
}
