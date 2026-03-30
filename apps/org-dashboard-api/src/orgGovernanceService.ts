import prisma from '@magnus/db/client';
import type { BoardGovernanceMember, GovernanceOfficerRole, GovernanceProfile } from '@magnus/db/types';

type ReadinessSeverity = 'high' | 'medium';
type ReadinessStatus = 'missing' | 'stale';

export type GovernanceIssueCode =
  | 'BOARD_ROSTER_EMPTY'
  | 'OFFICER_ROLE_MISSING'
  | 'POLICY_MISSING'
  | 'TERM_MISSING'
  | 'TERM_EXPIRED'
  | 'CONFLICT_DISCLOSURE_MISSING'
  | 'CONFLICT_DISCLOSURE_STALE'
  | 'ATTENDANCE_SUMMARY_MISSING';

export interface GovernanceIssue {
  code: GovernanceIssueCode;
  severity: ReadinessSeverity;
  status: ReadinessStatus;
  message: string;
  memberId?: string;
  memberName?: string;
  policyKey?: GovernancePolicyKey;
  form990Reference: string;
}

export interface GovernanceReadinessSummary {
  complete: boolean;
  completionRate: number;
  completedChecks: number;
  totalChecks: number;
  issueCount: number;
  missingItems: number;
  staleItems: number;
  issues: GovernanceIssue[];
}

export type GovernancePolicyKey =
  | 'conflictOfInterestPolicy'
  | 'whistleblowerPolicy'
  | 'documentRetentionPolicy';

export interface GovernancePolicyChecklistItem {
  key: GovernancePolicyKey;
  title: string;
  enabled: boolean;
  form990Reference: string;
}

export interface GovernanceBoardMemberRecord {
  id: string;
  name: string;
  officerRole: GovernanceOfficerRole | null;
  termStart: string | null;
  termEnd: string | null;
  conflictDisclosureSignedAt: string | null;
  attendanceSummary: {
    meetingsHeld: number | null;
    meetingsAttended: number | null;
    attendanceRate: number | null;
  };
}

export interface OrgGovernanceSnapshot {
  orgId: string;
  boardMembers: GovernanceBoardMemberRecord[];
  policyChecklist: GovernancePolicyChecklistItem[];
  readiness: GovernanceReadinessSummary;
  form990Mappings: {
    boardRoster: string;
    officerRoles: string;
    conflictDisclosures: string;
    meetingAttendance: string;
    policyChecklist: string[];
  };
}

export interface GovernancePolicyUpdateInput {
  conflictOfInterestPolicy: boolean;
  whistleblowerPolicy: boolean;
  documentRetentionPolicy: boolean;
}

export interface BoardMemberCreateInput {
  name: string;
  officerRole?: GovernanceOfficerRole | null;
  termStart?: Date | null;
  termEnd?: Date | null;
  conflictDisclosureSignedAt?: Date | null;
  meetingsHeld?: number | null;
  meetingsAttended?: number | null;
}

export interface BoardMemberUpdateInput {
  name?: string;
  officerRole?: GovernanceOfficerRole | null;
  termStart?: Date | null;
  termEnd?: Date | null;
  conflictDisclosureSignedAt?: Date | null;
  meetingsHeld?: number | null;
  meetingsAttended?: number | null;
}

export class GovernanceInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GovernanceInputError';
  }
}

export class GovernanceNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GovernanceNotFoundError';
  }
}

const POLICY_DEFINITIONS: Array<Pick<GovernancePolicyChecklistItem, 'key' | 'title' | 'form990Reference'>> = [
  {
    key: 'conflictOfInterestPolicy',
    title: 'Conflict of Interest Policy',
    form990Reference: 'Form 990 Part VI, Section B, line 12a',
  },
  {
    key: 'whistleblowerPolicy',
    title: 'Whistleblower Policy',
    form990Reference: 'Form 990 Part VI, Section B, line 13',
  },
  {
    key: 'documentRetentionPolicy',
    title: 'Document Retention Policy',
    form990Reference: 'Form 990 Part VI, Section B, line 14',
  },
];

export async function getOrgGovernanceSnapshot(orgId: string, asOf = new Date()): Promise<OrgGovernanceSnapshot> {
  const [profile, members] = await Promise.all([
    prisma.governanceProfile.findUnique({ where: { orgId } }),
    prisma.boardGovernanceMember.findMany({
      where: { orgId },
      orderBy: [{ name: 'asc' }],
    }),
  ]);

  const boardMembers = members.map(serializeBoardMember);
  const policyChecklist = buildPolicyChecklist(profile);
  const readiness = buildGovernanceReadinessSummary(members, profile, asOf);

  return {
    orgId,
    boardMembers,
    policyChecklist,
    readiness,
    form990Mappings: {
      boardRoster: 'Supports Form 990 Part VI, Section A board roster and leadership records.',
      officerRoles: 'Supports Form 990 Part VI, Section A officer and key leadership disclosures.',
      conflictDisclosures: 'Supports Form 990 Part VI, Section B, line 12 conflict-of-interest administration.',
      meetingAttendance: 'Supports board oversight records used to answer governance diligence questions.',
      policyChecklist: POLICY_DEFINITIONS.map(item => `${item.title}: ${item.form990Reference}`),
    },
  };
}

