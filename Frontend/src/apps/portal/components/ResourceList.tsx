import {
  Alert,
  AlertActionCloseButton,
  Button,
  Card,
  CardBody,
  Content,
  Dropdown,
  DropdownItem,
  DropdownList,
  EmptyState,
  EmptyStateBody,
  FormSelect,
  FormSelectOption,
  Label,
  LabelGroup,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  MenuToggle,
  PageSection,
  SearchInput,
  Switch,
  TextInput,
  Title,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
} from '@patternfly/react-core';
import { ArchiveIcon, CubesIcon, PlayIcon, PlusCircleIcon, PowerOffIcon, TrashIcon, UndoIcon } from '@patternfly/react-icons';
import { ActionsColumn, Table, Tbody, Td, Th, Thead, Tr, type IAction } from '@patternfly/react-table';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { CATALOG, REGIONS, itemOf, regionName } from '@/shared/catalog/catalog';
import {
  APPROVAL_ACTIONS,
  ProblemError,
  RETENTION_DAYS,
  type Action,
  type LifecycleAction,
  type Problem,
  type Resource,
  type ResourceKind,
} from '@/shared/api/types';
import { newIdempotencyKey, useLive, useSession } from '../session';
import { PendingLabel, StatusDot } from '@/shared/ui/Status';

export const ACTION_LABELS: Record<Action, string> = {
  start: 'Start',
  stop: 'Shut down',
  reboot: 'Restart',
  snapshot: 'Take snapshot',
  backup: 'Back up now',
  upgrade: 'Upgrade to Kubernetes 1.33',
  failover: 'Fail over to a replica',
  decommission: 'Decommission',
  restore: 'Restore',
  purge: 'Delete permanently',
  'scale-replicas': 'Change read replicas',
};

/** States from which each lifecycle action is possible (the API enforces the same rules). */
export const FROM: Record<LifecycleAction, Resource['status'][]> = {
  stop: ['active'],
  start: ['stopped'],
  decommission: ['active', 'stopped', 'error'],
  restore: ['decommissioned'],
  purge: ['decommissioned'],
};

/** Whether a lifecycle action applies to this resource right now. */
export const canDo = (r: Resource, a: LifecycleAction) =>
  FROM[a].includes(r.status) && !r.pending && !((a === 'stop' || a === 'start') && itemOf(r.catalogItemId)?.powerControl === false);

export interface Column {
  title: string;
  render: (r: Resource) => ReactNode;
}

interface Props {
  kind: ResourceKind;
  title: string;
  intro: string;
  columns: Column[];
  emptyText: string;
  createItemId: string;
  createLabel: string;
  /** What shutting this kind of workload down means, shown in the confirmation. */
  shutdownNote: string;
  /** Summary cards above the list, computed from the rows in view. */
  summary?: (rows: Resource[]) => ReactNode;
  /** Label for the search field. */
  searchHint?: string;
  /** Several create options (e.g. block, file, object); replaces the single create button. */
  createOptions?: { itemId: string; label: string }[];
}

function CreateButton({ createItemId, createLabel, createOptions }: Pick<Props, 'createItemId' | 'createLabel' | 'createOptions'>) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  if (!createOptions)
    return (
      <Button variant="primary" icon={<PlusCircleIcon />} onClick={() => navigate(`/catalog/${createItemId}/create`)}>
        {createLabel}
      </Button>
    );
  return (
    <Dropdown
      isOpen={open}
      onOpenChange={setOpen}
      popperProps={{ position: 'right' }}
      toggle={(ref) => (
        <MenuToggle ref={ref} variant="primary" icon={<PlusCircleIcon />} onClick={() => setOpen((o) => !o)} isExpanded={open}>
          {createLabel}
        </MenuToggle>
      )}
    >
      <DropdownList>
        {createOptions.map((o) => (
          <DropdownItem key={o.itemId} onClick={() => navigate(`/catalog/${o.itemId}/create`)}>
            {o.label}
          </DropdownItem>
        ))}
      </DropdownList>
    </Dropdown>
  );
}

