import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyAccessToken } from '@/lib/auth/tokens';

export const runtime = 'nodejs';

function orgDashboardBaseUrl(): string {
  const fromEnv = process.env.ORG_DASHBOARD_API_URL;
  if (fromEnv && fromEnv.trim().length > 0) return fromEnv.replace(/\/$/, '');
  return 'http://localhost:4010';
}

type PartnerProgramRow = {
  id: string;
  label: string;
  slug: string | null;
  isActive: boolean;
  notes: string | null;
  enabledFeatures: string[];
};

type ProgramsResponse = {
  partnerId: string;
  programs: PartnerProgramRow[];
};

export default async function PartnerProgramsPage() {
  const token = cookies().get('session')?.value;
  if (!token) redirect('/login');

  let auth: ReturnType<typeof verifyAccessToken>;
  try {
    auth = verifyAccessToken(token);
  } catch {
    redirect('/login');
  }

  if (!auth.partnerId || !auth.partnerRole) {
    return (
      <div className="panel panelPad">
        <h1 className="h1" style={{ fontSize: 28, marginBottom: 8 }}>
          Partner programs
        </h1>
        <p className="subhead">Partner staff access is required to view institutional programs.</p>
      </div>
    );
  }

  const base = orgDashboardBaseUrl();
  const res = await fetch(`${base}/api/partner/programs`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });

  if (!res.ok) {
    return (
      <div className="panel panelPad">
        <h1 className="h1" style={{ fontSize: 28, marginBottom: 8 }}>
          Partner programs
        </h1>
        <p className="subhead">Could not load programs ({res.status}).</p>
      </div>
    );
  }

  const data = (await res.json()) as ProgramsResponse;

  return (
    <div className="panel panelPad">
      <h1 className="h1" style={{ fontSize: 28, marginBottom: 8 }}>
        Institutional programs
      </h1>
      <p className="subhead" style={{ marginBottom: 16 }}>
        Named cohorts and feature packaging for this partner ({data.programs.length} program
        {data.programs.length === 1 ? '' : 's'}).
      </p>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(0,0,0,0.12)' }}>
              <th style={{ padding: '8px 6px' }}>Label</th>
              <th style={{ padding: '8px 6px' }}>Active</th>
              <th style={{ padding: '8px 6px' }}>Enabled features</th>
              <th style={{ padding: '8px 6px' }}>Notes</th>
            </tr>
          </thead>
          <tbody>
            {data.programs.map(p => (
              <tr key={p.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                <td style={{ padding: '8px 6px' }}>{p.label}</td>
                <td style={{ padding: '8px 6px' }}>{p.isActive ? 'yes' : 'no'}</td>
                <td style={{ padding: '8px 6px', fontFamily: 'monospace', fontSize: 12 }}>
                  {p.enabledFeatures.length > 0 ? p.enabledFeatures.join(', ') : '—'}
                </td>
                <td style={{ padding: '8px 6px', maxWidth: 280, fontSize: 13 }}>
                  {p.notes ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ fontSize: 13, marginTop: 16 }}>
        <a href="/dashboard/partner/portfolio">← Portfolio</a>
        {' · '}
        <a href="/dashboard">Dashboard</a>
      </p>
    </div>
  );
}
