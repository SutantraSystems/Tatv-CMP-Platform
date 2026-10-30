import {
  Button,
  Divider,
  Dropdown,
  DropdownItem,
  DropdownList,
  FormSelect,
  FormSelectOption,
  Masthead,
  MastheadBrand,
  MastheadContent,
  MastheadLogo,
  MastheadMain,
  MastheadToggle,
  MenuToggle,
  Nav,
  NavExpandable,
  NavItem,
  NavList,
  Page,
  PageSidebar,
  PageSidebarBody,
  PageToggleButton,
  SearchInput,
  ToggleGroup,
  ToggleGroupItem,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
} from '@patternfly/react-core';
import {
  BarsIcon,
  BellIcon,
  CubesIcon,
  DatabaseIcon,
  GlobeIcon,
  HddIcon,
  ChartLineIcon,
  HistoryIcon,
  NetworkIcon,
  ServerIcon,
  TachometerAltIcon,
  ThIcon,
  UsersIcon,
} from '@patternfly/react-icons';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { REGIONS } from '@/shared/catalog/catalog';
import type { RegionId } from '@/shared/api/types';
import { BRAND } from '@/shared/brand';
import { initials } from '@/shared/lib/format';
import { useLive, useSession } from '../session';

function InitialsAvatar({ name, size = 'md' }: { name?: string; size?: 'sm' | 'md' }) {
  return (
    <span className={`initials-avatar initials-avatar--${size}`} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

const ROLE_NAMES: Record<string, string> = {
  'org-owner': 'Tenant owner',
  'org-admin': 'Tenant admin',
  'billing-admin': 'Billing admin',
  auditor: 'Auditor',
  'project-admin': 'Project admin',
  'project-operator': 'Project operator',
  'project-reader': 'Project reader',
};
export const roleName = (r: string) => ROLE_NAMES[r] ?? r;

export function AppLayout({ children }: { children: ReactNode }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { api, user, organisations, organisation, projects, project, region, setRegion, isAdmin, selectOrganisation, selectProject, signOut } = useSession();
  const { pathname } = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [userMenu, setUserMenu] = useState(false);
  const [query, setQuery] = useState('');
  const ops = useLive(() => (project ? api.listOperations(project.id) : Promise.resolve([])), [project?.id]);
  const pending = ops?.filter((o) => o.status === 'awaiting_approval' && (isAdmin ? o.requestedBy !== user?.id : o.requestedBy === user?.id)).length ?? 0;
  const roles = organisation ? user?.roles[organisation.id] ?? [] : [];

  const masthead = (
    <Masthead>
      <MastheadMain>
        <MastheadToggle>
          <PageToggleButton variant="plain" aria-label="Show or hide navigation" isSidebarOpen={sidebarOpen} onSidebarToggle={() => setSidebarOpen((o) => !o)}>
            <BarsIcon />
          </PageToggleButton>
        </MastheadToggle>
        <MastheadBrand>
          <MastheadLogo component="a" href="#/" aria-label={`${BRAND.productName} home`}>
            <span className="brand-mark">{BRAND.productName}</span>
          </MastheadLogo>
        </MastheadBrand>
      </MastheadMain>
      <MastheadContent>
        <Toolbar isFullHeight isStatic>
          <ToolbarContent>
            <ToolbarGroup>
              <ToolbarItem>
                <div className="region-select">
                  <GlobeIcon aria-hidden="true" />
                  <FormSelect aria-label={t('common.region')} value={region} onChange={(_e, v) => setRegion(v as RegionId)}>
                    {REGIONS.map((r) => (
                      <FormSelectOption key={r.id} value={r.id} label={r.name} />
                    ))}
                  </FormSelect>
                </div>
              </ToolbarItem>
            </ToolbarGroup>
            <ToolbarGroup align={{ default: 'alignEnd' }} gap={{ default: 'gapMd' }}>
              <ToolbarItem>
                <SearchInput
                  className="masthead-search"
                  placeholder={t('common.search')}
                  aria-label={t('common.search')}
                  value={query}
                  onChange={(_e, v) => setQuery(v)}
                  onClear={() => setQuery('')}
                  onSearch={(_e, v) => v.trim() && navigate(`/search?q=${encodeURIComponent(v.trim())}`)}
                />
              </ToolbarItem>
              <ToolbarItem>
                <Button
                  variant="plain"
                  className="bell"
                  onClick={() => navigate('/activity')}
                  aria-label={pending ? `${pending} requests awaiting approval` : 'No requests awaiting approval'}
                  icon={<BellIcon />}
                >
                  {pending > 0 && <span className="bell-count">{pending}</span>}
                </Button>
              </ToolbarItem>
              <ToolbarItem>
                <Dropdown
                  isOpen={userMenu}
                  onOpenChange={setUserMenu}
                  popperProps={{ position: 'right' }}
                  toggle={(ref) => (
                    <MenuToggle ref={ref} variant="plain" onClick={() => setUserMenu((o) => !o)} isExpanded={userMenu} aria-label={`Account menu for ${user?.name}`}>
                      <InitialsAvatar name={user?.name} size="sm" />
                    </MenuToggle>
                  )}
                >
                  <DropdownList>
                    <DropdownItem key="me" isDisabled description={user?.email}>
                      {user?.name}
                    </DropdownItem>
                    <Divider component="li" key="d1" />
                    <DropdownItem key="lang" onClick={(e) => e?.preventDefault()}>
                      <ToggleGroup aria-label={t('common.language')} isCompact>
                        <ToggleGroupItem text="English" isSelected={i18n.language === 'en'} onChange={() => void i18n.changeLanguage('en')} />
                        <ToggleGroupItem text="हिन्दी" isSelected={i18n.language === 'hi'} onChange={() => void i18n.changeLanguage('hi')} />
                      </ToggleGroup>
                    </DropdownItem>
                    <Divider component="li" key="d2" />
                    <DropdownItem key="out" onClick={signOut}>
                      {t('common.signOut')}
                    </DropdownItem>
                  </DropdownList>
                </Dropdown>
              </ToolbarItem>
            </ToolbarGroup>
          </ToolbarContent>
        </Toolbar>
      </MastheadContent>
    </Masthead>
  );

  const link = (to: string, label: string, icon?: ReactNode) => (
    <NavItem key={to} isActive={to === '/' ? pathname === '/' : pathname.startsWith(to)}>
      <NavLink to={to} end={to === '/'}>
        {icon && <span className="nav-icon">{icon}</span>}
        {label}
      </NavLink>
    </NavItem>
  );
  const computeOpen = pathname.startsWith('/vms') || pathname.startsWith('/kubernetes');

  const sidebar = (
    <PageSidebar isSidebarOpen={sidebarOpen}>
      <PageSidebarBody className="profile-block">
        <div className="profile-head">
          <InitialsAvatar name={user?.name} />
          <div>
            <div className="profile-name">{user?.name}</div>
            <div className="profile-role">{roles.map(roleName).join(', ')}</div>
          </div>
        </div>
        <label className="profile-label" htmlFor="tenant-select">
          {t('common.organisation')}
        </label>
        {organisations.length > 1 ? (
          <FormSelect id="tenant-select" value={organisation?.id ?? ''} onChange={(_e, v) => selectOrganisation(v)}>
            {organisations.map((o) => (
              <FormSelectOption key={o.id} value={o.id} label={o.name} />
            ))}
          </FormSelect>
        ) : (
          <div id="tenant-select" className="profile-tenant">
            {organisation?.name}
          </div>
        )}
        <label className="profile-label" htmlFor="project-select">
          {t('common.project')}
        </label>
        <FormSelect id="project-select" value={project?.id ?? ''} onChange={(_e, v) => selectProject(v)}>
          {projects.map((p) => (
            <FormSelectOption key={p.id} value={p.id} label={p.name} />
          ))}
        </FormSelect>
        <div className="profile-billing">
          <span className="dot dot--green" aria-hidden="true" /> Billing: Active
        </div>
      </PageSidebarBody>
      <PageSidebarBody isFilled>
        <Nav aria-label="Main">
          <NavList>
            {link('/', t('nav.dashboard'), <TachometerAltIcon />)}
            {link('/catalog', t('nav.catalog'), <ThIcon />)}
            {link('/network', t('nav.network'), <NetworkIcon />)}
            <NavExpandable
              title={
                <>
                  <span className="nav-icon">
                    <ServerIcon />
                  </span>
                  {t('nav.compute')}
                </>
              }
              groupId="compute"
              isActive={computeOpen}
              isExpanded
            >
              {link('/vms', t('nav.vms'))}
              {link('/kubernetes', t('nav.k8s'))}
            </NavExpandable>
            {link('/storage', t('nav.storage'), <HddIcon />)}
            {link('/databases', t('nav.databases'), <DatabaseIcon />)}
            {link('/iam', t('nav.iam'), <UsersIcon />)}
            {link('/monitoring', t('nav.monitoring'), <ChartLineIcon />)}
            {link('/activity', t('nav.activity'), <HistoryIcon />)}
          </NavList>
        </Nav>
      </PageSidebarBody>
      <PageSidebarBody>
        <div className="sidebar-foot">
          <CubesIcon aria-hidden="true" /> {BRAND.tagline}
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

