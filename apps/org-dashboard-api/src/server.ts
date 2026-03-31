import 'dotenv/config';
import express, { Request, Response, NextFunction, Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createJwtAuthMiddleware } from '@magnus/auth/jwtAuth';
import { validateEnv } from '@magnus/config/envValidator';
import {
  requireFeature,
  FeatureNotEnabledError,
  AuthRequiredError,
  InvalidTokenError,
  SubscriptionNotActiveError,
} from '@magnus/subscription';
import { getOrgComplianceCalendar, getOrgGrants, getOrgOverview } from './orgReadService';
import Anthropic from '@anthropic-ai/sdk';
import {
  Form990NarrativeIntelligenceService,
  Form990NarrativeRequestSchema,
} from '@magnus/reports';
import {
  createRestrictedFund,
  CreateRestrictedFundSchema,
  getRestrictedFundSummary,
  listRestrictedFunds,
  recordRestrictedFundUsageEvent,
  RecordUsageEventSchema,
} from './restrictedFundsService';
import {
  BoardMemberCreateInput,
  BoardMemberUpdateInput,
  createBoardGovernanceMember,
  deleteBoardGovernanceMember,
  getOrgGovernanceSnapshot,
  GovernanceInputError,
  GovernanceNotFoundError,
  GovernancePolicyUpdateInput,
  upsertGovernancePolicies,
  updateBoardGovernanceMember,
} from './orgGovernanceService';
import {
  deleteOrgStateRegistration,
  getOrgStateRegistrationSnapshot,
  StateRegistrationInputError,
  StateRegistrationNotFoundError,
  StateRegistrationUpsertInput,
  upsertOrgStateRegistration,
} from './orgStateRegistrationService';
import {
  applyAuditPrepTemplate,
  AuditPrepInputError,
  AuditPrepNotFoundError,
  getOrgAuditPrepSnapshot,
  parseAuditPrepItemPatch,
  toOrgAuditPrepItemDto,
  updateOrgAuditPrepItem,
} from './orgAuditPrepService';
import { requirePartnerAdmin, requirePartnerContext } from './partnerAuthMiddleware';
import {
  createPartnerProgram,
  getPartnerProgramSummary,
  listPartnerPrograms,
  parsePartnerProgramCreateBody,
  parsePartnerProgramPatchBody,
  PartnerProgramInputError,
  PartnerProgramNotFoundError,
  updatePartnerProgram,
} from './partnerProgramService';
import {
  partnerPortfolioExportFilename,
  partnerPortfolioRowsToCsv,
  parsePortfolioExportSort,
  sortPartnerPortfolioRowsForExport,
} from './partnerPortfolioExport';
import {
  getPartnerPortfolioSummary,
  linkManagedOrganization,
  parseLinkManagedOrgBody,
  parsePartnerPortfolioListFiltersFromQuery,
  parseUpdateManagedOrgBody,
  PartnerPortfolioInputError,
  PartnerPortfolioNotFoundError,
  updateManagedOrganization,
} from './partnerPortfolioService';
import { getOrg990Readiness, putOrg990ReadinessFiling } from './org990ReadinessService';
import type { GovernanceOfficerRole, PartnerUserRole, StateRegistrationStatus } from '@magnus/db/types';
import { putForm990ReadinessFilingBodySchema } from '@magnus/reports';

try {
  validateEnv('org-dashboard-api');
} catch (err) {
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

const app: Application = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: false })); // API-first; caller should proxy in production.
app.use(express.json({ limit: '1mb' }));

const jwtAuth = createJwtAuthMiddleware();
const requireCompliance = requireFeature('compliance_calendar');
const requireGrants = requireFeature('grant_generator');
const requireRestrictedFunds = requireFeature('restricted_funds');
const requireInstitutionalPartner = requireFeature('institutional_partner');
const requirePartnerCtx = requirePartnerContext();
const requirePartnerAdminMw = requirePartnerAdmin();

app.get('/health', (_req, res) => res.json({ ok: true }));

function getAnthropicApiKey(): string {
  const key = process.env['ANTHROPIC_API_KEY'];
  if (!key || key.trim().length < 10) {
    throw new Error('ANTHROPIC_API_KEY_REQUIRED');
  }
  return key;
}

