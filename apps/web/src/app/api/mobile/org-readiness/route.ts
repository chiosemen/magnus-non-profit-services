import { cookies } from 'next/headers';
import { verifyAccessToken } from '@/lib/auth/tokens';
import {
  mapAuditPrepToMobile,
  mapComplianceToMobile,
  mapGovernanceToMobile,
  mapOverviewToMobile,
  mapRestrictedFundsToMobile,
  MOBILE_READINESS_CAVEAT,
  type MobileOrgReadinessPayload,
  type SectionState,
} from '@/lib/mobileOrgReadinessDto';

export const runtime = 'nodejs';

function orgDashboardBaseUrl(): string {
  const fromEnv = process.env.ORG_DASHBOARD_API_URL;
  if (fromEnv && fromEnv.trim().length > 0) return fromEnv.replace(/\/$/, '');
  return 'http://localhost:4010';
}

function bearerFromRequest(req: Request): string | null {
  const auth = req.headers.get('authorization');
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const t = auth.slice(7).trim();
  return t.length > 0 ? t : null;
}

function resolveSessionToken(req: Request): string | null {
  return bearerFromRequest(req) ?? cookies().get('session')?.value ?? null;
}

async function fetchOrgJson(path: string, token: string): Promise<{ status: number; json: unknown }> {
  const res = await fetch(`${orgDashboardBaseUrl()}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const text = await res.text();
  let json: unknown = null;
  if (text.trim()) {
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      json = null;
    }
  }
  return { status: res.status, json };
}

function sectionFromFetch<T>(
  status: number,
  json: unknown,
  map: (body: unknown) => T | null,
  forbiddenMessage: string
): SectionState<T> {
  if (status === 403) {
    return { available: false, reason: 'forbidden', message: forbiddenMessage };
  }
  if (status !== 200) {
    return {
      available: false,
      reason: 'upstream_error',
      message: 'Unable to load this section right now.',
    };
  }
  const data = map(json);
  if (!data) {
    return {
      available: false,
      reason: 'invalid_payload',
      message: 'Unexpected response from the organization service.',
    };
  }
  return { available: true, data };
}

export async function GET(req: Request) {
  const token = resolveSessionToken(req);
  if (!token) {
    return Response.json({ error: 'AUTH_REQUIRED' }, { status: 401 });
  }

  try {
    verifyAccessToken(token);
  } catch {
    return Response.json({ error: 'AUTH_INVALID' }, { status: 401 });
  }

  const [overview, compliance, governance, restrictedFunds, auditPrep] = await Promise.all([
    fetchOrgJson('/api/org/overview', token),
    fetchOrgJson('/api/org/compliance', token),
    fetchOrgJson('/api/org/governance', token),
    fetchOrgJson('/api/org/restricted-funds', token),
    fetchOrgJson('/api/org/audit-prep', token),
  ]);

  if (overview.status === 401 || compliance.status === 401) {
    return Response.json({ error: 'AUTH_REQUIRED' }, { status: 401 });
  }

  if (overview.status === 404) {
    return Response.json({ error: 'ORG_NOT_FOUND' }, { status: 404 });
  }

  const orgSection = sectionFromFetch(
    overview.status,
    overview.json,
    mapOverviewToMobile,
    'Organization overview is not available for this account.'
  );

  const payload: MobileOrgReadinessPayload = {
    org: orgSection,
    compliance: sectionFromFetch(
      compliance.status,
      compliance.json,
      mapComplianceToMobile,
      'Compliance calendar is not available for this account.'
    ),
    governance: sectionFromFetch(
      governance.status,
      governance.json,
      mapGovernanceToMobile,
      'Governance data is not available for this account.'
    ),
    restrictedFunds: sectionFromFetch(
      restrictedFunds.status,
      restrictedFunds.json,
      mapRestrictedFundsToMobile,
      'Restricted funds tracking is not enabled for this organization or subscription tier.'
    ),
    auditPrep: sectionFromFetch(
      auditPrep.status,
      auditPrep.json,
      mapAuditPrepToMobile,
      'Audit prep is not available for this account.'
    ),
    caveat: MOBILE_READINESS_CAVEAT,
  };

  return Response.json(payload);
}