export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/** Request lifecycle actions for several workloads and collect per-workload problems. */
export function useLifecycle() {
  const { api, user } = useSession();
  const [problems, setProblems] = useState<Problem[]>([]);
  const [notice, setNotice] = useState<string>();
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(undefined), 8000);
    return () => clearTimeout(timer);
  }, [notice]);

  async function run(targets: Resource[], action: Action) {
    setProblems([]);
    const failed: Problem[] = [];
    let ok = 0;
    for (const r of targets) {
      try {
        await api.runAction(user!, r.id, action, newIdempotencyKey());
        ok++;
      } catch (e) {
        if (e instanceof ProblemError) failed.push({ ...e.problem, title: `${r.name}: ${e.problem.title}` });
        else throw e;
      }
    }
    setProblems(failed);
    if (ok) {
      const what = ok === 1 ? targets.find(() => true)?.name : `${ok} workloads`;
      setNotice(
        APPROVAL_ACTIONS.includes(action)
          ? `${ACTION_LABELS[action]} of ${what} submitted for approval. An organisation admin other than you must approve it under Activity and approvals.`
          : `${ACTION_LABELS[action]} requested for ${what}. Progress shows under Activity and approvals.`,
      );
    }
  }

  const messages = (
    <>
      {problems.map((p, i) => (
        <Alert
          key={i}
          variant="danger"
          isInline
          title={p.title}
          actionClose={<AlertActionCloseButton onClose={() => setProblems((ps) => ps.filter((_, j) => j !== i))} />}
          className="stack-gap"
        >
          {p.detail}
        </Alert>
      ))}
      {notice && <Alert variant="info" isInline title={notice} className="stack-gap" actionClose={<AlertActionCloseButton onClose={() => setNotice(undefined)} />} />}
    </>
  );
  return { run, messages };
}

/** Confirmation dialog for shut down, decommission and permanent deletion. */
export function LifecycleConfirm({
  confirm,
  onClose,
  onConfirm,
  shutdownNote,
}: {
  confirm?: { action: LifecycleAction; targets: Resource[] };
  onClose: () => void;
  onConfirm: (c: { action: LifecycleAction; targets: Resource[] }) => void;
  shutdownNote: string;
}) {
  const { t } = useTranslation();
  const [typed, setTyped] = useState('');
  useEffect(() => setTyped(''), [confirm]);
  const confirmText = confirm?.targets.length === 1 ? confirm.targets[0]!.name : 'DELETE';
  const needsApproval = !!confirm && APPROVAL_ACTIONS.includes(confirm.action);
  return (
    <Modal isOpen={!!confirm} onClose={onClose} variant="small" aria-labelledby="confirm-title">
      {confirm && (
        <>
          <ModalHeader
            title={`${ACTION_LABELS[confirm.action]} ${confirm.targets.length === 1 ? confirm.targets[0]!.name : `${confirm.targets.length} workloads`}?`}
            titleIconVariant={confirm.action === 'purge' ? 'danger' : 'warning'}
            labelId="confirm-title"
          />
          <ModalBody>
            {confirm.action === 'stop' && <p>{shutdownNote}</p>}
            {confirm.action === 'decommission' && (
              <>
                <p>
                  The workload is taken out of service and placed in a {RETENTION_DAYS}-day retention hold. Its compute and public-IP quota is released; its data is kept so it can be restored.
                </p>
                <p className="para-gap">After {RETENTION_DAYS} days it is permanently deleted automatically. Storage in the hold is billed until then.</p>
              </>
            )}
            {confirm.action === 'purge' && (
              <>
                <p>
                  Encryption keys are destroyed and all data, including volumes and snapshots, is crypto-erased. A certificate of sanitisation is issued. <strong>This cannot be undone.</strong>
                </p>
                <p className="para-gap">
                  Type <strong>{confirmText}</strong> to confirm.
                </p>
                <TextInput aria-label="Confirmation" value={typed} onChange={(_e, v) => setTyped(v)} className="para-gap" />
              </>
            )}
            {needsApproval && (
              <Alert
                variant="info"
                isInline
                isPlain
                className="para-gap"
                title="This needs approval. Nothing happens until an organisation admin other than you approves the request."
              />
            )}
            {confirm.targets.length > 1 && <p className="para-gap">Workloads: {confirm.targets.map((r) => r.name).join(', ')}.</p>}
          </ModalBody>
          <ModalFooter>
            <Button variant={confirm.action === 'stop' ? 'primary' : 'danger'} isDisabled={confirm.action === 'purge' && typed !== confirmText} onClick={() => onConfirm(confirm)}>
              {needsApproval ? 'Submit for approval' : ACTION_LABELS[confirm.action]}
            </Button>
            <Button variant="link" onClick={onClose}>
              {t('common.cancel')}
            </Button>
          </ModalFooter>
        </>
      )}
    </Modal>
  );
}