export async function upsertGovernancePolicies(
  orgId: string,
  input: GovernancePolicyUpdateInput
): Promise<GovernancePolicyChecklistItem[]> {
  const profile = await prisma.governanceProfile.upsert({
    where: { orgId },
    create: {
      orgId,
      conflictOfInterestPolicy: input.conflictOfInterestPolicy,
      whistleblowerPolicy: input.whistleblowerPolicy,
      documentRetentionPolicy: input.documentRetentionPolicy,
    },
    update: {
      conflictOfInterestPolicy: input.conflictOfInterestPolicy,
      whistleblowerPolicy: input.whistleblowerPolicy,
      documentRetentionPolicy: input.documentRetentionPolicy,
    },
  });

  return buildPolicyChecklist(profile);
}

export async function createBoardGovernanceMember(
  orgId: string,
  input: BoardMemberCreateInput
): Promise<GovernanceBoardMemberRecord> {
  validateBoardMemberInput(input);

  const member = await prisma.boardGovernanceMember.create({
    data: {
      orgId,
      name: input.name.trim(),
      ...(input.officerRole !== undefined ? { officerRole: input.officerRole } : {}),
      ...(input.termStart !== undefined ? { termStart: input.termStart } : {}),
      ...(input.termEnd !== undefined ? { termEnd: input.termEnd } : {}),
      ...(input.conflictDisclosureSignedAt !== undefined
        ? { conflictDisclosureSignedAt: input.conflictDisclosureSignedAt }
        : {}),
      ...(input.meetingsHeld !== undefined ? { meetingsHeld: input.meetingsHeld } : {}),
      ...(input.meetingsAttended !== undefined ? { meetingsAttended: input.meetingsAttended } : {}),
    },
  });

  return serializeBoardMember(member);
}

export async function updateBoardGovernanceMember(
  orgId: string,
  memberId: string,
  input: BoardMemberUpdateInput
): Promise<GovernanceBoardMemberRecord> {
  validateBoardMemberInput(input, true);

  const existing = await prisma.boardGovernanceMember.findFirst({
    where: { id: memberId, orgId },
  });

  if (!existing) {
    throw new GovernanceNotFoundError('BOARD_MEMBER_NOT_FOUND');
  }

  const member = await prisma.boardGovernanceMember.update({
    where: { id: memberId },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.officerRole !== undefined ? { officerRole: input.officerRole } : {}),
      ...(input.termStart !== undefined ? { termStart: input.termStart } : {}),
      ...(input.termEnd !== undefined ? { termEnd: input.termEnd } : {}),
      ...(input.conflictDisclosureSignedAt !== undefined
        ? { conflictDisclosureSignedAt: input.conflictDisclosureSignedAt }
        : {}),
      ...(input.meetingsHeld !== undefined ? { meetingsHeld: input.meetingsHeld } : {}),
      ...(input.meetingsAttended !== undefined ? { meetingsAttended: input.meetingsAttended } : {}),
    },
  });

  return serializeBoardMember(member);
}

export async function deleteBoardGovernanceMember(orgId: string, memberId: string): Promise<void> {
  const deleted = await prisma.boardGovernanceMember.deleteMany({
    where: { id: memberId, orgId },
  });

  if (deleted.count === 0) {
    throw new GovernanceNotFoundError('BOARD_MEMBER_NOT_FOUND');
  }
}

