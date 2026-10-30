import { Card, CardBody, CardTitle, Content, PageSection, Title } from '@patternfly/react-core';
import { Link, useSearchParams } from 'react-router-dom';
import { CATALOG, regionName } from '@/shared/catalog/catalog';
import { StatusDot } from '@/shared/ui/Status';
import { useLive, useSession } from '../session';

export function Search() {
  const [params] = useSearchParams();
  const q = (params.get('q') ?? '').toLowerCase();
  const { api, project } = useSession();
  const resources = useLive(() => (project ? api.listResources(project.id) : Promise.resolve([])), [project?.id]);
  const hits = (resources ?? []).filter((r) =>
    `${r.name} ${r.id} ${r.addresses?.private ?? ''} ${r.addresses?.public ?? ''} ${Object.entries(r.tags).map(([k, v]) => `${k}:${v}`).join(' ')}`.toLowerCase().includes(q),
  );
  const services = CATALOG.filter((c) => `${c.name} ${c.description} ${c.group}`.toLowerCase().includes(q));
  return (
    <>
      <PageSection>
        <Title headingLevel="h1" size="2xl">
          Results for “{params.get('q')}”
        </Title>
        <Content component="p" className="muted">
          Resources in project {project?.name} (all regions) and catalog services.
        </Content>
      </PageSection>
      <PageSection className="tight-top">
        <div className="stat-grid stat-grid--2">
          <Card>
            <CardTitle>Resources ({hits.length})</CardTitle>
            <CardBody>
              <ul className="plain-list">
                {hits.map((r) => (
                  <li key={r.id}>
                    <div>
                      <Link to={`/r/${r.id}`}>{r.name}</Link>
                      <div className="muted small">
                        {CATALOG.find((c) => c.id === r.catalogItemId)?.name} · {regionName(r.region)} · <code>{r.id}</code>
                      </div>
                    </div>
                    <StatusDot status={r.status} />
                  </li>
                ))}
                {hits.length === 0 && <li className="muted">No matching resources.</li>}
              </ul>
            </CardBody>
          </Card>
          <Card>
            <CardTitle>Services ({services.length})</CardTitle>
            <CardBody>
              <ul className="plain-list">
                {services.map((c) => (
                  <li key={c.id}>
                    <div>
                      {c.available ? <Link to={c.preset ? `/catalog/${c.preset.itemId}/create?preset=${c.id}` : `/catalog/${c.id}/create`}>{c.name}</Link> : c.name}
                      <div className="muted small">{c.description}</div>
                    </div>
                  </li>
                ))}
                {services.length === 0 && <li className="muted">No matching services.</li>}
              </ul>
            </CardBody>
          </Card>
        </div>
      </PageSection>
    </>
  );
}
