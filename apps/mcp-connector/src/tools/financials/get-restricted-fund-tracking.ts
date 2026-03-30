/**
 * Magnus MCP Tool — get-restricted-fund-tracking
 * Minimal restricted-fund tracking (deterministic; not GAAP fund accounting).
 */

import { z } from 'zod';
import prisma from '@magnus/db/client';
import { computeRestrictedFundStatus } from '@magnus/financial';

export const restrictedFundTrackingSchema = z.object({
  ein: z.string().min(9).describe('Organization EIN (used for org isolation validation)'),
  action: z.enum(['create_fund', 'record_usage', 'get_summary', 'list_funds']),
  fund: z.object({
    id: z.string().uuid().optional(),
    name: z.string().min(1).max(200).optional(),
    sourceName: z.string().min(1).max(200).optional(),
    totalRestrictedAmountUsd: z.number().finite().positive().max(100_000_000).optional(),
    restrictionPurpose: z.string().min(10).max(2000).optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    allowableSpendCategories: z.array(z.object({
      code: z.string().min(1).max(50),
      label: z.string().min(1).max(120),
    }).strict()).max(50).optional(),
  }).default({}),
  usage: z.object({
    occurredAt: z.string().datetime().optional(),
    amountUsd: z.number().finite().positive().max(100_000_000).optional(),
    categoryCode: z.string().min(1).max(50).optional(),
    memo: z.string().max(500).optional(),
  }).default({}),
}).strict();

export type RestrictedFundTrackingInput = z.infer<typeof restrictedFundTrackingSchema>;

export async function execute(input: RestrictedFundTrackingInput): Promise<string> {
  const parsed = restrictedFundTrackingSchema.parse(input);
  const ein = parsed.ein.replace(/\D/g, '');

  const org = await prisma.organization.findUnique({ where: { ein } });
  if (!org) return JSON.stringify({ error: 'ORG_NOT_FOUND' }, null, 2);

  if (parsed.action === 'list_funds') {
    const funds = await prisma.restrictedFund.findMany({ where: { orgId: org.id }, orderBy: [{ createdAt: 'desc' }] });
    return JSON.stringify({
      orgId: org.id,
      restrictedFunds: funds.map(f => ({
        id: f.id,
        name: f.name,
        sourceName: f.sourceName,
        totalRestrictedAmountUsd: Number(f.totalRestrictedAmount),
        restrictionPurpose: f.restrictionPurpose,
        startDate: f.startDate.toISOString(),
        endDate: f.endDate.toISOString(),
        allowableSpendCategories: f.allowableSpendCategories,
        createdAt: f.createdAt.toISOString(),
        updatedAt: f.updatedAt.toISOString(),
      })),
      caveat: 'Tracking only; not GAAP-complete accounting.',
    }, null, 2);
  }

  if (parsed.action === 'create_fund') {
    const f = parsed.fund;
    const missing = [
      !f.name ? 'name' : null,
      !f.sourceName ? 'sourceName' : null,
      !Number.isFinite(f.totalRestrictedAmountUsd ?? NaN) ? 'totalRestrictedAmountUsd' : null,
      !f.restrictionPurpose ? 'restrictionPurpose' : null,
      !f.startDate ? 'startDate' : null,
      !f.endDate ? 'endDate' : null,
    ].filter(Boolean);
    if (missing.length) {
      return JSON.stringify({ error: 'VALIDATION_ERROR', missing }, null, 2);
    }
    const created = await prisma.restrictedFund.create({
      data: {
        orgId: org.id,
        name: f.name!,
        sourceName: f.sourceName!,
        totalRestrictedAmount: f.totalRestrictedAmountUsd!,
        restrictionPurpose: f.restrictionPurpose!,
        startDate: new Date(f.startDate!),
        endDate: new Date(f.endDate!),
        allowableSpendCategories: f.allowableSpendCategories ?? [],
      },
    });
    return JSON.stringify({ fundId: created.id }, null, 2);
  }

  const fundId = parsed.fund.id;
  if (!fundId) return JSON.stringify({ error: 'VALIDATION_ERROR', missing: ['fund.id'] }, null, 2);

  const fund = await prisma.restrictedFund.findFirst({ where: { id: fundId, orgId: org.id } });
  if (!fund) return JSON.stringify({ error: 'RESTRICTED_FUND_NOT_FOUND' }, null, 2);

  if (parsed.action === 'record_usage') {
    const u = parsed.usage;
    const missing = [
      !u.occurredAt ? 'usage.occurredAt' : null,
      !Number.isFinite(u.amountUsd ?? NaN) ? 'usage.amountUsd' : null,
    ].filter(Boolean);
    if (missing.length) return JSON.stringify({ error: 'VALIDATION_ERROR', missing }, null, 2);

    const evt = await prisma.restrictedFundUsageEvent.create({
      data: {
        restrictedFundId: fund.id,
        orgId: org.id,
        occurredAt: new Date(u.occurredAt!),
        amount: u.amountUsd!,
        ...(u.categoryCode !== undefined ? { categoryCode: u.categoryCode } : {}),
        ...(u.memo !== undefined ? { memo: u.memo } : {}),
      },
    });
    return JSON.stringify({ usageEventId: evt.id }, null, 2);
  }

  // get_summary
  const usage = await prisma.restrictedFundUsageEvent.findMany({
    where: { restrictedFundId: fund.id, orgId: org.id },
    orderBy: [{ occurredAt: 'asc' }],
  });
  const computed = computeRestrictedFundStatus({
    fund: {
      id: fund.id,
      totalRestrictedAmountUsd: Number(fund.totalRestrictedAmount),
      startDate: fund.startDate.toISOString(),
      endDate: fund.endDate.toISOString(),
    },
    usageEvents: usage.map(u => ({ amountUsd: Number(u.amount), occurredAt: u.occurredAt.toISOString() })),
  });

  return JSON.stringify({
    fund: {
      id: fund.id,
      name: fund.name,
      sourceName: fund.sourceName,
      totalRestrictedAmountUsd: Number(fund.totalRestrictedAmount),
      restrictionPurpose: fund.restrictionPurpose,
      startDate: fund.startDate.toISOString(),
      endDate: fund.endDate.toISOString(),
      allowableSpendCategories: fund.allowableSpendCategories,
    },
    usageEvents: usage.map(u => ({
      id: u.id,
      occurredAt: u.occurredAt.toISOString(),
      amountUsd: Number(u.amount),
      categoryCode: u.categoryCode ?? undefined,
      memo: u.memo ?? undefined,
    })),
    computed,
    caveat: 'Tracking only; not GAAP-complete accounting.',
  }, null, 2);
}

export default { name: 'get-restricted-fund-tracking', schema: restrictedFundTrackingSchema, execute };

