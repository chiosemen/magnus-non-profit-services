/**
 * Magnus S4NP — AI Concierge Intelligent Service Layer
 */

import { PrismaClient, ConciergeProposal, ConciergeProposalType, ConciergeProposalStatus, AgentScopeType, AgentRunStatus, AutonomyTier, Prisma } from '@magnus/db/types';
import { createProposal } from './conciergeProposalService';

export class AiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiConfigError';
  }
}

export class SecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityError';
  }
}

// ─── Input Sanitization & Prompt Injection Defense ──────────────────────────

const FORBIDDEN_WORDS = [
  'ignore previous instructions',
  'system override',
  'bypass safety',
  'you are now',
  'forget what',
  'act as',
];

/**
 * Strips potential prompt injection patterns and restricts text structure.
 */
export function sanitizeInput(text: string, maxLength: number = 2000): string {
  if (!text) return '';
  let sanitized = text.slice(0, maxLength);
  
  const lower = sanitized.toLowerCase();
  for (const word of FORBIDDEN_WORDS) {
    if (lower.includes(word)) {
      throw new SecurityError(`Input rejected due to safety policy violation.`);
    }
  }

  // Remove control characters
  sanitized = sanitized.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
  return sanitized;
}

// ─── Claude API Invocation Wrapper ──────────────────────────────────────────

interface ClaudeResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

async function invokeClaude(
  db: PrismaClient,
  orgId: string,
  systemPrompt: string,
  userPrompt: string,
  proposalType: ConciergeProposalType
): Promise<ClaudeResponse> {
  // 1. Fail closed on missing/inactive AI Config
  const org = await db.organization.findUnique({
    where: { id: orgId },
    include: { claudeConfig: true },
  });

  if (!org) throw new AiConfigError('Organization not found.');
  if (org.claudeStatus !== 'ACTIVE' || !org.claudeConfig || !org.claudeConfig.enabled) {
    throw new AiConfigError('AI Concierge features are not enabled or active for this organization.');
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey && process.env.NODE_ENV !== 'test') {
    throw new AiConfigError('Anthropic API key is not configured in the environment.');
  }

  // Create audit trail agent run in PENDING/STARTED
  const agentRun = await db.agentRun.create({
    data: {
      agentName: 'AI_CONCIERGE',
      scopeType: AgentScopeType.ORG,
      scopeId: orgId,
      windowStart: new Date(),
      windowEnd: new Date(),
      status: AgentRunStatus.STARTED,
      autonomyTier: AutonomyTier.TIER_B_ASK_FIRST,
      requiresHumanReview: true,
    },
  });

  let responseText = '';
  let inputTokens = 100;
  let outputTokens = 200;

  try {
    if (process.env.NODE_ENV === 'test') {
      // Isolated test mode response mock
      responseText = getMockResponseForType(proposalType);
    } else {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey!,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: org.claudeConfig.defaultModel || 'claude-3-5-sonnet-20241022',
          max_tokens: org.claudeConfig.maxTokens || 1024,
          temperature: org.claudeConfig.temperature || 0,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error?.message || `Anthropic error HTTP ${res.status}`);
      }

      responseText = Array.isArray(json?.content) ? String(json.content?.[0]?.text ?? '') : '';
      inputTokens = json?.usage?.input_tokens ?? 100;
      outputTokens = json?.usage?.output_tokens ?? 200;
    }

    // Update Agent Run as successful
    await db.agentRun.update({
      where: { id: agentRun.id },
      data: {
        status: AgentRunStatus.SUCCESS,
        finishedAt: new Date(),
        metrics: { inputTokens, outputTokens }
      },
    });

    // Log Usage for Cap Tracking
    await db.claudeUsageLog.create({
      data: {
        orgId,
        promptType: 'BOARD_REPORT', // mapped enum
        tokenCount: inputTokens + outputTokens,
        cost: new Prisma.Decimal(0.00),
      },
    });

    return { text: responseText, inputTokens, outputTokens };
  } catch (err: any) {
    await db.agentRun.update({
      where: { id: agentRun.id },
      data: {
        status: AgentRunStatus.FAILED,
        finishedAt: new Date(),
        error: err.message,
      },
    });
    throw err;
  }
}

// ─── AI Concierge Services ──────────────────────────────────────────────────

/**
 * 1. Legacy CSV mapping analysis
 */
