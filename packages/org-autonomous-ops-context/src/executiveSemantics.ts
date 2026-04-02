import type { AlertSeverity } from '@magnus/db/types';

export type ExecutiveModuleKey =
  | 'autonomous_ops_settings'
  | 'org_context'
  | 'compliance_calendar'
  | 'grants'
  | 'alerts'
  | 'handoffs'
  | 'donor_ops'
  | 'volunteer_ops';

export type ModuleStateCode =
  | 'OK'
  | 'NOT_CONFIGURED'
  | 'INSUFFICIENT_DATA'
  | 'UNAVAILABLE'
  | 'NOT_APPLICABLE';

export type Severity = AlertSeverity;

export type DestinationStatus = 'IMPLEMENTED' | 'UNIMPLEMENTED_IN_REPO';

export type Destination = {
  /** UI-style path; may be unimplemented in this repo. */
  href: string;
  status: DestinationStatus;
};

export function severityRank(sev: Severity): number {
  if (sev === 'CRITICAL') return 4;
  if (sev === 'HIGH') return 3;
  if (sev === 'MED') return 2;
  return 1;
}

export function moduleStateRank(code: ModuleStateCode): number {
  // Higher = more urgent operator attention.
  if (code === 'UNAVAILABLE') return 5;
  if (code === 'NOT_CONFIGURED') return 4;
  if (code === 'INSUFFICIENT_DATA') return 3;
  if (code === 'NOT_APPLICABLE') return 1;
  return 0; // OK
}

export function isKnownSeverity(raw: unknown): raw is Severity {
  return raw === 'LOW' || raw === 'MED' || raw === 'HIGH' || raw === 'CRITICAL';
}

