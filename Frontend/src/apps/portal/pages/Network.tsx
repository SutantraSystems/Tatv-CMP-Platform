import { Card, CardBody, CardTitle, Content, DescriptionList, DescriptionListDescription, DescriptionListGroup, DescriptionListTerm, Label, PageSection, Title } from '@patternfly/react-core';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { CATALOG, regionName } from '@/shared/catalog/catalog';
import { useLive, useSession } from '../session';

export function Network() {
  const { api, project, region } = useSession();
  const resources = useLive(() => (project ? api.listResources(project.id) : Promise.resolve([])), [project?.id]);
  const attached = (resources ?? []).filter((r) => r.region === region && (r.addresses || r.endpoint) && r.status !== 'decommissioned').length;
  const upcoming = CATALOG.filter((c) => c.category === 'network' && c.publisher === 'Platform');
  return (
    <>
      <PageSection>
        <Title headingLevel="h1" size="2xl">
          VPC — network and security
        </Title>
        <Content component="p" className="muted">
          Every project gets a private network in each region. Self-service networks, security groups, load balancers and VPN are coming next.
        </Content>
      </PageSection>
      <PageSection className="tight-top">
        <div className="stat-grid stat-grid--2">
          <Card>
            <CardTitle>default-vpc · {regionName(region)}</CardTitle>
            <CardBody>
              <DescriptionList isHorizontal isCompact>
                <DescriptionListGroup>
                  <DescriptionListTerm>Address range</DescriptionListTerm>
                  <DescriptionListDescription>10.20.0.0/16</DescriptionListDescription>
                </DescriptionListGroup>
                <DescriptionListGroup>
                  <DescriptionListTerm>Project</DescriptionListTerm>
                  <DescriptionListDescription>{project?.name}</DescriptionListDescription>
                </DescriptionListGroup>
                <DescriptionListGroup>
                  <DescriptionListTerm>Connected resources</DescriptionListTerm>
                  <DescriptionListDescription>{attached}</DescriptionListDescription>
                </DescriptionListGroup>
                <DescriptionListGroup>
                  <DescriptionListTerm>Internet egress</DescriptionListTerm>
                  <DescriptionListDescription>Through the platform NAT gateway</DescriptionListDescription>
                </DescriptionListGroup>
              </DescriptionList>
            </CardBody>
          </Card>
          <Card>
            <CardTitle>Subnets</CardTitle>
            <Table aria-label="Subnets" variant="compact">
              <Thead>
                <Tr>
                  <Th>Name</Th>
                  <Th>Range</Th>
                  <Th>Purpose</Th>
                </Tr>
              </Thead>
              <Tbody>
                <Tr>
                  <Td>app-subnet</Td>
                  <Td className="mono">10.20.0.0/20</Td>
                  <Td>VMs and Kubernetes nodes</Td>
                </Tr>
                <Tr>
                  <Td>data-subnet</Td>
                  <Td className="mono">10.20.16.0/20</Td>
                  <Td>Databases and file shares</Td>
                </Tr>
              </Tbody>
            </Table>
          </Card>
        </div>
      </PageSection>
      <PageSection className="tight-top">
        <Card>
          <CardTitle>Security group: default</CardTitle>
          <Table aria-label="Security group rules" variant="compact">
            <Thead>
              <Tr>
                <Th>Direction</Th>
                <Th>Protocol and port</Th>
                <Th>Source or destination</Th>
                <Th>Purpose</Th>
              </Tr>
            </Thead>
            <Tbody>
              <Tr>
                <Td>Inbound</Td>
                <Td>All</Td>
                <Td className="mono">10.20.0.0/16</Td>
                <Td>Traffic inside the VPC</Td>
              </Tr>
              <Tr>
                <Td>Inbound</Td>
                <Td>TCP 443</Td>
                <Td className="mono">0.0.0.0/0</Td>
                <Td>HTTPS to resources with a public IP</Td>
              </Tr>
              <Tr>
                <Td>Outbound</Td>
                <Td>All</Td>
                <Td className="mono">0.0.0.0/0</Td>
                <Td>Internet access through NAT</Td>
              </Tr>
            </Tbody>
          </Table>
        </Card>
      </PageSection>
      <PageSection className="tight-top">
        <Title headingLevel="h2" size="lg" className="section-title">
          Coming next
        </Title>
        <div className="chip-row">
          {upcoming.map((c) => (
            <Label key={c.id} variant="outline">
              {c.name}
            </Label>
          ))}
        </div>
      </PageSection>
    </>
  );
}
