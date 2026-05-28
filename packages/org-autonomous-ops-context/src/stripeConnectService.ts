import type { PrismaClient, StripeConnectOnboardingStatus } from '@magnus/db/types';

export type StripeConnectAccountSnapshot = {
  id: string;
  detailsSubmitted: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  requirementsCurrentlyDue: string[];
  requirementsEventuallyDue: string[];
  disabledReason: string | null;
  country: string | null;
  defaultCurrency: string | null;
};

export type StripeConnectOnboardingLink = {
  url: string;
  expiresAt: Date;
};

export type StripeConnectGateway = {
  createAccount(orgId: string): Promise<StripeConnectAccountSnapshot>;
  retrieveAccount(stripeAccountId: string): Promise<StripeConnectAccountSnapshot>;
  createOnboardingLink(params: {
    stripeAccountId: string;
    returnUrl: string;
    refreshUrl: string;
  }): Promise<StripeConnectOnboardingLink>;
};

export type StripeConnectStatusDto = {
  orgId: string;
  connected: boolean;
  stripeAccountId: string | null;
  onboardingStatus: StripeConnectOnboardingStatus | null;
  detailsSubmitted: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  requirementsCurrentlyDue: string[];
  requirementsEventuallyDue: string[];
  disabledReason: string | null;
  country: string | null;
  defaultCurrency: string | null;
  onboardingLinkLastCreatedAt: string | null;
  onboardingLinkExpiresAt: string | null;
};

export type StripeConnectLinkDto = StripeConnectStatusDto & {
  onboardingUrl: string;
};

function normalizeList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(v => typeof v === 'string') as string[];
}

function deriveStatusFromAccount(account: StripeConnectAccountSnapshot): StripeConnectOnboardingStatus {
  if (account.chargesEnabled && account.payoutsEnabled) return 'ENABLED';
  if (account.disabledReason) return 'RESTRICTED';
  if (account.detailsSubmitted || account.requirementsCurrentlyDue.length > 0) return 'IN_PROGRESS';
  return 'NOT_STARTED';
}

function deriveStatusForNewLink(account: StripeConnectAccountSnapshot): StripeConnectOnboardingStatus {
  const base = deriveStatusFromAccount(account);
  if (base === 'ENABLED' || base === 'RESTRICTED') return base;
  return 'LINK_CREATED';
}

function toStatusDto(orgId: string, row: any | null): StripeConnectStatusDto {
  if (!row) {
    return {
      orgId,
      connected: false,
      stripeAccountId: null,
      onboardingStatus: null,
      detailsSubmitted: false,
      chargesEnabled: false,
      payoutsEnabled: false,
      requirementsCurrentlyDue: [],
      requirementsEventuallyDue: [],
      disabledReason: null,
      country: null,
      defaultCurrency: null,
      onboardingLinkLastCreatedAt: null,
      onboardingLinkExpiresAt: null,
    };
  }

  return {
    orgId,
    connected: true,
    stripeAccountId: row.stripeAccountId,
    onboardingStatus: row.onboardingStatus,
    detailsSubmitted: row.detailsSubmitted,
    chargesEnabled: row.chargesEnabled,
    payoutsEnabled: row.payoutsEnabled,
    requirementsCurrentlyDue: normalizeList(row.requirementsCurrentlyDue),
    requirementsEventuallyDue: normalizeList(row.requirementsEventuallyDue),
    disabledReason: row.disabledReason,
    country: row.country,
    defaultCurrency: row.defaultCurrency,
    onboardingLinkLastCreatedAt: row.onboardingLinkLastCreatedAt ? row.onboardingLinkLastCreatedAt.toISOString() : null,
    onboardingLinkExpiresAt: row.onboardingLinkExpiresAt ? row.onboardingLinkExpiresAt.toISOString() : null,
  };
}

