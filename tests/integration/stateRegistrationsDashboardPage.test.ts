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

describe('state registrations dashboard page', () => {
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

  it('renders state registration dashboard sections from tracked records and deterministic flags', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      orgId: 'org-1',
      asOf: '2026-04-15',
      summary: {
        trackedStates: 3,
        solicitationStates: 3,
        activeStates: 1,
        pendingStates: 1,
        missingRegistrationStates: 1,
        overdueRenewals: 1,
        unknownStates: 1,
        highRiskStates: 2,
      },
      registrations: [
        {
          stateCode: 'CA',
          stateName: 'California',
          trackedStatus: 'not_registered',
          userEntered: {
            solicitsDonations: true,
            renewalDueDate: null,
            renewalNotes: 'Planning filing',
            updatedAt: '2026-04-01',
          },
          riskFlags: [
            {
              code: 'MISSING_REGISTRATION',
              severity: 'high',
              message: 'California is marked as a solicitation state with no registration on file.',
              generatedBy: 'system',
            },
          ],
        },
        {
          stateCode: 'NY',
          stateName: 'New York',
          trackedStatus: 'active',
          userEntered: {
            solicitsDonations: true,
            renewalDueDate: '2026-04-10',
            renewalNotes: 'Annual package pending',
            updatedAt: '2026-04-01',
          },
          riskFlags: [
            {
              code: 'OVERDUE_RENEWAL',
              severity: 'high',
              message: 'New York renewal date 2026-04-10 is overdue.',
              generatedBy: 'system',
            },
          ],
        },
        {
          stateCode: 'IL',
          stateName: 'Illinois',
          trackedStatus: 'unknown',
          userEntered: {
            solicitsDonations: true,
            renewalDueDate: '2026-05-01',
            renewalNotes: null,
            updatedAt: '2026-04-01',
          },
          riskFlags: [
            {
              code: 'UNKNOWN_STATUS',
              severity: 'medium',
              message: 'Illinois is a solicitation state with an unknown registration status.',
              generatedBy: 'system',
            },
          ],
        },
      ],
      disclaimer: 'Tracked status and renewal fields are user-entered. Risk flags are system-generated reminders, not legal advice.',
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));

    const { default: StateRegistrationsDashboardPage } = await import(
      '../../apps/web/src/app/(dashboard)/dashboard/state-registrations/page'
    );
    const element = await StateRegistrationsDashboardPage();
    const html = renderToStaticMarkup(element);

    expect(html).toContain('Multi-state registration dashboard');
    expect(html).toContain('Overall registration risk summary');
    expect(html).toContain('Tracked states:</b> 3');
    expect(html).toContain('High-risk states:</b> 2');
    expect(html).toContain('Status counts');
    expect(html).toContain('Registered (active + pending):</b> 2');
    expect(html).toContain('Overdue renewals:</b> 1');
    expect(html).toContain('Unknown status:</b> 1');
    expect(html).toContain('Missing registration:</b> 1');
    expect(html).toContain('Renewal risk flags (system-derived)');
    expect(html).toContain('Missing registration flags:</b> 1');
    expect(html).toContain('Overdue renewal flags:</b> 1');
    expect(html).toContain('Unknown status flags:</b> 1');
    expect(html).toContain('Nearest renewal deadlines');
    expect(html).toContain('New York (NY) - 2026-04-10 [overdue]');
    expect(html).toContain('Illinois (IL) - 2026-05-01');
    expect(html).toContain('State-by-state status table');
    expect(html).toContain('User-entered status');
    expect(html).toContain('System-derived risk flags');
    expect(html).toContain('Tracked status and renewal fields are user-entered. Risk flags are system-generated reminders, not legal advice.');
  });
});
