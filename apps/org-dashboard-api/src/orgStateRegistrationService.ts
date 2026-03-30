import prisma from '@magnus/db/client';
import type { OrgStateRegistration, StateRegistrationStatus } from '@magnus/db/types';

type RiskSeverity = 'high' | 'medium';

export type StateRegistrationRiskCode =
  | 'MISSING_REGISTRATION'
  | 'OVERDUE_RENEWAL'
  | 'UNKNOWN_STATUS';

export interface StateRegistrationRiskFlag {
  code: StateRegistrationRiskCode;
  severity: RiskSeverity;
  message: string;
  generatedBy: 'system';
}

export interface StateRegistrationRecord {
  stateCode: string;
  stateName: string;
  trackedStatus: 'active' | 'pending' | 'not_registered' | 'unknown';
  userEntered: {
    solicitsDonations: boolean;
    renewalDueDate: string | null;
    renewalNotes: string | null;
    updatedAt: string;
  };
  riskFlags: StateRegistrationRiskFlag[];
}

export interface StateRegistrationSummary {
  trackedStates: number;
  solicitationStates: number;
  activeStates: number;
  pendingStates: number;
  missingRegistrationStates: number;
  overdueRenewals: number;
  unknownStates: number;
  highRiskStates: number;
}

export interface OrgStateRegistrationSnapshot {
  orgId: string;
  asOf: string;
  summary: StateRegistrationSummary;
  registrations: StateRegistrationRecord[];
  disclaimer: string;
}

export interface StateRegistrationUpsertInput {
  status: StateRegistrationStatus;
  solicitsDonations: boolean;
  renewalDueDate?: Date | null;
  renewalNotes?: string | null;
}

export class StateRegistrationInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StateRegistrationInputError';
  }
}

export class StateRegistrationNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StateRegistrationNotFoundError';
  }
}

const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama',
  AK: 'Alaska',
  AZ: 'Arizona',
  AR: 'Arkansas',
  CA: 'California',
  CO: 'Colorado',
  CT: 'Connecticut',
  DE: 'Delaware',
  FL: 'Florida',
  GA: 'Georgia',
  HI: 'Hawaii',
  ID: 'Idaho',
  IL: 'Illinois',
  IN: 'Indiana',
  IA: 'Iowa',
  KS: 'Kansas',
  KY: 'Kentucky',
  LA: 'Louisiana',
  ME: 'Maine',
  MD: 'Maryland',
  MA: 'Massachusetts',
  MI: 'Michigan',
  MN: 'Minnesota',
  MS: 'Mississippi',
  MO: 'Missouri',
  MT: 'Montana',
  NE: 'Nebraska',
  NV: 'Nevada',
  NH: 'New Hampshire',
  NJ: 'New Jersey',
  NM: 'New Mexico',
  NY: 'New York',
  NC: 'North Carolina',
  ND: 'North Dakota',
  OH: 'Ohio',
  OK: 'Oklahoma',
  OR: 'Oregon',
  PA: 'Pennsylvania',
  RI: 'Rhode Island',
  SC: 'South Carolina',
  SD: 'South Dakota',
  TN: 'Tennessee',
  TX: 'Texas',
  UT: 'Utah',
  VT: 'Vermont',
  VA: 'Virginia',
  WA: 'Washington',
  WV: 'West Virginia',
  WI: 'Wisconsin',
  WY: 'Wyoming',
  DC: 'District of Columbia',
};

export async function getOrgStateRegistrationSnapshot(
  orgId: string,
  asOf = new Date()
): Promise<OrgStateRegistrationSnapshot> {
  const rows = await prisma.orgStateRegistration.findMany({
    where: { orgId },
    orderBy: [{ stateCode: 'asc' }],
  });

  const registrations = rows.map(row => serializeStateRegistration(row, asOf));

  return {
    orgId,
    asOf: toDateString(asOf),
    summary: buildStateRegistrationSummary(registrations),
    registrations,
    disclaimer: 'Tracked status and renewal fields are user-entered. Risk flags are system-generated reminders, not legal advice.',
  };
}

export async function upsertOrgStateRegistration(
  orgId: string,
  stateCode: string,
  input: StateRegistrationUpsertInput
): Promise<StateRegistrationRecord> {
  validateStateRegistrationInput(input);
  const normalizedStateCode = normalizeStateCode(stateCode);

  const row = await prisma.orgStateRegistration.upsert({
    where: {
      orgId_stateCode: {
        orgId,
        stateCode: normalizedStateCode,
      },
    },
    create: {
      orgId,
      stateCode: normalizedStateCode,
      status: input.status,
      solicitsDonations: input.solicitsDonations,
      ...(input.renewalDueDate !== undefined ? { renewalDueDate: input.renewalDueDate } : {}),
      ...(input.renewalNotes !== undefined ? { renewalNotes: normalizeNotes(input.renewalNotes) } : {}),
    },
    update: {
      status: input.status,
      solicitsDonations: input.solicitsDonations,
      ...(input.renewalDueDate !== undefined ? { renewalDueDate: input.renewalDueDate } : {}),
      ...(input.renewalNotes !== undefined ? { renewalNotes: normalizeNotes(input.renewalNotes) } : {}),
    },
  });

  return serializeStateRegistration(row, new Date());
}

