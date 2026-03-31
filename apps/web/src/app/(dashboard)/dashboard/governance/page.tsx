import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyAccessToken } from '@/lib/auth/tokens';
import React from 'react';

export const runtime = 'nodejs';

type GovernanceIssue = {
  code: string;
  severity: 'high' | 'medium';
  status: 'missing' | 'stale';
  message: string;
  memberId?: string;
  memberName?: string;
  policyKey?: 'conflictOfInterestPolicy' | 'whistleblowerPolicy' | 'documentRetentionPolicy';
  form990Reference: string;
};

type GovernanceSnapshot = {
  orgId: string;
  boardMembers: Array<{
    id: string;
    name: string;
    officerRole: string | null;
    termStart: string | null;
    termEnd: string | null;
    conflictDisclosureSignedAt: string | null;
    attendanceSummary: {
      meetingsHeld: number | null;
      meetingsAttended: number | null;
      attendanceRate: number | null;
    };
  }>;
  policyChecklist: Array<{
    key: 'conflictOfInterestPolicy' | 'whistleblowerPolicy' | 'documentRetentionPolicy';
    title: string;
    enabled: boolean;
    form990Reference: string;
  }>;
  readiness: {
    complete: boolean;
    completionRate: number;
    completedChecks: number;
    totalChecks: number;
    issueCount: number;
    missingItems: number;
    staleItems: number;
    issues: GovernanceIssue[];
  };
};

function orgDashboardBaseUrl(): string {
  const fromEnv = process.env.ORG_DASHBOARD_API_URL;
  if (fromEnv && fromEnv.trim().length > 0) return fromEnv.replace(/\/$/, '');
  return 'http://localhost:4010';
}

