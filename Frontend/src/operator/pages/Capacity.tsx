import { Card, CardBody, CardTitle, Content, Label, PageSection, Title } from '@patternfly/react-core';
import { regionName } from '../../api/catalog';
import { Meter, num } from '../components';
import { useOps, useOpsLive } from '../session';

/** Weeks until allocation reaches 80 % of installed at a constant weekly growth rate. */
function weeksTo80(used: number, total: number, growth: number) {
  const u = used / total;
  if (u >= 0.8) return 0;
  if (u <= 0 || growth <= 0) return Infinity;
  return Math.ceil(Math.log(0.8 / u) / Math.log(1 + growth));
}

export function Capacity() {
  const { api } = useOps();
  const capacity = useOpsLive(() => api.capacity());
  return (
    <>
      <PageSection>
        <Title headingLevel="h1" size="2xl">
          Capacity
        </Title>
        <Content component="p" className="muted">
          Allocated against installed capacity per region, with a simple forecast of when to add hardware. Installed figures are illustrative until the hardware bill of materials is final.
        </Content>
      </PageSection>
      <PageSection className="tight-top">
        <div className="stat-grid stat-grid--2">
          {capacity?.map((c) => {
            const w = Math.min(
              weeksTo80(c.vcpu.allocated, c.vcpu.installed, c.weeklyGrowth),
              weeksTo80(c.ramGb.allocated, c.ramGb.installed, c.weeklyGrowth),
              weeksTo80(c.gpus.allocated, c.gpus.installed, c.weeklyGrowth),
            );
            return (
              <Card key={c.region}>
                <CardTitle>
                  {regionName(c.region)}{' '}
                  <Label isCompact variant="outline">
                    {c.hosts} compute hosts
                  </Label>
                </CardTitle>
                <CardBody className="quota-list">
                  <Meter label="vCPUs" used={c.vcpu.allocated} total={c.vcpu.installed} note="Installed vCPUs assume a 4:1 overcommit on general-purpose hosts." />
                  <Meter label="RAM" used={c.ramGb.allocated} total={c.ramGb.installed} unit="GB" note="No memory overcommit." />
                  <Meter label="Block and file storage" used={c.blockTb.allocated} total={c.blockTb.installed} unit="TB" />
                  <Meter label="Object storage" used={c.objectTb.allocated} total={c.objectTb.installed} unit="TB" />
                  <Meter label="GPUs" used={c.gpus.allocated} total={c.gpus.installed} note="GPUs are not overcommitted." />
                  <div className={`forecast ${w <= 12 ? 'is-warn' : ''}`}>
                    <strong>Forecast:</strong>{' '}
                    {w === Infinity
                      ? 'no growth trend yet.'
                      : w === 0
                        ? 'already above 80 % on at least one resource — order hardware now.'
                        : `about ${num(w)} weeks until the first resource reaches 80 %, at ${Math.round(c.weeklyGrowth * 1000) / 10}% growth a week.`}
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      </PageSection>
    </>
  );
}