async function generateWithClaude(prompt: string): Promise<{ text: string }> {
  const client = new Anthropic({ apiKey: getAnthropicApiKey() });
  const out = await client.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 1400,
    temperature: 0,
    system:
      'You must follow grounding rules. Output must be strict JSON only. If you cannot comply, refuse.',
    messages: [{ role: 'user', content: prompt }],
  });
  const first = Array.isArray(out.content) ? out.content[0] : null;
  const text = first && first.type === 'text' ? first.text : '';
  return { text };
}

app.get('/api/org/overview', jwtAuth, requireCompliance, async (req, res, next) => {
  try {
    const orgId = (req as any).auth.orgId as string;
    const overview = await getOrgOverview({ orgId });
    if (!overview) return res.status(404).json({ error: 'ORG_NOT_FOUND' });
    return res.json({ organization: overview });
  } catch (err) {
    return next(err);
  }
});

app.get('/api/org/compliance', jwtAuth, requireCompliance, async (req, res, next) => {
  try {
    const orgId = (req as any).auth.orgId as string;
    const items = await getOrgComplianceCalendar(orgId);
    return res.json({ orgId, complianceCalendar: items });
  } catch (err) {
    return next(err);
  }
});

app.get('/api/org/grants', jwtAuth, requireGrants, async (req, res, next) => {
  try {
    const orgId = (req as any).auth.orgId as string;
    const items = await getOrgGrants(orgId);
    return res.json({ orgId, grants: items });
  } catch (err) {
    return next(err);
  }
});

app.post('/api/org/990/narrative', jwtAuth, requireCompliance, async (req, res, next) => {
  try {
    const orgId = (req as any).auth.orgId as string;
    void orgId; // Org scoping is already provided by JWT; request uses org input for narrative only.

    const parsed = Form990NarrativeRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', details: parsed.error.flatten().fieldErrors });
    }

    const service = new Form990NarrativeIntelligenceService();
    const result = await service.generate({
      input: parsed.data,
      llm: generateWithClaude,
    });

    return res.status(result.refused ? 422 : 200).json(result);
  } catch (err) {
    return next(err);
  }
});

app.get('/api/org/990/readiness', jwtAuth, requireCompliance, async (req, res, next) => {
  try {
    const orgId = (req as any).auth.orgId as string;
    const dto = await getOrg990Readiness(orgId);
    if (!dto) return res.status(404).json({ error: 'ORG_NOT_FOUND' });
    return res.json(dto);
  } catch (err) {
    return next(err);
  }
});

app.put('/api/org/990/readiness/filing', jwtAuth, requireCompliance, async (req, res, next) => {
  try {
    const orgId = (req as any).auth.orgId as string;
    const parsed = putForm990ReadinessFilingBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', details: parsed.error.flatten().fieldErrors });
    }
    await putOrg990ReadinessFiling(orgId, parsed.data);
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

// ─── Restricted Funds (v1) ────────────────────────────────────────────────────

app.get('/api/org/restricted-funds', jwtAuth, requireRestrictedFunds, async (req, res, next) => {
  try {
    const orgId = (req as any).auth.orgId as string;
    const funds = await listRestrictedFunds(orgId);
    return res.json({ orgId, restrictedFunds: funds });
  } catch (err) {
    return next(err);
  }
});

app.post('/api/org/restricted-funds', jwtAuth, requireRestrictedFunds, async (req, res, next) => {
  try {
    const orgId = (req as any).auth.orgId as string;
    const parseResult = CreateRestrictedFundSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', details: parseResult.error.flatten().fieldErrors });
    }
    const fund = await createRestrictedFund({ orgId, input: parseResult.data });
    return res.status(201).json({ fund });
  } catch (err) {
    return next(err);
  }
});

app.get('/api/org/restricted-funds/:id', jwtAuth, requireRestrictedFunds, async (req, res, next) => {
  try {
    const orgId = (req as any).auth.orgId as string;
    const id = req.params['id']!;
    const summary = await getRestrictedFundSummary({ orgId, restrictedFundId: id });
    if (!summary) return res.status(404).json({ error: 'RESTRICTED_FUND_NOT_FOUND' });
    return res.json(summary);
  } catch (err) {
    return next(err);
  }
});

app.post('/api/org/restricted-funds/:id/drawdowns', jwtAuth, requireRestrictedFunds, async (req, res, next) => {
  try {
    const orgId = (req as any).auth.orgId as string;
    const id = req.params['id']!;
    const parseResult = RecordUsageEventSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', details: parseResult.error.flatten().fieldErrors });
    }
    const evt = await recordRestrictedFundUsageEvent({ orgId, restrictedFundId: id, input: parseResult.data });
    if (!evt) return res.status(404).json({ error: 'RESTRICTED_FUND_NOT_FOUND' });
    return res.status(201).json({ usageEvent: evt });
  } catch (err) {
    return next(err);
  }
});

