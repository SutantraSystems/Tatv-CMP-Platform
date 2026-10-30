import {
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  CardTitle,
  Content,
  Label,
  PageSection,
  SearchInput,
  Tab,
  Tabs,
  TabTitleText,
  Title,
  ToggleGroup,
  ToggleGroupItem,
} from '@patternfly/react-core';
import { BrainIcon, CubesIcon, DatabaseIcon, HddIcon, NetworkIcon, ShieldAltIcon, StoreIcon } from '@patternfly/react-icons';
import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CATEGORIES } from '@/shared/catalog/catalog';
import type { CatalogItem, ServiceCategory } from '@/shared/api/types';
import { useSession } from '../../session';

export const CATEGORY_ICONS: Record<ServiceCategory, ReactNode> = {
  network: <NetworkIcon />,
  compute: <CubesIcon />,
  storage: <HddIcon />,
  databases: <DatabaseIcon />,
  ai: <BrainIcon />,
  protection: <ShieldAltIcon />,
};

function ItemCard({ item }: { item: CatalogItem }) {
  const navigate = useNavigate();
  const market = item.publisher !== 'Platform';
  const open = () =>
    item.preset ? navigate(`/catalog/${item.preset.itemId}/create?preset=${item.id}`) : navigate(`/catalog/${item.id}/create`);
  return (
    <Card isFullHeight className="service-card">
      <CardHeader>
        <div className="service-card__head">
          <span className={`icon-tile icon-tile--${market ? 'violet' : 'blue'}`}>{market ? <StoreIcon /> : CATEGORY_ICONS[item.category]}</span>
          <div>
            <CardTitle component="h3">{item.name}</CardTitle>
            <Label isCompact variant="outline">
              {item.group}
            </Label>
          </div>
        </div>
      </CardHeader>
      <CardBody>
        <Content component="p">{item.description}</Content>
        {market && <Content component="small" className="muted">Published by {item.publisher}</Content>}
      </CardBody>
      <CardFooter>
        {item.available ? (
          <Button variant="secondary" onClick={open}>
            Create
          </Button>
        ) : (
          <Label isCompact color="grey">
            Coming soon
          </Label>
        )}
      </CardFooter>
    </Card>
  );
}

export function Catalog() {
  const { api } = useSession();
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [tab, setTab] = useState<string | number>(params.get('tab') === 'marketplace' ? 'marketplace' : 'services');
  const [q, setQ] = useState('');
  const category = (params.get('category') ?? 'all') as ServiceCategory | 'all';

  useEffect(() => {
    void api.getCatalog().then(setItems);
  }, [api]);

  const matches = (i: CatalogItem) => !q || `${i.name} ${i.description} ${i.group}`.toLowerCase().includes(q.toLowerCase());
  const services = items.filter((i) => i.publisher === 'Platform' && matches(i));
  const market = items.filter((i) => i.publisher !== 'Platform' && matches(i));
  const shown = CATEGORIES.filter((c) => category === 'all' || c.id === category);

  return (
    <>
      <PageSection>
        <Title headingLevel="h1" size="2xl">
          All services
        </Title>
        <Content component="p" className="muted">
          Browse and create cloud services for your project. Every service is defined once in the catalog and offered the same way in the portal, API, CLI and OpenTofu.
        </Content>
        <SearchInput className="catalog-search" placeholder="Search services" aria-label="Search services" value={q} onChange={(_e, v) => setQ(v)} onClear={() => setQ('')} />
      </PageSection>
      <PageSection>
        <Tabs activeKey={tab} onSelect={(_e, k) => setTab(k)} aria-label="Catalog sections">
          <Tab eventKey="services" title={<TabTitleText>Cloud services</TabTitleText>}>
            <ToggleGroup aria-label="Category" className="category-filter">
              <ToggleGroupItem text="All" isSelected={category === 'all'} onChange={() => setParams({})} />
              {CATEGORIES.map((c) => (
                <ToggleGroupItem key={c.id} text={c.name} isSelected={category === c.id} onChange={() => setParams({ category: c.id })} />
              ))}
            </ToggleGroup>
            {shown.map((c) => {
              const list = services.filter((i) => i.category === c.id);
              if (!list.length) return null;
              return (
                <section key={c.id} className="catalog-section" aria-labelledby={`cat-${c.id}`}>
                  <div className="catalog-section__head">
                    <span className="icon-tile icon-tile--blue">{CATEGORY_ICONS[c.id]}</span>
                    <div>
                      <Title headingLevel="h2" size="lg" id={`cat-${c.id}`}>
                        {c.name}
                      </Title>
                      <Content component="small" className="muted">
                        {c.summary}
                      </Content>
                    </div>
                  </div>
                  <div className="service-grid">
                    {list.map((i) => (
                      <ItemCard key={i.id} item={i} />
                    ))}
                  </div>
                </section>
              );
            })}
            {services.length === 0 && <Content component="p">No services match “{q}”.</Content>}
          </Tab>
          <Tab eventKey="marketplace" title={<TabTitleText>Marketplace</TabTitleText>}>
            <Content component="p" className="muted catalog-intro">
              Third-party software, vetted and signed before listing, billed on your normal invoice. Listings are curated by the platform at launch; self-service publishing comes later.
            </Content>
            <div className="service-grid">
              {market.map((i) => (
                <ItemCard key={i.id} item={i} />
              ))}
            </div>
          </Tab>
        </Tabs>
      </PageSection>
    </>
  );
}
