import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from '../../apps/web/node_modules/react-dom/server.node';

const mockCookiesGet = vi.fn();
const mockVerifyAccessToken = vi.fn();
const mockRedirect = vi.fn((path: string) => {
  throw new Error(`redirect:${path}`);
});

vi.mock('next/headers', () => ({
  cookies: () => ({
    get: mockCookiesGet,
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
}));

vi.mock('@/lib/auth/tokens', () => ({
  verifyAccessToken: mockVerifyAccessToken,
}));

describe('audit prep dashboard page', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockCookiesGet.mockReset();
    mockVerifyAccessToken.mockReset();
    mockRedirect.mockClear();
    mockCookiesGet.mockReturnValue({ name: 'session', value: 'test-token' });
    mockVerifyAccessToken.mockReturnValue({
      userId: 'user-1',
      orgId: 'org-1',
      role: 'user',
    });
  });

  it('renders audit prep dashboard sections from tracked audit workflow data', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      orgId: 'org-1',
      disclaimer: 'Internal preparation tracking only. This is not an audit opinion, certification, or auditor sign-off.',
      items: [
        {
          id: 'item-1',
          category: 'PRIOR_YEAR_FINDING_REMEDIATION',
          title: 'Remediate prior-year finding controls',
          status: 'BLOCKED',
          targetDate: '2026-02-01T00:00:00.000Z',
          assignee: 'Alex',
          evidenceReference: null,
        },
        {
          id: 'item-2',
          category: 'PRIOR_YEAR_FINDING_REMEDIATION',
          title: 'Document remediation evidence',
          status: 'IN_PROGRESS',
          targetDate: '2026-02-15T00:00:00.000Z',
          assignee: 'Jamie',
          evidenceReference: null,
        },
        {
          id: 'item-3',
          category: 'GOVERNANCE_BOARD_MINUTES',
          title: 'Board minutes package',
          status: 'COMPLETE',
          targetDate: null,
          assignee: null,
          evidenceReference: 'drive://audit/minutes',
        },
      ],
      summary: {
        totalItems: 3,
        openItems: 2,
        blockedItems: 1,
        overdueItems: 2,
        overallStatus: 'blocked',
        explanation: [
          'Open items: 2 of 3 total.',
          '1 item(s) are blocked.',
          '2 open item(s) are past their target date.',
        ],
      },
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));

    const { default: AuditPrepDashboardPage } = await import(
      '../../apps/web/src/app/(dashboard)/dashboard/audit-prep/page'
    );
    const element = await AuditPrepDashboardPage();
    const html = renderToStaticMarkup(element);

    expect(html).toContain('Audit prep dashboard');
    expect(html).toContain('Overall audit readiness rollup');
    expect(html).toContain('Status:</b> Blocked');
    expect(html).toContain('Total items:</b> 3');
    expect(html).toContain('Open items:</b> 2');
    expect(html).toContain('Overdue items:</b> 2');
    expect(html).toContain('Blocked items:</b> 1');
    expect(html).toContain('Checklist category progress');
    expect(html).toContain('Governance Board Minutes: 1/1 complete (100%)');
    expect(html).toContain('Prior Year Finding Remediation: 0/2 complete (0%)');
    expect(html).toContain('Prior-year finding remediation');
    expect(html).toContain('Total prior-year items:</b> 2');
    expect(html).toContain('Open:</b> 2');
    expect(html).toContain('Blocked:</b> 1');
    expect(html).toContain('Overdue:</b> 2');
    expect(html).toContain('Rollup explanation');
    expect(html).toContain('1 item(s) are blocked.');
    expect(html).toContain('2 open item(s) are past their target date.');
    expect(html).toContain('Open audit prep items');
    expect(html).toContain('Remediate prior-year finding controls');
    expect(html).toContain('Document remediation evidence');
    expect(html).toContain('This is not an audit opinion, certification, or auditor sign-off.');
  });
});