export async function analyzeLegacyCsvMapping(
  db: PrismaClient,
  orgId: string,
  headers: string[],
  sampleRows: string[][]
): Promise<ConciergeProposal> {
  const sanitizedHeaders = headers.map(h => sanitizeInput(h, 100));
  const sanitizedRows = sampleRows.map(row => row.map(cell => sanitizeInput(cell, 200)));

  const systemPrompt = `You are the AI Concierge mapping legacy CSV imports to the S4NP schema.
Classify headers into: 'name' (donor name), 'email', 'phone', 'amount', 'date', or 'ignore'.
Return a raw JSON object ONLY matching this schema:
{
  "mappings": [
    { "csvHeader": "String", "mappedField": "name|email|phone|amount|date|ignore", "confidence": 0.0-1.0 }
  ],
  "reasoning": "String"
}`;

  const userPrompt = `CSV Headers: ${JSON.stringify(sanitizedHeaders)}
Sample rows: ${JSON.stringify(sanitizedRows.slice(0, 3))}`;

  const raw = await invokeClaude(db, orgId, systemPrompt, userPrompt, ConciergeProposalType.LEGACY_IMPORT_MAP);
  const payload = JSON.parse(raw.text);

  // Validate structured output structure
  if (!Array.isArray(payload.mappings) || typeof payload.reasoning !== 'string') {
    throw new ValidationError('Invalid structured output format from LLM.');
  }

  // Calculate overall confidence score
  const confs = payload.mappings.map((m: any) => m.confidence ?? 0.5);
  const avgConf = confs.reduce((a: number, b: number) => a + b, 0) / confs.length;

  return await createProposal(db, orgId, {
    type: ConciergeProposalType.LEGACY_IMPORT_MAP,
    confidence: avgConf || 0.8,
    payload,
  });
}

/**
 * 2. Donor segmentation suggestions
 */
export async function suggestDonorSegmentation(
  db: PrismaClient,
  orgId: string
): Promise<ConciergeProposal> {
  // Read org donors and donations to compile giving patterns (Strict tenant-scoped query)
  const donors = await db.donor.findMany({
    where: { orgId },
    include: { donations: true },
  });

  if (donors.length === 0) {
    throw new ValidationError('No donor history available to segment.');
  }

  const profileData = donors.map(d => {
    const total = d.donations.reduce((sum, don) => sum + Number(don.amount), 0);
    const count = d.donations.length;
    return { donorId: d.id, totalGifts: total, giftCount: count };
  });

  const systemPrompt = `You are the S4NP donor intelligence concierge.
Analyze donor giving totals and frequency to suggest segments.
Use transparent, numeric criteria only. Do not make any discriminatory, sensitive, or demographic inferences.
Return a raw JSON object ONLY matching this schema:
{
  "segments": [
    { "name": "String", "criteria": "String", "recommendedAction": "String", "donorIds": ["UUID"] }
  ]
}`;

  const userPrompt = `Analyze these donor gift profiles: ${JSON.stringify(profileData)}`;

  const raw = await invokeClaude(db, orgId, systemPrompt, userPrompt, ConciergeProposalType.DONOR_SEGMENT);
  const payload = JSON.parse(raw.text);

  if (!Array.isArray(payload.segments)) {
    throw new ValidationError('Invalid segments structure from LLM.');
  }

  return await createProposal(db, orgId, {
    type: ConciergeProposalType.DONOR_SEGMENT,
    confidence: 0.9,
    payload,
  });
}

/**
 * 3. Campaign draft generation
 */
export async function generateCampaignDraft(
  db: PrismaClient,
  orgId: string,
  goalTopic: string
): Promise<ConciergeProposal> {
  const sanitizedTopic = sanitizeInput(goalTopic, 500);

  const systemPrompt = `You are a fundraising writer for S4NP. Draft a campaign proposal.
Return a raw JSON object ONLY matching this schema:
{
  "title": "String",
  "story": "String",
  "suggestedAmounts": [number],
  "faq": [{ "question": "String", "answer": "String" }],
  "impactStatements": ["String"]
}`;

  const userPrompt = `Draft a campaign details proposal for topic: ${sanitizedTopic}`;

  const raw = await invokeClaude(db, orgId, systemPrompt, userPrompt, ConciergeProposalType.CAMPAIGN_DRAFT);
  const payload = JSON.parse(raw.text);

  if (!payload.title || !payload.story || !Array.isArray(payload.suggestedAmounts)) {
    throw new ValidationError('Invalid campaign draft structure from LLM.');
  }

  return await createProposal(db, orgId, {
    type: ConciergeProposalType.CAMPAIGN_DRAFT,
    confidence: 0.95,
    payload,
  });
}

