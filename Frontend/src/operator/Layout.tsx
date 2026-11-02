import {
  Button,
  Label,
  Masthead,
  MastheadBrand,
  MastheadContent,
  MastheadLogo,
  MastheadMain,
  Nav,
  NavItem,
  NavList,
  Page,
  PageSidebar,
  PageSidebarBody,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
} from '@patternfly/react-core';
import {
  BuildingIcon,
  ChartLineIcon,
  CheckCircleIcon,
  ClipboardCheckIcon,
  ListIcon,
  PlusCircleIcon,
  RupeeSignIcon,
  ServerIcon,
  TachometerAltIcon,
  WrenchIcon,
  LockIcon,
} from '@patternfly/react-icons';
import type { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { initials } from '../components/AppLayout';
import { ROLE_NAMES } from './api/types';
import { useOps, useOpsLive } from './session';

const NAV: { key: string; to: string; label: string; icon: ReactNode }[] = [
  { key: 'overview', to: '/', label: 'Overview', icon: <TachometerAltIcon /> },
  { key: 'tenants', to: '/tenants', label: 'Tenants', icon: <BuildingIcon /> },
  { key: 'capacity', to: '/capacity', label: 'Capacity', icon: <ServerIcon /> },
  { key: 'revenue', to: '/revenue', label: 'Revenue and billing', icon: <RupeeSignIcon /> },
  { key: 'operations', to: '/operations', label: 'Operations', icon: <WrenchIcon /> },
  { key: 'monitoring', to: '/monitoring', label: 'Monitoring and logs', icon: <ChartLineIcon /> },
  { key: 'approvals', to: '/approvals', label: 'Approvals', icon: <ClipboardCheckIcon /> },
  { key: 'audit', to: '/audit', label: 'Audit log', icon: <ListIcon /> },
  { key: 'onboard', to: '/onboard', label: 'Onboard tenant', icon: <PlusCircleIcon /> },
];

export function OpsLayout({ children }: { children: ReactNode }) {
  const { api, op, access, signOut } = useOps();
  const { pathname } = useLocation();
  const changes = useOpsLive(() => api.listChangeRequests());
  const pending = changes?.filter((c) => c.status === 'pending' && (access.canApprove ? c.requestedBy !== op?.id : c.requestedBy === op?.id)).length ?? 0;

  const masthead = (
    <Masthead className="ops-masthead">
      <MastheadMain>
        <MastheadBrand>
          <MastheadLogo component="a" href="#/" aria-label="Tatv Cloud Operations home">
            <span className="ops-brand">
              Tatv Cloud <span className="ops-brand__sub">Operations</span>
            </span>
          </MastheadLogo>
        </MastheadBrand>
      </MastheadMain>
      <MastheadContent>
        <Toolbar isFullHeight isStatic>
          <ToolbarContent>
            <ToolbarGroup>
              <ToolbarItem>
                <Label color="orange" icon={<LockIcon />}>
                  Internal · management network only
                </Label>
              </ToolbarItem>
            </ToolbarGroup>
            <ToolbarGroup align={{ default: 'alignEnd' }} gap={{ default: 'gapMd' }}>
              <ToolbarItem>
                <span className="ops-powered">powered by Sutantra</span>
              </ToolbarItem>
              <ToolbarItem>
                <Button variant="secondary" className="ops-signout" onClick={signOut}>
                  Sign out
                </Button>
              </ToolbarItem>
            </ToolbarGroup>
          </ToolbarContent>
        </Toolbar>
      </MastheadContent>
    </Masthead>
  );

  const sidebar = (
    <PageSidebar isSidebarOpen className="ops-sidebar">
      <PageSidebarBody className="profile-block">
        <div className="profile-head">
          <span className="initials-avatar initials-avatar--md ops-avatar" aria-hidden="true">
            {initials(op?.name)}
          </span>
          <div>
            <div className="profile-name">{op?.name}</div>
            <div className="profile-role">{op ? ROLE_NAMES[op.role] : ''}</div>
          </div>
        </div>
        <Label isCompact color={op?.team === 'sutantra' ? 'blue' : 'purple'}>
          {op?.team === 'sutantra' ? 'Sutantra managed services' : 'Partner business team'}
        </Label>
      </PageSidebarBody>
      <PageSidebarBody isFilled>
        <Nav aria-label="Operator">
          <NavList>
            {NAV.filter((n) => access.pages.includes(n.key)).map((n) => (
              <NavItem key={n.key} isActive={n.to === '/' ? pathname === '/' : pathname.startsWith(n.to)}>
                <NavLink to={n.to} end={n.to === '/'}>
                  <span className="nav-icon">{n.icon}</span>
                  {n.label}
                  {n.key === 'approvals' && pending > 0 && (
                    <Label isCompact color="orange" className="nav-count">
                      {pending}
                    </Label>
                  )}
                </NavLink>
              </NavItem>
            ))}
          </NavList>
        </Nav>
      </PageSidebarBody>
      <PageSidebarBody>
        <div className="sidebar-foot">
          <CheckCircleIcon aria-hidden="true" /> Metadata and usage only — no access to tenant data
        </div>
      </PageSidebarBody>
    </PageSidebar>
  );

  return (
    <Page masthead={masthead} sidebar={sidebar} isManagedSidebar={false}>
      {children}
    </Page>
  );
}