export function buildGovernanceReadinessSummary(
  members: BoardGovernanceMember[],
  profile: GovernanceProfile | null,
  asOf = new Date()
): GovernanceReadinessSummary {
  const issues: GovernanceIssue[] = [];
  let completedChecks = 0;
  let totalChecks = 0;
  const disclosureYearStart = new Date(Date.UTC(asOf.getUTCFullYear(), 0, 1));

  totalChecks += 1;
  if (members.length > 0) {
    completedChecks += 1;
  } else {
    issues.push({
      code: 'BOARD_ROSTER_EMPTY',
      severity: 'high',
      status: 'missing',
      message: 'Board roster is empty. Add current directors before relying on governance readiness.',
      form990Reference: 'Form 990 Part VI, Section A board roster support',
    });
  }

  totalChecks += 1;
  if (members.some(member => member.officerRole !== null)) {
    completedChecks += 1;
  } else {
    issues.push({
      code: 'OFFICER_ROLE_MISSING',
      severity: 'medium',
      status: 'missing',
      message: 'No officer roles are assigned on the current board roster.',
      form990Reference: 'Form 990 Part VI, Section A officer disclosures',
    });
  }

  for (const policy of POLICY_DEFINITIONS) {
    totalChecks += 1;
    if (profile?.[policy.key]) {
      completedChecks += 1;
    } else {
      issues.push({
        code: 'POLICY_MISSING',
        severity: 'high',
        status: 'missing',
        message: `${policy.title} is not marked complete.`,
        policyKey: policy.key,
        form990Reference: policy.form990Reference,
      });
    }
  }

  for (const member of members) {
    totalChecks += 1;
    if (member.termStart && member.termEnd) {
      if (member.termEnd >= asOf) {
        completedChecks += 1;
      } else {
        issues.push({
          code: 'TERM_EXPIRED',
          severity: 'high',
          status: 'stale',
          message: `${member.name} has a recorded board term ending ${toDateString(member.termEnd)}.`,
          memberId: member.id,
          memberName: member.name,
          form990Reference: 'Form 990 Part VI, Section A current board leadership support',
        });
      }
    } else {
      issues.push({
        code: 'TERM_MISSING',
        severity: 'medium',
        status: 'missing',
        message: `${member.name} is missing a complete board term start/end record.`,
        memberId: member.id,
        memberName: member.name,
        form990Reference: 'Form 990 Part VI, Section A current board leadership support',
      });
    }

    totalChecks += 1;
    if (member.conflictDisclosureSignedAt) {
      if (member.conflictDisclosureSignedAt >= disclosureYearStart) {
        completedChecks += 1;
      } else {
        issues.push({
          code: 'CONFLICT_DISCLOSURE_STALE',
          severity: 'high',
          status: 'stale',
          message: `${member.name} has no current-year conflict disclosure on file.`,
          memberId: member.id,
          memberName: member.name,
          form990Reference: 'Form 990 Part VI, Section B, line 12 conflict-of-interest monitoring',
        });
      }
    } else {
      issues.push({
        code: 'CONFLICT_DISCLOSURE_MISSING',
        severity: 'high',
        status: 'missing',
        message: `${member.name} has no conflict-of-interest disclosure date on file.`,
        memberId: member.id,
        memberName: member.name,
        form990Reference: 'Form 990 Part VI, Section B, line 12 conflict-of-interest monitoring',
      });
    }

    totalChecks += 1;
    if (member.meetingsHeld !== null && member.meetingsAttended !== null) {
      completedChecks += 1;
    } else {
      issues.push({
        code: 'ATTENDANCE_SUMMARY_MISSING',
        severity: 'medium',
        status: 'missing',
        message: `${member.name} is missing an annual meeting attendance summary.`,
        memberId: member.id,
        memberName: member.name,
        form990Reference: 'Board oversight records supporting Form 990 governance disclosures',
      });
    }
  }

  return {
    complete: issues.length === 0,
    completionRate: totalChecks === 0 ? 100 : Math.round((completedChecks / totalChecks) * 100),
    completedChecks,
    totalChecks,
    issueCount: issues.length,
    missingItems: issues.filter(issue => issue.status === 'missing').length,
    staleItems: issues.filter(issue => issue.status === 'stale').length,
    issues,
  };
}

function buildPolicyChecklist(profile: GovernanceProfile | null): GovernancePolicyChecklistItem[] {
  return POLICY_DEFINITIONS.map(policy => ({
    key: policy.key,
    title: policy.title,
    enabled: profile?.[policy.key] ?? false,
    form990Reference: policy.form990Reference,
  }));
}

function serializeBoardMember(member: BoardGovernanceMember): GovernanceBoardMemberRecord {
  const attendanceRate = member.meetingsHeld !== null && member.meetingsAttended !== null && member.meetingsHeld > 0
    ? Number(((member.meetingsAttended / member.meetingsHeld) * 100).toFixed(1))
    : null;

  return {
    id: member.id,
    name: member.name,
    officerRole: member.officerRole,
    termStart: member.termStart ? toDateString(member.termStart) : null,
    termEnd: member.termEnd ? toDateString(member.termEnd) : null,
    conflictDisclosureSignedAt: member.conflictDisclosureSignedAt
      ? toDateString(member.conflictDisclosureSignedAt)
      : null,
    attendanceSummary: {
      meetingsHeld: member.meetingsHeld,
      meetingsAttended: member.meetingsAttended,
      attendanceRate,
    },
  };
}

function validateBoardMemberInput(
  input: BoardMemberCreateInput | BoardMemberUpdateInput,
  partial = false
): void {
  if (!partial || input.name !== undefined) {
    if (typeof input.name !== 'string' || input.name.trim().length === 0) {
      throw new GovernanceInputError('name_required');
    }
  }

  if (input.termStart && input.termEnd && input.termEnd < input.termStart) {
    throw new GovernanceInputError('term_end_before_term_start');
  }

  if (input.meetingsHeld !== undefined && input.meetingsHeld !== null && input.meetingsHeld < 0) {
    throw new GovernanceInputError('meetings_held_invalid');
  }

  if (input.meetingsAttended !== undefined && input.meetingsAttended !== null && input.meetingsAttended < 0) {
    throw new GovernanceInputError('meetings_attended_invalid');
  }

  if (
    input.meetingsHeld !== undefined &&
    input.meetingsHeld !== null &&
    input.meetingsAttended !== undefined &&
    input.meetingsAttended !== null &&
    input.meetingsAttended > input.meetingsHeld
  ) {
    throw new GovernanceInputError('meetings_attended_exceeds_held');
  }
}

function toDateString(value: Date): string {
  return value.toISOString().slice(0, 10);
}