/**
 * 4. Board brief draft generation
 */
export async function generateBoardBriefDraft(
  db: PrismaClient,
  orgId: string
): Promise<ConciergeProposal> {
  // Aggregate real financial data points (tenant-scoped Oracle oracle Oracle)
  const donations = await db.donation.findMany({ where: { orgId } });
  const totalGiving = donations.reduce((sum, d) => sum + Number(d.amount), 0);

  const funds = await db.fund.findMany({ where: { orgId } });
  const grants = await db.grant.findMany({ where: { orgId } });

  const summaryData = {
    totalGiving,
    donationCount: donations.length,
    fundCount: funds.length,
    grantCount: grants.length,
  };

  const systemPrompt = `You are the executive assistant concierge.
Synthesize the organization's aggregated metrics into a brief board update.
Mark the report clearly as a DRAFT.
Return a raw JSON object ONLY matching this schema:
{
  "boardBriefDraftText": "String",
  "keyHighlights": ["String"]
}`;

  const userPrompt = `Financial data metrics: ${JSON.stringify(summaryData)}`;

  const raw = await invokeClaude(db, orgId, systemPrompt, userPrompt, ConciergeProposalType.BOARD_BRIEF);
  const payload = JSON.parse(raw.text);

  if (!payload.boardBriefDraftText || !Array.isArray(payload.keyHighlights)) {
    throw new ValidationError('Invalid board brief structure from LLM.');
  }

  return await createProposal(db, orgId, {
    type: ConciergeProposalType.BOARD_BRIEF,
    confidence: 0.9,
    payload,
  });
}

/**
 * 5. Compliance reminder suggestions
 */
export async function suggestComplianceReminders(
  db: PrismaClient,
  orgId: string
): Promise<ConciergeProposal> {
  const deadlines = await db.complianceCalendar.findMany({
    where: { orgId },
    orderBy: { dueDate: 'asc' },
  });

  const systemPrompt = `You are the nonprofit compliance assistant.
Review current deadlines and suggest reminder notifications. Do not file anything.
Return a raw JSON object ONLY matching this schema:
{
  "reminders": [
    { "deadlineType": "String", "dueDate": "String", "reminderText": "String", "priority": "HIGH|MED|LOW" }
  ]
}`;

  const userPrompt = `Deadlines data: ${JSON.stringify(deadlines)}`;

  const raw = await invokeClaude(db, orgId, systemPrompt, userPrompt, ConciergeProposalType.COMPLIANCE_REMINDER);
  const payload = JSON.parse(raw.text);

  if (!Array.isArray(payload.reminders)) {
    throw new ValidationError('Invalid reminders structure from LLM.');
  }

  return await createProposal(db, orgId, {
    type: ConciergeProposalType.COMPLIANCE_REMINDER,
    confidence: 0.85,
    payload,
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

function getMockResponseForType(type: ConciergeProposalType): string {
  switch (type) {
    case ConciergeProposalType.LEGACY_IMPORT_MAP:
      return JSON.stringify({
        mappings: [
          { csvHeader: 'Giver Name', mappedField: 'name', confidence: 0.95 },
          { csvHeader: 'Received Date', mappedField: 'date', confidence: 0.9 }
        ],
        reasoning: 'Matches naming rules.'
      });
    case ConciergeProposalType.DONOR_SEGMENT:
      return JSON.stringify({
        segments: [
          { name: 'Major Donors', criteria: 'Donated > $1,000', recommendedAction: 'Personal outreach', donorIds: [] }
        ]
      });
    case ConciergeProposalType.CAMPAIGN_DRAFT:
      return JSON.stringify({
        title: 'Draft Campaign Title',
        story: 'Fundraising description text.',
        suggestedAmounts: [10, 50, 100],
        faq: [],
        impactStatements: []
      });
    case ConciergeProposalType.BOARD_BRIEF:
      return JSON.stringify({
        boardBriefDraftText: 'DRAFT Board update details.',
        keyHighlights: ['Strong initial support.']
      });
    case ConciergeProposalType.COMPLIANCE_REMINDER:
      return JSON.stringify({
        reminders: [
          { deadlineType: 'FORM_990', dueDate: '2026-11-15', reminderText: 'Gather ledger entries.', priority: 'HIGH' }
        ]
      });
    default:
      return '{}';
  }
}
