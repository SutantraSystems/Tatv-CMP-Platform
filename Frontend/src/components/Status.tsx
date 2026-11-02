import { Label } from '@patternfly/react-core';
import { PENDING_NAME, type OperationStatus, type Resource, type ResourceStatus } from '../api/types';

type Colour = 'green' | 'blue' | 'orange' | 'red' | 'grey' | 'purple';

const COLOURS: Record<string, Colour> = {
  active: 'green',
  succeeded: 'green',
  provisioning: 'blue',
  running: 'blue',
  starting: 'blue',
  stopping: 'blue',
  deleting: 'blue',
  upgrading: 'blue',
  failing_over: 'blue',
  scaling: 'blue',
  decommissioning: 'blue',
  restoring: 'blue',
  purging: 'blue',
  decommissioned: 'purple',
  awaiting_approval: 'orange',
  stopped: 'grey',
  deleted: 'grey',
  rejected: 'red',
  failed: 'red',
  error: 'red',
};

const TEXT: Partial<Record<string, string>> = { active: 'Running', awaiting_approval: 'Awaiting approval', failing_over: 'Failing over', scaling: 'Changing replicas' };

export const statusText = (status: string) => {
  const t = TEXT[status] ?? status.replace(/_/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
};
export const statusColour = (status: string): Colour => COLOURS[status] ?? 'grey';

export function StatusLabel({ status }: { status: ResourceStatus | OperationStatus }) {
  return <Label color={statusColour(status)}>{statusText(status)}</Label>;
}

/** Coloured dot and text, as used under resource names in lists. */
export function StatusDot({ status }: { status: ResourceStatus }) {
  const c = statusColour(status);
  return (
    <span className={`status-dot status-dot--${c}`}>
      <span className="dot" aria-hidden="true" />
      {statusText(status)}
    </span>
  );
}

/** Shown while a decommission or permanent-deletion request waits for approval. */
export function PendingLabel({ r }: { r: Resource }) {
  if (!r.pending) return null;
  return (
    <Label color="orange" isCompact>
      {PENDING_NAME[r.pending.action] ?? 'Request'} awaiting approval
    </Label>
  );
}