async function persistAccountState(params: {
  db: PrismaClient;
  orgId: string;
  account: StripeConnectAccountSnapshot;
  onboardingStatus: StripeConnectOnboardingStatus;
  onboardingLink?: StripeConnectOnboardingLink;
}): Promise<any> {
  const now = new Date();
  const row = await params.db.stripeConnectAccount.upsert({
    where: { orgId: params.orgId },
    create: {
      orgId: params.orgId,
      stripeAccountId: params.account.id,
      onboardingStatus: params.onboardingStatus,
      detailsSubmitted: params.account.detailsSubmitted,
      chargesEnabled: params.account.chargesEnabled,
      payoutsEnabled: params.account.payoutsEnabled,
      requirementsCurrentlyDue: params.account.requirementsCurrentlyDue,
      requirementsEventuallyDue: params.account.requirementsEventuallyDue,
      disabledReason: params.account.disabledReason,
      country: params.account.country,
      defaultCurrency: params.account.defaultCurrency,
      onboardingLinkLastCreatedAt: params.onboardingLink ? now : null,
      onboardingLinkExpiresAt: params.onboardingLink ? params.onboardingLink.expiresAt : null,
    },
    update: {
      stripeAccountId: params.account.id,
      onboardingStatus: params.onboardingStatus,
      detailsSubmitted: params.account.detailsSubmitted,
      chargesEnabled: params.account.chargesEnabled,
      payoutsEnabled: params.account.payoutsEnabled,
      requirementsCurrentlyDue: params.account.requirementsCurrentlyDue,
      requirementsEventuallyDue: params.account.requirementsEventuallyDue,
      disabledReason: params.account.disabledReason,
      country: params.account.country,
      defaultCurrency: params.account.defaultCurrency,
      onboardingLinkLastCreatedAt: params.onboardingLink ? now : undefined,
      onboardingLinkExpiresAt: params.onboardingLink ? params.onboardingLink.expiresAt : undefined,
    },
  });

  await params.db.organization.update({
    where: { id: params.orgId },
    data: { stripeAccountId: params.account.id },
    select: { id: true },
  });

  return row;
}

export async function getStripeConnectStatus(db: PrismaClient, orgId: string): Promise<StripeConnectStatusDto> {
  if (!orgId) throw new Error('ORG_CONTEXT_REQUIRED');

  const row = await db.stripeConnectAccount.findUnique({ where: { orgId } });
  return toStatusDto(orgId, row);
}

export async function createStripeConnectOnboardingLink(
  db: PrismaClient,
  gateway: StripeConnectGateway,
  params: { orgId: string; returnUrl: string; refreshUrl: string },
): Promise<StripeConnectLinkDto> {
  if (!params.orgId) throw new Error('ORG_CONTEXT_REQUIRED');

  const org = await db.organization.findUnique({
    where: { id: params.orgId },
    select: { id: true, stripeAccountId: true },
  });
  if (!org) throw new Error('ORG_NOT_FOUND');

  const existing = await db.stripeConnectAccount.findUnique({
    where: { orgId: params.orgId },
    select: { stripeAccountId: true },
  });

  let account: StripeConnectAccountSnapshot;
  if (existing?.stripeAccountId) {
    account = await gateway.retrieveAccount(existing.stripeAccountId);
  } else if (org.stripeAccountId) {
    account = await gateway.retrieveAccount(org.stripeAccountId);
  } else {
    account = await gateway.createAccount(params.orgId);
  }

  const link = await gateway.createOnboardingLink({
    stripeAccountId: account.id,
    returnUrl: params.returnUrl,
    refreshUrl: params.refreshUrl,
  });

  const row = await persistAccountState({
    db,
    orgId: params.orgId,
    account,
    onboardingStatus: deriveStatusForNewLink(account),
    onboardingLink: link,
  });

  return {
    ...toStatusDto(params.orgId, row),
    onboardingUrl: link.url,
  };
}

export async function refreshStripeConnectOnboardingLink(
  db: PrismaClient,
  gateway: StripeConnectGateway,
  params: { orgId: string; returnUrl: string; refreshUrl: string },
): Promise<StripeConnectLinkDto> {
  if (!params.orgId) throw new Error('ORG_CONTEXT_REQUIRED');

  const existing = await db.stripeConnectAccount.findUnique({
    where: { orgId: params.orgId },
    select: { stripeAccountId: true },
  });

  if (!existing?.stripeAccountId) {
    throw new Error('STRIPE_CONNECT_NOT_FOUND');
  }

  const account = await gateway.retrieveAccount(existing.stripeAccountId);
  const link = await gateway.createOnboardingLink({
    stripeAccountId: account.id,
    returnUrl: params.returnUrl,
    refreshUrl: params.refreshUrl,
  });

  const row = await persistAccountState({
    db,
    orgId: params.orgId,
    account,
    onboardingStatus: deriveStatusForNewLink(account),
    onboardingLink: link,
  });

  return {
    ...toStatusDto(params.orgId, row),
    onboardingUrl: link.url,
  };
}