app.get('/api/org/governance', jwtAuth, requireCompliance, async (req, res, next) => {
  try {
    const orgId = (req as any).auth.orgId as string;
    const governance = await getOrgGovernanceSnapshot(orgId);
    return res.json(governance);
  } catch (err) {
    return next(err);
  }
});

app.get('/api/org/state-registrations', jwtAuth, requireCompliance, async (req, res, next) => {
  try {
    const orgId = (req as any).auth.orgId as string;
    const registrations = await getOrgStateRegistrationSnapshot(orgId);
    return res.json(registrations);
  } catch (err) {
    return next(err);
  }
});

app.put('/api/org/state-registrations/:stateCode', jwtAuth, requireCompliance, async (req, res, next) => {
  try {
    const orgId = (req as any).auth.orgId as string;
    const registration = await upsertOrgStateRegistration(
      orgId,
      req.params['stateCode']!,
      parseStateRegistrationInput(req.body)
    );
    const snapshot = await getOrgStateRegistrationSnapshot(orgId);
    return res.json({ orgId, registration, summary: snapshot.summary });
  } catch (err) {
    return next(err);
  }
});

app.delete('/api/org/state-registrations/:stateCode', jwtAuth, requireCompliance, async (req, res, next) => {
  try {
    const orgId = (req as any).auth.orgId as string;
    await deleteOrgStateRegistration(orgId, req.params['stateCode']!);
    const snapshot = await getOrgStateRegistrationSnapshot(orgId);
    return res.json({ orgId, deleted: true, summary: snapshot.summary });
  } catch (err) {
    return next(err);
  }
});

app.put('/api/org/governance/policies', jwtAuth, requireCompliance, async (req, res, next) => {
  try {
    const orgId = (req as any).auth.orgId as string;
    const input = parseGovernancePolicyInput(req.body);
    const policyChecklist = await upsertGovernancePolicies(orgId, input);
    const governance = await getOrgGovernanceSnapshot(orgId);
    return res.json({ orgId, policyChecklist, readiness: governance.readiness });
  } catch (err) {
    return next(err);
  }
});

app.post('/api/org/governance/board-members', jwtAuth, requireCompliance, async (req, res, next) => {
  try {
    const orgId = (req as any).auth.orgId as string;
    const member = await createBoardGovernanceMember(orgId, parseBoardMemberCreateInput(req.body));
    const governance = await getOrgGovernanceSnapshot(orgId);
    return res.status(201).json({ orgId, member, readiness: governance.readiness });
  } catch (err) {
    return next(err);
  }
});

app.patch('/api/org/governance/board-members/:memberId', jwtAuth, requireCompliance, async (req, res, next) => {
  try {
    const orgId = (req as any).auth.orgId as string;
    const member = await updateBoardGovernanceMember(
      orgId,
      req.params['memberId']!,
      parseBoardMemberInput(req.body, true)
    );
    const governance = await getOrgGovernanceSnapshot(orgId);
    return res.json({ orgId, member, readiness: governance.readiness });
  } catch (err) {
    return next(err);
  }
});

app.delete('/api/org/governance/board-members/:memberId', jwtAuth, requireCompliance, async (req, res, next) => {
  try {
    const orgId = (req as any).auth.orgId as string;
    await deleteBoardGovernanceMember(orgId, req.params['memberId']!);
    const governance = await getOrgGovernanceSnapshot(orgId);
    return res.json({ orgId, deleted: true, readiness: governance.readiness });
  } catch (err) {
    return next(err);
  }
});

app.get('/api/org/audit-prep', jwtAuth, requireCompliance, async (req, res, next) => {
  try {
    const orgId = (req as any).auth.orgId as string;
    const snapshot = await getOrgAuditPrepSnapshot(orgId);
    return res.json(snapshot);
  } catch (err) {
    return next(err);
  }
});

app.post('/api/org/audit-prep/apply-template', jwtAuth, requireCompliance, async (req, res, next) => {
  try {
    const orgId = (req as any).auth.orgId as string;
    const { createdCount } = await applyAuditPrepTemplate(orgId);
    const snapshot = await getOrgAuditPrepSnapshot(orgId);
    return res.status(201).json({ ...snapshot, createdCount });
  } catch (err) {
    return next(err);
  }
});

