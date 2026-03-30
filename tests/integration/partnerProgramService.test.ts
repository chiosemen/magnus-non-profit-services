import { beforeEach, describe, expect, it, vi } from 'vitest';

const PARTNER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PROG_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

const portfolioSummaryMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    partnerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    disclaimer: 'd',
    organizations: [],
    filtersApplied: {},
    resultCount: 0,
  })
);

vi.mock('../../apps/org-dashboard-api/src/partnerPortfolioService', () => ({
  getPartnerPortfolioSummary: portfolioSummaryMock,
  PARTNER_PORTFOLIO_DISCLAIMER: 'd',
}));

const programs: Array<{
  id: string;
  partnerId: string;
  label: string;
  slug: string | null;
  isActive: boolean;
  notes: string | null;
  enabledFeatures: string[];
  createdAt: Date;
  updatedAt: Date;
}> = [];

const prismaMock = vi.hoisted(() => ({
  partnerProgram: {
    findMany: vi.fn(async (args: { where: { partnerId: string } }) =>
      programs.filter(p => p.partnerId === args.where.partnerId)
    ),
    findFirst: vi.fn(
      async (args: { where: { id?: string; partnerId?: string } }) =>
        programs.find(
          p =>
            (args.where.id === undefined || p.id === args.where.id) &&
            (args.where.partnerId === undefined || p.partnerId === args.where.partnerId)
        ) ?? null
    ),
    create: vi.fn(
      async (args: {
        data: {
          partnerId: string;
          label: string;
          slug: string | null;
          notes: string | null;
          enabledFeatures: string[];
          isActive: boolean;
        };
      }) => {
        const id = `prog-${programs.length + 1}`;
        const row = {
          id,
          ...args.data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        programs.push(row);
        return row;
      }
    ),
    update: vi.fn(
      async (args: {
        where: { id: string };
        data: {
          label?: string;
          slug?: string | null;
          notes?: string | null;
          isActive?: boolean;
          enabledFeatures?: { set: string[] };
        };
      }) => {
        const row = programs.find(p => p.id === args.where.id);
        if (!row) throw new Error('not found');
        const d = args.data;
        if (typeof d.label === 'string') row.label = d.label;
        if (Object.prototype.hasOwnProperty.call(d, 'slug')) row.slug = d.slug ?? null;
        if (Object.prototype.hasOwnProperty.call(d, 'notes')) row.notes = d.notes ?? null;
        if (typeof d.isActive === 'boolean') row.isActive = d.isActive;
        if (d.enabledFeatures?.set) row.enabledFeatures = [...d.enabledFeatures.set];
        row.updatedAt = new Date();
        return { ...row };
      }
    ),
  },
}));

vi.mock('@magnus/db/client', () => ({
  default: prismaMock,
  prisma: prismaMock,
}));

import {
  createPartnerProgram,
  getPartnerProgramSummary,
  listPartnerPrograms,
  PartnerProgramInputError,
  PartnerProgramNotFoundError,
  parsePartnerProgramCreateBody,
  updatePartnerProgram,
} from '../../apps/org-dashboard-api/src/partnerProgramService';

describe('partner program service', () => {
  beforeEach(() => {
    programs.length = 0;
    portfolioSummaryMock.mockClear();
    portfolioSummaryMock.mockResolvedValue({
      partnerId: PARTNER_ID,
      disclaimer: 'd',
      organizations: [],
      filtersApplied: {},
      resultCount: 0,
    });
  });

  it('creates and lists programs with validated enabledFeatures', async () => {
    const created = await createPartnerProgram(PARTNER_ID, {
      label: ' Fiscal 2026 ',
      enabledFeatures: ['grant_generator', 'compliance_calendar'],
    });
    expect(created.label).toBe('Fiscal 2026');
    expect(created.enabledFeatures).toEqual(['grant_generator', 'compliance_calendar']);
    const list = await listPartnerPrograms(PARTNER_ID);
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe(created.id);
  });

  it('rejects invalid enabled feature keys', async () => {
    await expect(
      createPartnerProgram(PARTNER_ID, { label: 'X', enabledFeatures: ['institutional_partner'] })
    ).rejects.toBeInstanceOf(PartnerProgramInputError);
  });

  it('updates program fields', async () => {
    const created = await createPartnerProgram(PARTNER_ID, { label: 'A', enabledFeatures: [] });
    const updated = await updatePartnerProgram(PARTNER_ID, created.id, {
      label: 'B',
      isActive: false,
      enabledFeatures: ['grant_generator'],
    });
    expect(updated.label).toBe('B');
    expect(updated.isActive).toBe(false);
    expect(updated.enabledFeatures).toEqual(['grant_generator']);
  });

  it('throws when updating missing program', async () => {
    await expect(
      updatePartnerProgram(PARTNER_ID, PROG_ID, { label: 'nope' })
    ).rejects.toBeInstanceOf(PartnerProgramNotFoundError);
  });

  it('getPartnerProgramSummary loads program and delegates portfolio with programId filter', async () => {
    programs.push({
      id: PROG_ID,
      partnerId: PARTNER_ID,
      label: 'Cohort',
      slug: null,
      isActive: true,
      notes: null,
      enabledFeatures: ['grant_generator'],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const out = await getPartnerProgramSummary(PARTNER_ID, PROG_ID, {
      role: 'PARTNER_VIEWER',
      includeInactive: false,
    });
    expect(out.program.label).toBe('Cohort');
    expect(portfolioSummaryMock).toHaveBeenCalledWith(
      PARTNER_ID,
      expect.objectContaining({ filters: { programId: PROG_ID } })
    );
  });

  it('parses create body', () => {
    const b = parsePartnerProgramCreateBody({
      label: ' L ',
      enabledFeatures: ['compliance_calendar'],
    });
    expect(b.label).toBe(' L ');
    expect(b.enabledFeatures).toEqual(['compliance_calendar']);
  });
});
