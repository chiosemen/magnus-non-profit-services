import type { PrismaClient, CampaignStatus } from '@magnus/db/types';
import { Prisma as PrismaRuntime } from '@magnus/db/types';

type CampaignRow = {
  id: string;
  orgId: string;
  title: string;
  slug: string;
  description: string | null;
  status: CampaignStatus;
  goalAmount: { toString(): string } | null;
  currency: string;
  startsAt: Date | null;
  endsAt: Date | null;
  publishedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CampaignDto = {
  id: string;
  orgId: string;
  title: string;
  slug: string;
  description: string | null;
  status: CampaignStatus;
  goalAmount: string | null;
  currency: string;
  startsAt: string | null;
  endsAt: string | null;
  publishedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateCampaignInput = {
  title: string;
  slug?: string;
  description?: string | null;
  goalAmount?: number | string | null;
  currency?: string;
  startsAt?: Date | null;
  endsAt?: Date | null;
};

export type UpdateCampaignInput = {
  title?: string;
  slug?: string;
  description?: string | null;
  goalAmount?: number | string | null;
  currency?: string;
  startsAt?: Date | null;
  endsAt?: Date | null;
};

function normalizeSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

function normalizeCurrency(value: string | undefined): string {
  const cleaned = (value ?? 'USD').trim().toUpperCase();
  if (!cleaned) return 'USD';
  if (cleaned.length > 8) throw new Error('CAMPAIGN_CURRENCY_INVALID');
  return cleaned;
}

function normalizeTitle(value: string): string {
  const title = value.trim();
  if (!title) throw new Error('CAMPAIGN_TITLE_REQUIRED');
  return title;
}

function normalizeGoalAmount(value: number | string | null | undefined): string | null {
  if (value === undefined) return null;
  if (value === null) return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Error('CAMPAIGN_GOAL_AMOUNT_INVALID');
  return n.toFixed(2);
}

function assertDateRange(startsAt: Date | null | undefined, endsAt: Date | null | undefined): void {
  if (!startsAt || !endsAt) return;
  if (endsAt.getTime() < startsAt.getTime()) throw new Error('CAMPAIGN_DATE_RANGE_INVALID');
}

function toDto(row: CampaignRow): CampaignDto {
  return {
    id: row.id,
    orgId: row.orgId,
    title: row.title,
    slug: row.slug,
    description: row.description,
    status: row.status,
    goalAmount: row.goalAmount ? row.goalAmount.toString() : null,
    currency: row.currency,
    startsAt: row.startsAt ? row.startsAt.toISOString() : null,
    endsAt: row.endsAt ? row.endsAt.toISOString() : null,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listCampaigns(db: PrismaClient, orgId: string): Promise<CampaignDto[]> {
  if (!orgId) throw new Error('ORG_CONTEXT_REQUIRED');

  const rows = await db.campaign.findMany({
    where: { orgId },
    orderBy: [{ createdAt: 'desc' }],
  });

  return rows.map(toDto);
}

export async function createCampaign(
  db: PrismaClient,
  orgId: string,
  input: CreateCampaignInput,
): Promise<CampaignDto> {
  if (!orgId) throw new Error('ORG_CONTEXT_REQUIRED');

  const title = normalizeTitle(input.title);
  const slug = normalizeSlug(input.slug?.trim() || title);
  if (!slug) throw new Error('CAMPAIGN_SLUG_REQUIRED');

  const startsAt = input.startsAt ?? null;
  const endsAt = input.endsAt ?? null;
  assertDateRange(startsAt, endsAt);

  const goalAmount = normalizeGoalAmount(input.goalAmount);

  try {
    const row = await db.campaign.create({
      data: {
        orgId,
        title,
        slug,
        description: input.description?.trim() || null,
        goalAmount,
        currency: normalizeCurrency(input.currency),
        startsAt,
        endsAt,
      },
    });

    return toDto(row as CampaignRow);
  } catch (err) {
    if ((err instanceof PrismaRuntime.PrismaClientKnownRequestError && err.code === 'P2002') || (err as any)?.code === 'P2002') {
      throw new Error('CAMPAIGN_SLUG_DUPLICATE');
    }
    throw err;
  }
}

export async function getCampaignById(db: PrismaClient, orgId: string, campaignId: string): Promise<CampaignDto> {
  if (!orgId) throw new Error('ORG_CONTEXT_REQUIRED');
  if (!campaignId) throw new Error('CAMPAIGN_ID_REQUIRED');

  const row = await db.campaign.findFirst({ where: { id: campaignId, orgId } });
  if (!row) throw new Error('CAMPAIGN_NOT_FOUND');

  return toDto(row as CampaignRow);
}

export async function updateCampaign(
  db: PrismaClient,
  orgId: string,
  campaignId: string,
  input: UpdateCampaignInput,
): Promise<CampaignDto> {
  if (!orgId) throw new Error('ORG_CONTEXT_REQUIRED');
  if (!campaignId) throw new Error('CAMPAIGN_ID_REQUIRED');

  const existing = await db.campaign.findFirst({ where: { id: campaignId, orgId } });
  if (!existing) throw new Error('CAMPAIGN_NOT_FOUND');

  const startsAt = input.startsAt === undefined ? existing.startsAt : input.startsAt;
  const endsAt = input.endsAt === undefined ? existing.endsAt : input.endsAt;
  assertDateRange(startsAt, endsAt);

  const data: Record<string, unknown> = {};
  if (input.title !== undefined) data.title = normalizeTitle(input.title);
  if (input.slug !== undefined) {
    const slug = normalizeSlug(input.slug);
    if (!slug) throw new Error('CAMPAIGN_SLUG_REQUIRED');
    data.slug = slug;
  }
  if (input.description !== undefined) data.description = input.description?.trim() || null;
  if (input.goalAmount !== undefined) data.goalAmount = normalizeGoalAmount(input.goalAmount);
  if (input.currency !== undefined) data.currency = normalizeCurrency(input.currency);
  if (input.startsAt !== undefined) data.startsAt = input.startsAt;
  if (input.endsAt !== undefined) data.endsAt = input.endsAt;

  try {
    const row = await db.campaign.update({
      where: { id: campaignId },
      data,
    });

    return toDto(row as CampaignRow);
  } catch (err) {
    if ((err instanceof PrismaRuntime.PrismaClientKnownRequestError && err.code === 'P2002') || (err as any)?.code === 'P2002') {
      throw new Error('CAMPAIGN_SLUG_DUPLICATE');
    }
    throw err;
  }
}

export async function publishCampaign(db: PrismaClient, orgId: string, campaignId: string): Promise<CampaignDto> {
  if (!orgId) throw new Error('ORG_CONTEXT_REQUIRED');
  if (!campaignId) throw new Error('CAMPAIGN_ID_REQUIRED');

  const campaign = await db.campaign.findFirst({ where: { id: campaignId, orgId } });
  if (!campaign) throw new Error('CAMPAIGN_NOT_FOUND');
  if (campaign.status === 'ARCHIVED') throw new Error('CAMPAIGN_ARCHIVED_NOT_PUBLISHABLE');
  if (campaign.status === 'LIVE') return toDto(campaign as CampaignRow);

  const stripeConnect = await db.stripeConnectAccount.findUnique({
    where: { orgId },
    select: { onboardingStatus: true },
  });
  if (!stripeConnect || stripeConnect.onboardingStatus !== 'ENABLED') {
    throw new Error('STRIPE_CONNECT_NOT_ENABLED');
  }

  const row = await db.campaign.update({
    where: { id: campaignId },
    data: {
      status: 'LIVE',
      publishedAt: campaign.publishedAt ?? new Date(),
      archivedAt: null,
    },
  });

  return toDto(row as CampaignRow);
}

export async function archiveCampaign(db: PrismaClient, orgId: string, campaignId: string): Promise<CampaignDto> {
  if (!orgId) throw new Error('ORG_CONTEXT_REQUIRED');
  if (!campaignId) throw new Error('CAMPAIGN_ID_REQUIRED');

  const campaign = await db.campaign.findFirst({ where: { id: campaignId, orgId } });
  if (!campaign) throw new Error('CAMPAIGN_NOT_FOUND');
  if (campaign.status === 'ARCHIVED') return toDto(campaign as CampaignRow);

  const row = await db.campaign.update({
    where: { id: campaignId },
    data: {
      status: 'ARCHIVED',
      archivedAt: new Date(),
    },
  });

  return toDto(row as CampaignRow);
}