app.patch('/api/org/audit-prep/items/:itemId', jwtAuth, requireCompliance, async (req, res, next) => {
  try {
    const orgId = (req as any).auth.orgId as string;
    const item = await updateOrgAuditPrepItem(orgId, req.params['itemId']!, parseAuditPrepItemPatch(req.body));
    const snapshot = await getOrgAuditPrepSnapshot(orgId);
    return res.json({ orgId, item: toOrgAuditPrepItemDto(item), summary: snapshot.summary });
  } catch (err) {
    return next(err);
  }
});

app.get(
  '/api/partner/portfolio/summary',
  jwtAuth,
  requireInstitutionalPartner,
  requirePartnerCtx,
  async (req, res, next) => {
    try {
      const partner = (req as any).partner as { partnerId: string; role: PartnerUserRole };
      const includeInactive =
        partner.role === 'PARTNER_ADMIN' && String(req.query['includeInactive'] ?? '') === 'true';
      const filters = parsePartnerPortfolioListFiltersFromQuery(req.query as Record<string, unknown>);
      const summary = await getPartnerPortfolioSummary(partner.partnerId, {
        role: partner.role,
        includeInactive,
        filters,
      });
      return res.json(summary);
    } catch (err) {
      return next(err);
    }
  }
);

app.get(
  '/api/partner/portfolio/export.csv',
  jwtAuth,
  requireInstitutionalPartner,
  requirePartnerCtx,
  async (req, res, next) => {
    try {
      const partner = (req as any).partner as { partnerId: string; role: PartnerUserRole };
      const includeInactive =
        partner.role === 'PARTNER_ADMIN' && String(req.query['includeInactive'] ?? '') === 'true';
      const filters = parsePartnerPortfolioListFiltersFromQuery(req.query as Record<string, unknown>);
      const sortMode = parsePortfolioExportSort(req.query as Record<string, unknown>);
      const summary = await getPartnerPortfolioSummary(partner.partnerId, {
        role: partner.role,
        includeInactive,
        filters,
      });
      const sorted = sortPartnerPortfolioRowsForExport(summary.organizations, sortMode);
      const now = new Date();
      const csv = partnerPortfolioRowsToCsv(sorted, summary.disclaimer, { includeBom: true });
      const filename = partnerPortfolioExportFilename(partner.partnerId, now);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.status(200).send(csv);
    } catch (err) {
      return next(err);
    }
  }
);

app.post(
  '/api/partner/portfolio/orgs',
  jwtAuth,
  requireInstitutionalPartner,
  requirePartnerCtx,
  requirePartnerAdminMw,
  async (req, res, next) => {
    try {
      const partner = (req as any).partner as { partnerId: string };
      const input = parseLinkManagedOrgBody(req.body);
      const membership = await linkManagedOrganization(partner.partnerId, input);
      return res.status(201).json({ partnerId: partner.partnerId, membership });
    } catch (err) {
      return next(err);
    }
  }
);

app.patch(
  '/api/partner/portfolio/orgs/:orgId',
  jwtAuth,
  requireInstitutionalPartner,
  requirePartnerCtx,
  requirePartnerAdminMw,
  async (req, res, next) => {
    try {
      const partner = (req as any).partner as { partnerId: string };
      const patch = parseUpdateManagedOrgBody(req.body);
      const membership = await updateManagedOrganization(partner.partnerId, req.params['orgId']!, patch);
      return res.json({ partnerId: partner.partnerId, membership });
    } catch (err) {
      return next(err);
    }
  }
);

app.get(
  '/api/partner/programs',
  jwtAuth,
  requireInstitutionalPartner,
  requirePartnerCtx,
  async (req, res, next) => {
    try {
      const partner = (req as any).partner as { partnerId: string };
      const programs = await listPartnerPrograms(partner.partnerId);
      return res.json({ partnerId: partner.partnerId, programs });
    } catch (err) {
      return next(err);
    }
  }
);

app.post(
  '/api/partner/programs',
  jwtAuth,
  requireInstitutionalPartner,
  requirePartnerCtx,
  requirePartnerAdminMw,
  async (req, res, next) => {
    try {
      const partner = (req as any).partner as { partnerId: string };
      const input = parsePartnerProgramCreateBody(req.body);
      const program = await createPartnerProgram(partner.partnerId, input);
      return res.status(201).json({ partnerId: partner.partnerId, program });
    } catch (err) {
      return next(err);
    }
  }
);