function formatOfficerRole(role: string): string {
  return role
    .toLowerCase()
    .split('_')
    .map(word => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(' ');
}

function isCurrentCalendarYear(dateString: string | null, asOf: Date): boolean {
  if (!dateString) return false;
  const signedAt = new Date(`${dateString}T00:00:00.000Z`);
  return signedAt.getUTCFullYear() === asOf.getUTCFullYear();
}

export default async function GovernanceDashboardPage() {
  const token = cookies().get('session')?.value;
  if (!token) redirect('/login');

  try {
    verifyAccessToken(token);
  } catch {
    redirect('/login');
  }

  const response = await fetch(`${orgDashboardBaseUrl()}/api/org/governance`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });

  if (!response.ok) {
    return (
      <div className="panel panelPad">
        <h1 className="h1" style={{ fontSize: 28, marginBottom: 8 }}>
          Governance dashboard
        </h1>
        <p className="subhead">Could not load governance records ({response.status}).</p>
        <p style={{ fontSize: 13, marginTop: 16 }}>
          <a href="/dashboard">Back to dashboard</a>
        </p>
      </div>
    );
  }

  const snapshot = (await response.json()) as GovernanceSnapshot;
  const asOf = new Date();
  const rosterCount = snapshot.boardMembers.length;
  const membersWithOfficerRole = snapshot.boardMembers.filter(member => member.officerRole !== null);
  const membersWithTermMissing = snapshot.boardMembers.filter(member => !member.termStart || !member.termEnd);
  const membersWithExpiredTerm = snapshot.boardMembers.filter(member => {
    if (!member.termEnd) return false;
    return new Date(`${member.termEnd}T00:00:00.000Z`) < asOf;
  });
  const membersWithCurrentDisclosure = snapshot.boardMembers.filter(member =>
    isCurrentCalendarYear(member.conflictDisclosureSignedAt, asOf)
  );
  const membersWithStaleDisclosure = snapshot.boardMembers.filter(member => {
    if (!member.conflictDisclosureSignedAt) return false;
    return !isCurrentCalendarYear(member.conflictDisclosureSignedAt, asOf);
  });
  const membersWithMissingDisclosure = snapshot.boardMembers.filter(member => !member.conflictDisclosureSignedAt);
  const membersWithAttendanceSummary = snapshot.boardMembers.filter(member =>
    member.attendanceSummary.meetingsHeld !== null && member.attendanceSummary.meetingsAttended !== null
  );
  const totalMeetingsHeld = snapshot.boardMembers.reduce((sum, member) => {
    if (member.attendanceSummary.meetingsHeld === null) return sum;
    return sum + member.attendanceSummary.meetingsHeld;
  }, 0);
  const totalMeetingsAttended = snapshot.boardMembers.reduce((sum, member) => {
    if (member.attendanceSummary.meetingsAttended === null) return sum;
    return sum + member.attendanceSummary.meetingsAttended;
  }, 0);
  const aggregateAttendanceRate = totalMeetingsHeld > 0
    ? Number(((totalMeetingsAttended / totalMeetingsHeld) * 100).toFixed(1))
    : null;

  const officerRoleCounts = membersWithOfficerRole.reduce<Record<string, number>>((acc, member) => {
    const role = member.officerRole!;
    acc[role] = (acc[role] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="panel panelPad">
      <h1 className="h1" style={{ fontSize: 32, marginBottom: 8 }}>
        Governance dashboard
      </h1>
      <p className="subhead" style={{ marginBottom: 16 }}>
        Board and governance readiness derived from tracked roster, policy, disclosure, term, and attendance records.
      </p>

      <div className="cards">
        <div className="card">
          <div className="cardTitle">Overall governance readiness</div>
          <p className="cardBody"><b>Status:</b> {snapshot.readiness.complete ? 'ready' : 'action needed'}</p>
          <p className="cardBody"><b>Completion:</b> {snapshot.readiness.completionRate}%</p>
          <p className="cardBody"><b>Checks:</b> {snapshot.readiness.completedChecks} / {snapshot.readiness.totalChecks}</p>
          <p className="cardBody"><b>Issues:</b> {snapshot.readiness.issueCount} ({snapshot.readiness.missingItems} missing, {snapshot.readiness.staleItems} stale)</p>
          <p className="cardBody" style={{ fontSize: 12 }}>
            Readiness is computed by the governance API from tracked checks; completion rate = completed checks / total checks.
          </p>
        </div>

        <div className="card">
          <div className="cardTitle">Board roster summary</div>
          <p className="cardBody"><b>Board members:</b> {rosterCount}</p>
          <p className="cardBody"><b>Members with officer roles:</b> {membersWithOfficerRole.length}</p>
        </div>

        <div className="card">
          <div className="cardTitle">Officer role summary</div>
          {Object.keys(officerRoleCounts).length === 0 ? (
            <p className="cardBody">No officer roles recorded.</p>
          ) : (
            <ul style={{ margin: '8px 0 0 18px', fontSize: 14 }}>
              {Object.entries(officerRoleCounts)
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([role, count]) => (
                  <li key={role}>{formatOfficerRole(role)}: {count}</li>
                ))}
            </ul>
          )}
        </div>

        <div className="card">
          <div className="cardTitle">Term expiration visibility</div>
          <p className="cardBody"><b>Missing term dates:</b> {membersWithTermMissing.length}</p>
          <p className="cardBody"><b>Expired terms:</b> {membersWithExpiredTerm.length}</p>
          <p className="cardBody"><b>Current terms:</b> {Math.max(rosterCount - membersWithTermMissing.length - membersWithExpiredTerm.length, 0)}</p>
        </div>

        <div className="card">
          <div className="cardTitle">Conflict-of-interest disclosures (annual)</div>
          <p className="cardBody"><b>Current year on file:</b> {membersWithCurrentDisclosure.length}</p>
          <p className="cardBody"><b>Stale:</b> {membersWithStaleDisclosure.length}</p>
          <p className="cardBody"><b>Missing:</b> {membersWithMissingDisclosure.length}</p>
        </div>

        <div className="card">
          <div className="cardTitle">Meeting attendance summary</div>
          <p className="cardBody"><b>Members with attendance summary:</b> {membersWithAttendanceSummary.length} / {rosterCount}</p>
          <p className="cardBody"><b>Aggregate attendance:</b> {aggregateAttendanceRate === null ? 'not available' : `${aggregateAttendanceRate}%`}</p>
          <p className="cardBody"><b>Meetings attended / held:</b> {totalMeetingsAttended} / {totalMeetingsHeld}</p>
        </div>

        <div className="card">
          <div className="cardTitle">Policy checklist status</div>
          <ul style={{ margin: '8px 0 0 18px', fontSize: 14 }}>
            {snapshot.policyChecklist.map(policy => (
              <li key={policy.key}>
                {policy.title}: {policy.enabled ? 'complete' : 'missing'}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="cardTitle">Board roster details</div>
        {snapshot.boardMembers.length === 0 ? (
          <p className="cardBody">No board members recorded yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(0,0,0,0.12)' }}>
                  <th style={{ padding: '8px 6px' }}>Name</th>
                  <th style={{ padding: '8px 6px' }}>Officer role</th>
                  <th style={{ padding: '8px 6px' }}>Term</th>
                  <th style={{ padding: '8px 6px' }}>COI disclosure</th>
                  <th style={{ padding: '8px 6px' }}>Attendance</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.boardMembers.map(member => (
                  <tr key={member.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                    <td style={{ padding: '8px 6px' }}>{member.name}</td>
                    <td style={{ padding: '8px 6px' }}>
                      {member.officerRole ? formatOfficerRole(member.officerRole) : '—'}
                    </td>
                    <td style={{ padding: '8px 6px' }}>
                      {member.termStart && member.termEnd ? `${member.termStart} to ${member.termEnd}` : 'Incomplete'}
                    </td>
                    <td style={{ padding: '8px 6px' }}>{member.conflictDisclosureSignedAt ?? 'Missing'}</td>
                    <td style={{ padding: '8px 6px' }}>
                      {member.attendanceSummary.attendanceRate === null
                        ? 'Missing'
                        : `${member.attendanceSummary.attendanceRate}% (${member.attendanceSummary.meetingsAttended}/${member.attendanceSummary.meetingsHeld})`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="cardTitle">Missing and stale governance items</div>
        {snapshot.readiness.issues.length === 0 ? (
          <p className="cardBody">No missing or stale governance issues were found.</p>
        ) : (
          <ul style={{ margin: '8px 0 0 18px', fontSize: 14 }}>
            {snapshot.readiness.issues.map((issue, index) => (
              <li key={`${issue.code}-${issue.memberId ?? issue.policyKey ?? 'global'}-${index}`}>
                [{issue.status}] {issue.message}
              </li>
            ))}
          </ul>
        )}
      </div>

      <p style={{ fontSize: 13, marginTop: 16 }}>
        <a href="/dashboard">Back to dashboard</a>
      </p>
    </div>
  );
}