/** Shared list page: summary, filters, live status, bulk lifecycle toolbar, per-row actions, confirmations. */
export function ResourceList({ kind, title, intro, columns, emptyText, createItemId, createLabel, shutdownNote, summary, searchHint, createOptions }: Props) {
  const navigate = useNavigate();
  const { api, project, region, setRegion } = useSession();
  const { run, messages } = useLifecycle();
  const [selected, setSelected] = useState<string[]>([]);
  const [showDecommissioned, setShowDecommissioned] = useState(true);
  const [confirm, setConfirm] = useState<{ action: LifecycleAction; targets: Resource[] }>();
  const [q, setQ] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const items = useLive(() => (project ? api.listResources(project.id) : Promise.resolve([])), [project?.id]);

  const types = CATALOG.filter((c) => c.kind === kind);
  const ofKind = items?.filter((r) => itemOf(r.catalogItemId)?.kind === kind) ?? [];
  const all = ofKind.filter((r) => r.region === region);
  const elsewhere = REGIONS.filter((x) => x.id !== region).map((x) => ({ region: x, n: ofKind.filter((r) => r.region === x.id).length })).filter((x) => x.n);
  const matches = (r: Resource) => {
    const hay = `${r.name} ${r.id} ${r.addresses?.private ?? ''} ${r.addresses?.public ?? ''} ${r.endpoint ?? ''}`.toLowerCase();
    if (q && !hay.includes(q.toLowerCase())) return false;
    if (statusFilter !== 'all' && (statusFilter === 'pending' ? !(r.status === 'awaiting_approval' || r.pending) : r.status !== statusFilter)) return false;
    if (typeFilter !== 'all' && r.catalogItemId !== typeFilter) return false;
    return tags.every((t) => {
      const [k, v] = t.split(':');
      return r.tags[k!] !== undefined && (v === undefined || r.tags[k!] === v);
    });
  };
  const rows = all.filter((r) => (showDecommissioned || r.status !== 'decommissioned') && r.status !== 'rejected' && matches(r));
  const chosen = rows.filter((r) => selected.includes(r.id));
  const running = all.filter((r) => r.status === 'active').length;
  const stopped = all.filter((r) => r.status === 'stopped').length;
  const powered = types.some((t) => t.powerControl !== false);

  useEffect(() => {
    setSelected((s) => s.filter((id) => rows.some((r) => r.id === id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, showDecommissioned, q, statusFilter, typeFilter, tags.join(), region]);

  const eligible = (action: LifecycleAction, rs: Resource[]) => rs.filter((r) => canDo(r, action));
  const ask = (action: LifecycleAction, rs: Resource[]) => {
    const targets = eligible(action, rs);
    if (!targets.length) return;
    if (action === 'start' || action === 'restore') void run(targets, action).then(() => setSelected([]));
    else setConfirm({ action, targets });
  };

  const rowActions = (r: Resource): IAction[] => {
    const item = itemOf(r.catalogItemId);
    const life: LifecycleAction[] = item?.powerControl === false ? ['decommission', 'restore', 'purge'] : ['start', 'stop', 'decommission', 'restore', 'purge'];
    return [
      { title: 'View details', onClick: () => navigate(`/r/${r.id}`) },
      ...(item?.day2.length ? [{ isSeparator: true }] : []),
      ...(item?.day2 ?? []).map((a) => ({ title: ACTION_LABELS[a], isDisabled: !['active', 'stopped'].includes(r.status), onClick: () => void run([r], a) })),
      { isSeparator: true },
      ...life.map((a) => ({ title: ACTION_LABELS[a], isDanger: a === 'purge' || a === 'decommission', isDisabled: !canDo(r, a), onClick: () => ask(a, [r]) })),
    ];
  };

  const bulk = (action: LifecycleAction, icon: ReactNode, variant: 'secondary' | 'danger' | 'tertiary' = 'secondary') => {
    const n = eligible(action, chosen).length;
    return (
      <ToolbarItem>
        <Button variant={variant} icon={icon} isDisabled={n === 0} onClick={() => ask(action, chosen)}>
          {ACTION_LABELS[action]}
          {chosen.length > 1 && n > 0 ? ` (${n})` : ''}
        </Button>
      </ToolbarItem>
    );
  };

  const addTag = (raw: string) => {
    const t = raw.trim();
    if (/^[\w.-]+(:[\w.-]+)?$/.test(t) && t.includes(':') && !tags.includes(t)) {
      setTags([...tags, t]);
      setQ('');
      return true;
    }
    return false;
  };

  return (
    <>
      <PageSection>
        <div className="page-head">
          <div>
            <div className="title-row">
              <Title headingLevel="h1" size="2xl">
                {title}
              </Title>
              {powered && all.length > 0 && (
                <>
                  <Label color="green" isCompact>
                    {running} running
                  </Label>
                  <Label color="grey" isCompact>
                    {stopped} shut down
                  </Label>
                </>
              )}
            </div>
            <Content component="p" className="muted">
              {intro}
            </Content>
          </div>
          <CreateButton createItemId={createItemId} createLabel={createLabel} createOptions={createOptions} />
        </div>
      </PageSection>

      {summary && all.length > 0 && <PageSection className="tight-top">{summary(all.filter((r) => !['rejected', 'decommissioned'].includes(r.status)))}</PageSection>}

      <PageSection className="tight-top">
        {messages}
        {elsewhere.length > 0 && (
          <Content component="p" className="muted small stack-gap">
            Showing {regionName(region)}.{' '}
            {elsewhere.map((x) => (
              <Button key={x.region.id} variant="link" isInline onClick={() => setRegion(x.region.id)}>
                {x.n} more in {x.region.name}
              </Button>
            ))}
          </Content>
        )}

        {all.length === 0 && items ? (
          <Card>
            <EmptyState titleText={emptyText} headingLevel="h2" icon={CubesIcon}>
              <EmptyStateBody>Nothing here in the {regionName(region)} region yet.</EmptyStateBody>
              <CreateButton createItemId={createItemId} createLabel={createLabel} createOptions={createOptions} />
            </EmptyState>
          </Card>
        ) : (
          <>
            <Card className="filter-card">
              <CardBody>
                <div className="filter-row">
                  <SearchInput
                    className="filter-search"
                    placeholder={searchHint ?? 'Filter by name, ID or IP; type key:value for a tag'}
                    aria-label="Filter"
                    value={q}
                    onChange={(_e, v) => setQ(v)}
                    onClear={() => setQ('')}
                    onSearch={(_e, v) => void addTag(v)}
                  />
                  <FormSelect aria-label="Status" value={statusFilter} onChange={(_e, v) => setStatusFilter(v)} className="filter-select">
                    <FormSelectOption value="all" label="All statuses" />
                    <FormSelectOption value="active" label="Running" />
                    {powered && <FormSelectOption value="stopped" label="Shut down" />}
                    <FormSelectOption value="pending" label="Awaiting approval" />
                    <FormSelectOption value="decommissioned" label="Decommissioned" />
                  </FormSelect>
                  {types.length > 1 && (
                    <FormSelect aria-label="Type" value={typeFilter} onChange={(_e, v) => setTypeFilter(v)} className="filter-select">
                      <FormSelectOption value="all" label="All types" />
                      {types.map((t) => (
                        <FormSelectOption key={t.id} value={t.id} label={t.name} />
                      ))}
                    </FormSelect>
                  )}
                  <Switch id={`show-decom-${kind}`} label="Show decommissioned" isChecked={showDecommissioned} onChange={(_e, c) => setShowDecommissioned(c)} />
                </div>
                {(tags.length > 0 || q || statusFilter !== 'all' || typeFilter !== 'all') && (
                  <div className="filter-chips">
                    <span className="muted small">Active filters:</span>
                    <LabelGroup numLabels={8}>
                      {tags.map((t) => (
                        <Label key={t} variant="outline" isCompact onClose={() => setTags(tags.filter((x) => x !== t))}>
                          <code>{t}</code>
                        </Label>
                      ))}
                    </LabelGroup>
                    <Button
                      variant="link"
                      isInline
                      onClick={() => {
                        setTags([]);
                        setQ('');
                        setStatusFilter('all');
                        setTypeFilter('all');
                      }}
                    >
                      Clear all
                    </Button>
                  </div>
                )}
              </CardBody>
            </Card>

            <Card className="table-card">
              {chosen.length > 0 && (
                <Toolbar className="bulk-bar">
                  <ToolbarContent>
                    <ToolbarItem>
                      <strong>{chosen.length} selected</strong>
                    </ToolbarItem>
                    <ToolbarGroup>
                      {powered && bulk('start', <PlayIcon />)}
                      {powered && bulk('stop', <PowerOffIcon />)}
                      {bulk('decommission', <ArchiveIcon />, 'tertiary')}
                      {bulk('restore', <UndoIcon />)}
                      {bulk('purge', <TrashIcon />, 'danger')}
                    </ToolbarGroup>
                  </ToolbarContent>
                </Toolbar>
              )}
              <Table aria-label={title}>
                <Thead>
                  <Tr>
                    <Th
                      select={{
                        onSelect: (_e, isSelecting) => setSelected(isSelecting ? rows.map((r) => r.id) : []),
                        isSelected: rows.length > 0 && selected.length === rows.length,
                      }}
                      aria-label="Select all"
                    />
                    <Th>Name and status</Th>
                    <Th>ID</Th>
                    {columns.map((c) => (
                      <Th key={c.title}>{c.title}</Th>
                    ))}
                    <Th screenReaderText="Actions" />
                  </Tr>
                </Thead>
                <Tbody>
                  {rows.map((r, i) => (
                    <Tr key={r.id} isRowSelected={selected.includes(r.id)}>
                      <Td
                        select={{
                          rowIndex: i,
                          onSelect: (_e, isSelecting) => setSelected((s) => (isSelecting ? [...s, r.id] : s.filter((x) => x !== r.id))),
                          isSelected: selected.includes(r.id),
                        }}
                      />
                      <Td dataLabel="Name and status">
                        <Link to={`/r/${r.id}`} className="row-name">
                          {r.name}
                        </Link>
                        <div className="row-status">
                          <StatusDot status={r.status} /> <PendingLabel r={r} />
                        </div>
                        {r.retentionUntil && <div className="muted small">Restorable until {fmtDate(r.retentionUntil)}</div>}
                      </Td>
                      <Td dataLabel="ID">
                        <code className="id-chip">{r.id}</code>
                      </Td>
                      {columns.map((c) => (
                        <Td key={c.title} dataLabel={c.title}>
                          {r.status === 'decommissioned' && /endpoint|address/i.test(c.title) ? '—' : c.render(r)}
                        </Td>
                      ))}
                      <Td isActionCell>
                        <ActionsColumn items={rowActions(r)} />
                      </Td>
                    </Tr>
                  ))}
                  {rows.length === 0 && (
                    <Tr>
                      <Td colSpan={columns.length + 4}>
                        <span className="muted">No {title.toLowerCase()} match these filters.</span>
                      </Td>
                    </Tr>
                  )}
                </Tbody>
              </Table>
              <div className="table-foot muted small">
                Showing {rows.length} of {all.length} in {regionName(region)}
              </div>
            </Card>
          </>
        )}
      </PageSection>

      <LifecycleConfirm
        confirm={confirm}
        shutdownNote={shutdownNote}
        onClose={() => setConfirm(undefined)}
        onConfirm={(c) => {
          void run(c.targets, c.action).then(() => setSelected([]));
          setConfirm(undefined);
        }}
      />
    </>
  );
}