app.patch(
  '/api/partner/programs/:programId',
  jwtAuth,
  requireInstitutionalPartner,
  requirePartnerCtx,
  requirePartnerAdminMw,
  async (req, res, next) => {
    try {
      const partner = (req as any).partner as { partnerId: string };
      const patch = parsePartnerProgramPatchBody(req.body);
      const program = await updatePartnerProgram(partner.partnerId, req.params['programId']!, patch);
      return res.json({ partnerId: partner.partnerId, program });
    } catch (err) {
      return next(err);
    }
  }
);

app.get(
  '/api/partner/programs/:programId/summary',
  jwtAuth,
  requireInstitutionalPartner,
  requirePartnerCtx,
  async (req, res, next) => {
    try {
      const partner = (req as any).partner as { partnerId: string; role: PartnerUserRole };
      const includeInactive =
        partner.role === 'PARTNER_ADMIN' && String(req.query['includeInactive'] ?? '') === 'true';
      const summary = await getPartnerProgramSummary(partner.partnerId, req.params['programId']!, {
        role: partner.role,
        includeInactive,
      });
      return res.json(summary);
    } catch (err) {
      return next(err);
    }
  }
);

// Generic error handler: keep output stable and avoid leaking internals.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  // Subscription errors
  if (err instanceof FeatureNotEnabledError) {
    return res.status(403).json({ error: 'FEATURE_NOT_ENABLED', feature: err.featureKey });
  }
  if (err instanceof SubscriptionNotActiveError) {
    return res.status(403).json({ error: 'SUBSCRIPTION_NOT_ACTIVE' });
  }
  if (err instanceof AuthRequiredError || err instanceof InvalidTokenError) {
    return res.status(401).json({ error: err instanceof AuthRequiredError ? 'AUTH_REQUIRED' : 'INVALID_TOKEN' });
  }
  if (err instanceof GovernanceInputError) {
    return res.status(400).json({ error: 'INVALID_GOVERNANCE_INPUT', detail: err.message });
  }
  if (err instanceof GovernanceNotFoundError) {
    return res.status(404).json({ error: err.message });
  }
  if (err instanceof StateRegistrationInputError) {
    return res.status(400).json({ error: 'INVALID_STATE_REGISTRATION_INPUT', detail: err.message });
  }
  if (err instanceof StateRegistrationNotFoundError) {
    return res.status(404).json({ error: err.message });
  }
  if (err instanceof AuditPrepInputError) {
    return res.status(400).json({ error: 'INVALID_AUDIT_PREP_INPUT', detail: err.message });
  }
  if (err instanceof AuditPrepNotFoundError) {
    return res.status(404).json({ error: err.message });
  }
  if (err instanceof PartnerPortfolioInputError) {
    return res.status(400).json({ error: 'INVALID_PARTNER_PORTFOLIO_INPUT', detail: err.message });
  }
  if (err instanceof PartnerPortfolioNotFoundError) {
    return res.status(404).json({ error: err.message });
  }
  if (err instanceof PartnerProgramInputError) {
    return res.status(400).json({ error: 'INVALID_PARTNER_PROGRAM_INPUT', detail: err.message });
  }
  if (err instanceof PartnerProgramNotFoundError) {
    return res.status(404).json({ error: err.message });
  }

  const code = err instanceof Error && err.message === 'ANTHROPIC_API_KEY_REQUIRED'
    ? 'ANTHROPIC_API_KEY_REQUIRED'
    : err instanceof Error && err.message === 'orgId_or_ein_required'
      ? 'ORG_ID_OR_EIN_REQUIRED'
      : 'INTERNAL_ERROR';
  const status = code === 'ORG_ID_OR_EIN_REQUIRED' ? 400 : 500;
  res.status(status).json({ error: code });
});

// Export app for testing
export { app };

// Only call listen() when run directly (not when imported for tests)
if (require.main === module) {
  const port = parseInt(process.env['PORT'] ?? '4010', 10);
  app.listen(port, () => {
    // Intentionally minimal logging.
    // eslint-disable-next-line no-console
    console.log(`org-dashboard-api listening on ${port}`);
  });
}

function parseGovernancePolicyInput(body: unknown): GovernancePolicyUpdateInput {
  const input = asRecord(body);

  return {
    conflictOfInterestPolicy: parseRequiredBoolean(input['conflictOfInterestPolicy'], 'conflictOfInterestPolicy'),
    whistleblowerPolicy: parseRequiredBoolean(input['whistleblowerPolicy'], 'whistleblowerPolicy'),
    documentRetentionPolicy: parseRequiredBoolean(input['documentRetentionPolicy'], 'documentRetentionPolicy'),
  };
}

