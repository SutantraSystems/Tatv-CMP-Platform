import { ExclamationCircleIcon, ExclamationTriangleIcon, InfoCircleIcon } from '@patternfly/react-icons';
import type { AlertSeverity } from './tenant';

const SEV_ICON: Record<AlertSeverity, JSX.Element> = {
  critical: <ExclamationCircleIcon color="#c9190b" />,
  warning: <ExclamationTriangleIcon color="#d48a00" />,
  info: <InfoCircleIcon color="#4a74d8" />,
};
const SEV_NAME: Record<AlertSeverity, string> = { critical: 'Critical', warning: 'Warning', info: 'Info' };

export function AlertSev({ severity }: { severity: AlertSeverity }) {
  return (
    <span className="obs-alert-sev">
      {SEV_ICON[severity]} {SEV_NAME[severity]}
    </span>
  );
}
