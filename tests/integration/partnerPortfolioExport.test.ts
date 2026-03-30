import { describe, expect, it } from 'vitest';
import type { PartnerPortfolioOrgRow } from '../../apps/org-dashboard-api/src/partnerPortfolioService';
import {
  partnerPortfolioExportFilename,
  partnerPortfolioRowsToCsv,
  PORTFOLIO_CSV_HEADERS,
  parsePortfolioExportSort,
  sortPartnerPortfolioRowsForExport,
} from '../../apps/org-dashboard-api/src/partnerPortfolioExport';

const baseSummary = {
  trackedStates: 1,
  solicitationStates: 2,
  activeStates: 3,
  pendingStates: 0,
  missingRegistrationStates: 0,
  overdueRenewals: 1,
  unknownStates: 0,
  highRiskStates: 0,
};

function makeRow(over: Partial<PartnerPortfolioOrgRow> & Pick<PartnerPortfolioOrgRow, 'orgId' | 'name'>): PartnerPortfolioOrgRow {
  return {
    membershipId: 'm1',
    orgId: over.orgId,
    name: over.name,
    ein: '123456789',
    subscriptionTier: 'STARTER',
    subscriptionStatus: 'ACTIVE',
    programId: over.programId ?? null,
    programLabel: over.programLabel ?? null,
    cohortLabel: over.cohortLabel ?? null,
    isActive: over.isActive ?? true,
    partnerNotes: over.partnerNotes ?? null,
    partnerTags: over.partnerTags ?? [],
    governance: over.governance ?? { complete: false, issueCount: 1, completionRate: 50 },
    stateRegistrations: over.stateRegistrations ?? { summary: { ...baseSummary } },
    auditPrep: over.auditPrep ?? {
      overallStatus: 'in_progress',
      openItems: 2,
      blockedItems: 0,
      overdueItems: 0,
      totalItems: 4,
    },
    ...over,
  };
}

describe('partnerPortfolioExport', () => {
  it('exports stable header order', () => {
    expect(PORTFOLIO_CSV_HEADERS[0]).toBe('program_id');
    expect(PORTFOLIO_CSV_HEADERS).toContain('portfolio_disclaimer');
    expect(PORTFOLIO_CSV_HEADERS.length).toBe(29);
  });

  it('maps row values and disclaimer column', () => {
    const row = makeRow({
      orgId: 'o1',
      name: 'Org One',
      programLabel: 'P1',
      partnerTags: ['a', 'b'],
    });
    const csv = partnerPortfolioRowsToCsv([row], 'Test disclaimer', { includeBom: false });
    const lines = csv.split(/\r?\n/).filter(Boolean);
    expect(lines.length).toBe(2);
    expect(lines[0]).toBe(PORTFOLIO_CSV_HEADERS.join(','));
    expect(lines[1]).toContain('Org One');
    expect(lines[1]).toContain('P1');
    expect(lines[1]).toContain('a;b');
    expect(lines[1]).toContain('Test disclaimer');
  });

  it('escapes commas and quotes in partner_notes', () => {
    const row = makeRow({
      orgId: 'o2',
      name: 'N',
      partnerNotes: 'say "hello", world',
    });
    const csv = partnerPortfolioRowsToCsv([row], 'D', { includeBom: false });
    const dataLine = csv.split(/\r?\n/).filter(Boolean)[1]!;
    expect(dataLine).toMatch(/"say ""hello"", world"/);
    const cols = parseCsvLine(dataLine);
    expect(cols.length).toBe(PORTFOLIO_CSV_HEADERS.length);
    expect(cols[10]).toBe('say "hello", world');
  });

  it('sort=program parser', () => {
    expect(parsePortfolioExportSort({})).toBe('default');
    expect(parsePortfolioExportSort({ sort: 'program' })).toBe('program');
    expect(parsePortfolioExportSort({ sort: 'PROGRAM' })).toBe('program');
  });

  it('sortPartnerPortfolioRowsForExport orders by program then name', () => {
    const rows = [
      makeRow({ orgId: 'a', name: 'Zebra', programLabel: 'B' }),
      makeRow({ orgId: 'b', name: 'Apple', programLabel: 'A' }),
      makeRow({ orgId: 'c', name: 'Mango', programLabel: null }),
    ];
    const sorted = sortPartnerPortfolioRowsForExport(rows, 'program');
    expect(sorted.map(r => r.programLabel)).toEqual(['A', 'B', null]);
    expect(sorted[0]!.name).toBe('Apple');
    expect(sorted[1]!.name).toBe('Zebra');
  });

  it('default sort leaves order unchanged', () => {
    const rows = [
      makeRow({ orgId: 'z', name: 'Z' }),
      makeRow({ orgId: 'a', name: 'A' }),
    ];
    const sorted = sortPartnerPortfolioRowsForExport(rows, 'default');
    expect(sorted.map(r => r.orgId)).toEqual(['z', 'a']);
  });

  it('partnerPortfolioExportFilename is safe and dated', () => {
    const d = new Date(Date.UTC(2026, 2, 15));
    const f = partnerPortfolioExportFilename('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', d);
    expect(f).toBe('partner-portfolio-aaaaaaaa-20260315.csv');
  });
});

/** Minimal CSV line parser for quoted fields (test helper). */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}