function parseBoardMemberCreateInput(body: unknown): BoardMemberCreateInput {
  return parseBoardMemberInput(body, false) as BoardMemberCreateInput;
}

function parseBoardMemberInput(body: unknown, partial: true): BoardMemberUpdateInput;
function parseBoardMemberInput(body: unknown, partial?: false): BoardMemberCreateInput;
function parseBoardMemberInput(body: unknown, partial = false): BoardMemberCreateInput | BoardMemberUpdateInput {
  const input = asRecord(body);
  const result: {
    name?: string;
    officerRole?: GovernanceOfficerRole | null;
    termStart?: Date | null;
    termEnd?: Date | null;
    conflictDisclosureSignedAt?: Date | null;
    meetingsHeld?: number | null;
    meetingsAttended?: number | null;
  } = {};

  if (!partial || Object.prototype.hasOwnProperty.call(input, 'name')) {
    if (typeof input['name'] !== 'string' || input['name'].trim().length === 0) {
      throw new GovernanceInputError('name_required');
    }
    result.name = input['name'].trim();
  }

  if (Object.prototype.hasOwnProperty.call(input, 'officerRole')) {
    result.officerRole = parseOfficerRole(input['officerRole']);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'termStart')) {
    result.termStart = parseOptionalDate(input['termStart'], 'termStart');
  }
  if (Object.prototype.hasOwnProperty.call(input, 'termEnd')) {
    result.termEnd = parseOptionalDate(input['termEnd'], 'termEnd');
  }
  if (Object.prototype.hasOwnProperty.call(input, 'conflictDisclosureSignedAt')) {
    result.conflictDisclosureSignedAt = parseOptionalDate(
      input['conflictDisclosureSignedAt'],
      'conflictDisclosureSignedAt'
    );
  }
  if (Object.prototype.hasOwnProperty.call(input, 'meetingsHeld')) {
    result.meetingsHeld = parseOptionalInteger(input['meetingsHeld'], 'meetingsHeld');
  }
  if (Object.prototype.hasOwnProperty.call(input, 'meetingsAttended')) {
    result.meetingsAttended = parseOptionalInteger(input['meetingsAttended'], 'meetingsAttended');
  }

  return result;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new GovernanceInputError('object_body_required');
  }
  return value as Record<string, unknown>;
}

function parseRequiredBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new GovernanceInputError(`${field}_required_boolean`);
  return value;
}

function parseOptionalInteger(value: unknown, field: string): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new GovernanceInputError(`${field}_required_integer`);
  }
  return value;
}

function parseOptionalDate(value: unknown, field: string): Date | null {
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new GovernanceInputError(`${field}_required_date_string`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new GovernanceInputError(`${field}_invalid_date`);
  }
  return parsed;
}

function parseOfficerRole(value: unknown): GovernanceOfficerRole | null {
  if (value === null) return null;
  if (
    value === 'CHAIR' ||
    value === 'VICE_CHAIR' ||
    value === 'TREASURER' ||
    value === 'SECRETARY' ||
    value === 'PRESIDENT' ||
    value === 'MEMBER_AT_LARGE' ||
    value === 'OTHER'
  ) {
    return value;
  }
  throw new GovernanceInputError('officerRole_invalid');
}

function parseStateRegistrationInput(body: unknown): StateRegistrationUpsertInput {
  const input = asRecord(body);

  return {
    status: parseStateRegistrationStatus(input['status']),
    solicitsDonations: parseRequiredBoolean(input['solicitsDonations'], 'solicitsDonations'),
    ...(Object.prototype.hasOwnProperty.call(input, 'renewalDueDate')
      ? { renewalDueDate: parseOptionalDate(input['renewalDueDate'], 'renewalDueDate') }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(input, 'renewalNotes')
      ? { renewalNotes: parseOptionalString(input['renewalNotes'], 'renewalNotes') }
      : {}),
  };
}

function parseStateRegistrationStatus(value: unknown): StateRegistrationStatus {
  if (
    value === 'ACTIVE' ||
    value === 'PENDING' ||
    value === 'NOT_REGISTERED' ||
    value === 'UNKNOWN'
  ) {
    return value;
  }
  throw new StateRegistrationInputError('status_invalid');
}

function parseOptionalString(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new StateRegistrationInputError(`${field}_required_string`);
  }
  return value;
}
