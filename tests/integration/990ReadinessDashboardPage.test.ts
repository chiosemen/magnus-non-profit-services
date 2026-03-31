import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from '../../apps/web/node_modules/react-dom/server.node';
import { FORM_990_READINESS_CAVEAT } from '@magnus/reports';

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

describe('990 readiness dashboard page', () => {
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

  it('renders insufficient_data state without numeric scores', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      status: 'insufficient_data',
      message: 'No filing on file.',
      requiredFields: ['tax_year', 'filing.total_revenue'],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));

    const { default: Page } = await import(
      '../../apps/web/src/app/(dashboard)/dashboard/990-readiness/page'
    );
    const element = await Page();
    const html = renderToStaticMarkup(element);

    expect(html).toContain('Form 990');
    expect(html).toContain('funder readiness');
    expect(html).toContain('No filing on file.');
    expect(html).toContain('What we need');
    expect(html).toContain('tax_year');
    expect(html).not.toContain('/ 100');
  });

  it('renders ready panels, caveat, and report link from API contract', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      status: 'ready',
      orgId: 'org-1',
      ein: '123456789',
      name: 'North Star Youth Center',
      taxYear: 2024,
      caveat: FORM_990_READINESS_CAVEAT,
      overallScore: 80,
      explanation: 'Overall 990 Health Score is 80/100.',
      methodology: 'Deterministic weighted score using four transparent Form 990 metrics.',
      components: [
        {
          key: 'program_expense_ratio',
          title: 'Program Expense Ratio',
          score: 71,
          weight: 0.35,
          rating: 'stable',
          displayValue: '75.0%',
          formula: 'program_service_expenses / total_expenses',
          explanation: 'Program services explanation.',
        },
      ],
      watchouts: [
        { title: 'Executive compensation burden', detail: 'Detail one.', priority: 'medium' },
      ],
      recommendedActions: [
        { title: 'Tighten compensation support', detail: 'Detail two.', priority: 'medium' },
      ],
      reportHtml: '<html></html>',
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));

    const { default: Page } = await import(
      '../../apps/web/src/app/(dashboard)/dashboard/990-readiness/page'
    );
    const element = await Page();
    const html = renderToStaticMarkup(element);

    expect(html).toContain('990 health score');
    expect(html).toContain('80');
    expect(html).toContain('/ 100');
    expect(html).toContain('Overall 990 Health Score is 80/100.');
    expect(html).toContain('Sub-score breakdown');
    expect(html).toContain('Program Expense Ratio');
    expect(html).toContain('Top risks');
    expect(html).toContain('Executive compensation burden');
    expect(html).toContain('Recommended actions');
    expect(html).toContain('Tighten compensation support');
    expect(html).toContain(FORM_990_READINESS_CAVEAT);
    expect(html).toContain('Deterministic weighted score');
    expect(html).toContain('/api/dashboard/990-readiness/report');
  });
});