export async function deleteOrgStateRegistration(orgId: string, stateCode: string): Promise<void> {
  const normalizedStateCode = normalizeStateCode(stateCode);
  const deleted = await prisma.orgStateRegistration.deleteMany({
    where: { orgId, stateCode: normalizedStateCode },
  });

  if (deleted.count === 0) {
    throw new StateRegistrationNotFoundError('STATE_REGISTRATION_NOT_FOUND');
  }
}

export function buildStateRegistrationSummary(registrations: StateRegistrationRecord[]): StateRegistrationSummary {
  return {
    trackedStates: registrations.length,
    solicitationStates: registrations.filter(registration => registration.userEntered.solicitsDonations).length,
    activeStates: registrations.filter(registration => registration.trackedStatus === 'active').length,
    pendingStates: registrations.filter(registration => registration.trackedStatus === 'pending').length,
    missingRegistrationStates: registrations.filter(registration => hasRiskFlag(registration, 'MISSING_REGISTRATION')).length,
    overdueRenewals: registrations.filter(registration => hasRiskFlag(registration, 'OVERDUE_RENEWAL')).length,
    unknownStates: registrations.filter(registration => hasRiskFlag(registration, 'UNKNOWN_STATUS')).length,
    highRiskStates: registrations.filter(registration => registration.riskFlags.some(flag => flag.severity === 'high')).length,
  };
}

export function buildStateRegistrationRiskFlags(
  registration: Pick<OrgStateRegistration, 'stateCode' | 'status' | 'solicitsDonations' | 'renewalDueDate'>
    & { stateName?: string },
  asOf = new Date()
): StateRegistrationRiskFlag[] {
  const flags: StateRegistrationRiskFlag[] = [];
  const stateName = registration.stateName ?? getStateName(registration.stateCode);

  if (!registration.solicitsDonations) {
    return flags;
  }

  if (registration.status === 'NOT_REGISTERED') {
    flags.push({
      code: 'MISSING_REGISTRATION',
      severity: 'high',
      message: `${stateName} is marked as a solicitation state with no registration on file.`,
      generatedBy: 'system',
    });
  }

  if (registration.status === 'UNKNOWN') {
    flags.push({
      code: 'UNKNOWN_STATUS',
      severity: 'medium',
      message: `${stateName} is a solicitation state with an unknown registration status.`,
      generatedBy: 'system',
    });
  }

  if (
    registration.renewalDueDate &&
    registration.renewalDueDate < asOf &&
    registration.status !== 'NOT_REGISTERED' &&
    registration.status !== 'UNKNOWN'
  ) {
    flags.push({
      code: 'OVERDUE_RENEWAL',
      severity: 'high',
      message: `${stateName} renewal date ${toDateString(registration.renewalDueDate)} is overdue.`,
      generatedBy: 'system',
    });
  }

  return flags;
}

function serializeStateRegistration(row: OrgStateRegistration, asOf: Date): StateRegistrationRecord {
  return {
    stateCode: row.stateCode,
    stateName: getStateName(row.stateCode),
    trackedStatus: row.status.toLowerCase() as StateRegistrationRecord['trackedStatus'],
    userEntered: {
      solicitsDonations: row.solicitsDonations,
      renewalDueDate: row.renewalDueDate ? toDateString(row.renewalDueDate) : null,
      renewalNotes: row.renewalNotes ?? null,
      updatedAt: toDateString(row.updatedAt),
    },
    riskFlags: buildStateRegistrationRiskFlags(row, asOf),
  };
}

function validateStateRegistrationInput(input: StateRegistrationUpsertInput): void {
  if (input.renewalDueDate === undefined) return;
  if (input.renewalDueDate && Number.isNaN(input.renewalDueDate.getTime())) {
    throw new StateRegistrationInputError('renewal_due_date_invalid');
  }
}

function normalizeStateCode(stateCode: string): string {
  const normalized = stateCode.trim().toUpperCase();
  if (!Object.prototype.hasOwnProperty.call(STATE_NAMES, normalized)) {
    throw new StateRegistrationInputError('state_code_invalid');
  }
  return normalized;
}

function getStateName(stateCode: string): string {
  return STATE_NAMES[normalizeStateCode(stateCode)]!;
}

function normalizeNotes(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function hasRiskFlag(registration: StateRegistrationRecord, code: StateRegistrationRiskCode): boolean {
  return registration.riskFlags.some(flag => flag.code === code);
}

function toDateString(value: Date): string {
  return value.toISOString().slice(0, 10);
}
