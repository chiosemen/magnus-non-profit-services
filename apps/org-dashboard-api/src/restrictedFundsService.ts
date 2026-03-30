import prisma from '@magnus/db/client';
import { z } from 'zod';
import { computeRestrictedFundStatus } from '@magnus/financial';

export const CreateRestrictedFundSchema = z.object({
  name: z.string().min(1).max(200),
  sourceName: z.string().min(1).max(200),
  totalRestrictedAmountUsd: z.number().finite().positive().max(100_000_000),
  restrictionPurpose: z.string().min(10).max(2000),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  allowableSpendCategories: z.array(z.object({
    code: z.string().min(1).max(50),
    label: z.string().min(1).max(120),
  }).strict()).max(50).default([]),
}).strict();

export const RecordUsageEventSchema = z.object({
  occurredAt: z.string().datetime(),
  amountUsd: z.number().finite().positive().max(100_000_000),
  categoryCode: z.string().min(1).max(50).optional(),
  memo: z.string().max(500).optional(),
}).strict();

export async function createRestrictedFund(params: {
  orgId: string;
  input: z.infer<typeof CreateRestrictedFundSchema>;
}) {
  const input = CreateRestrictedFundSchema.parse(params.input);

  const fund = await prisma.restrictedFund.create({
    data: {
      orgId: params.orgId,
      name: input.name,
      sourceName: input.sourceName,
      totalRestrictedAmount: input.totalRestrictedAmountUsd,
      restrictionPurpose: input.restrictionPurpose,
      startDate: new Date(input.startDate),
      endDate: new Date(input.endDate),
      allowableSpendCategories: input.allowableSpendCategories,
    },
  });

  return {
    id: fund.id,
    orgId: fund.orgId,
    name: fund.name,
    sourceName: fund.sourceName,
    totalRestrictedAmountUsd: Number(fund.totalRestrictedAmount),
    restrictionPurpose: fund.restrictionPurpose,
    startDate: fund.startDate.toISOString(),
    endDate: fund.endDate.toISOString(),
    allowableSpendCategories: fund.allowableSpendCategories as any,
    createdAt: fund.createdAt.toISOString(),
    updatedAt: fund.updatedAt.toISOString(),
  };
}

export async function listRestrictedFunds(orgId: string) {
  const funds = await prisma.restrictedFund.findMany({
    where: { orgId },
    orderBy: [{ createdAt: 'desc' }],
  });

  return funds.map(f => ({
    id: f.id,
    orgId: f.orgId,
    name: f.name,
    sourceName: f.sourceName,
    totalRestrictedAmountUsd: Number(f.totalRestrictedAmount),
    restrictionPurpose: f.restrictionPurpose,
    startDate: f.startDate.toISOString(),
    endDate: f.endDate.toISOString(),
    allowableSpendCategories: f.allowableSpendCategories as any,
    createdAt: f.createdAt.toISOString(),
    updatedAt: f.updatedAt.toISOString(),
  }));
}

export async function recordRestrictedFundUsageEvent(params: {
  orgId: string;
  restrictedFundId: string;
  input: z.infer<typeof RecordUsageEventSchema>;
}) {
  const input = RecordUsageEventSchema.parse(params.input);

  // Enforce org isolation via where clause.
  const fund = await prisma.restrictedFund.findFirst({
    where: { id: params.restrictedFundId, orgId: params.orgId },
    select: { id: true },
  });
  if (!fund) return null;

  const evt = await prisma.restrictedFundUsageEvent.create({
    data: {
      restrictedFundId: params.restrictedFundId,
      orgId: params.orgId,
      occurredAt: new Date(input.occurredAt),
      amount: input.amountUsd,
      categoryCode: input.categoryCode,
      memo: input.memo,
    },
  });

  return {
    id: evt.id,
    restrictedFundId: evt.restrictedFundId,
    orgId: evt.orgId,
    occurredAt: evt.occurredAt.toISOString(),
    amountUsd: Number(evt.amount),
    categoryCode: evt.categoryCode ?? undefined,
    memo: evt.memo ?? undefined,
    createdAt: evt.createdAt.toISOString(),
  };
}

export async function getRestrictedFundSummary(params: { orgId: string; restrictedFundId: string }) {
  const fund = await prisma.restrictedFund.findFirst({
    where: { id: params.restrictedFundId, orgId: params.orgId },
  });
  if (!fund) return null;

  const usage = await prisma.restrictedFundUsageEvent.findMany({
    where: { restrictedFundId: fund.id, orgId: params.orgId },
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

  return {
    fund: {
      id: fund.id,
      orgId: fund.orgId,
      name: fund.name,
      sourceName: fund.sourceName,
      totalRestrictedAmountUsd: Number(fund.totalRestrictedAmount),
      restrictionPurpose: fund.restrictionPurpose,
      startDate: fund.startDate.toISOString(),
      endDate: fund.endDate.toISOString(),
      allowableSpendCategories: fund.allowableSpendCategories as any,
      createdAt: fund.createdAt.toISOString(),
      updatedAt: fund.updatedAt.toISOString(),
    },
    usageEvents: usage.map(u => ({
      id: u.id,
      restrictedFundId: u.restrictedFundId,
      orgId: u.orgId,
      occurredAt: u.occurredAt.toISOString(),
      amountUsd: Number(u.amount),
      categoryCode: u.categoryCode ?? undefined,
      memo: u.memo ?? undefined,
      createdAt: u.createdAt.toISOString(),
    })),
    computed,
    caveat: 'This is restricted-fund tracking based on entered usage events; it is not a general ledger or GAAP-complete fund accounting.',
  };
}

