import { Prisma, type PrismaClient } from '@magnus/db/types';
import { PromptLibraryService } from '../services/PromptLibraryService';

export type OnboardingResult = {
  orgId: string;
  claudeStatus: 'ACTIVE';
  promptsCreated: Array<{ promptType: string; version: number; promptId: string }>;
};

export async function onboardingWorkflow(params: { db: PrismaClient; orgId: string }): Promise<OnboardingResult> {
  // Step 1: Org tier verification (Growth or Enterprise).
  const org = await params.db.organization.findUnique({
    where: { id: params.orgId },
    select: { id: true, subscriptionTier: true, claudeStatus: true },
  });
  if (!org) throw new Error('ORG_NOT_FOUND');
  if (org.subscriptionTier !== 'GROWTH' && org.subscriptionTier !== 'ENTERPRISE') throw new Error('PARTNER_TIER_REQUIRED');
  if (org.claudeStatus !== 'NOT_ENABLED') throw new Error('CLAUDE_ALREADY_ONBOARDED');

  // Step 2: Confirm data sources enabled.
  await assertMcpActive();
  await assertComplianceAccessible(params.db, params.orgId);

  // Steps 3-5 must be atomic: no partial activation.
  return await params.db.$transaction(async tx => {
    // Re-check inside transaction (fail-closed under concurrent calls).
    const fresh = await tx.organization.findUnique({
      where: { id: params.orgId },
      select: { subscriptionTier: true, claudeStatus: true },
    });
    if (!fresh) throw new Error('ORG_NOT_FOUND');
    if (fresh.subscriptionTier !== 'GROWTH' && fresh.subscriptionTier !== 'ENTERPRISE') throw new Error('PARTNER_TIER_REQUIRED');
    if (fresh.claudeStatus !== 'NOT_ENABLED') throw new Error('CLAUDE_ALREADY_ONBOARDED');

    // Ensure OrgClaudeConfig exists and is enabled for the partner service.
    await tx.orgClaudeConfig.upsert({
      where: { orgId: params.orgId },
      update: { enabled: true },
      create: {
        orgId: params.orgId,
        enabled: true,
        defaultModel: 'claude-3-5-sonnet-20241022',
        maxTokens: 1024,
        temperature: 0,
      },
      select: { id: true },
    });

    const promptSvc = new PromptLibraryService(tx);

    // Step 3: Generate base prompt templates.
    const templates = [
      {
        promptType: 'INTERNAL_MEMO' as const, // compliance summary maps to INTERNAL_MEMO
        systemPrompt:
          'You are Magnus Claude Partner. Role: nonprofit compliance assistant. Summarize compliance posture deterministically and list deadlines.',
        userTemplate:
          'Compliance summary for {{org.name}} as of {{asOfDate}}. Include: upcoming deadlines, overdue items, and next actions.',
      },
      {
        promptType: 'GRANT_DRAFT' as const,
        systemPrompt:
          'You are Magnus Claude Partner. Role: grant writing assistant. Produce structured drafts and never fabricate facts. Use only provided inputs.',
        userTemplate:
          'Draft a grant proposal for {{org.name}} to {{funder.name}} for {{grant.amount}}. Use these notes: {{notes}}.',
      },
      {
        promptType: 'BOARD_REPORT' as const,
        systemPrompt:
          'You are Magnus Claude Partner. Role: board reporting analyst. Provide a clear financial summary and highlight risks and required decisions.',
        userTemplate:
          'Create a board financial summary for {{org.name}} for period {{period}} using these figures: {{financials}}.',
      },
    ];

    // Step 4: Store prompts, multiple versions allowed, auto-incremented.
    // Step 4b: Activate the created version (only one active per org+promptType).
    const promptsCreated: Array<{ promptType: string; version: number; promptId: string }> = [];
    for (const t of templates) {
      const created = await promptSvc.createPromptVersion(params.orgId, t.promptType, t.systemPrompt, t.userTemplate);
      await promptSvc.activatePromptVersion(created.id);
      promptsCreated.push({ promptType: t.promptType, version: created.version, promptId: created.id });
    }

    // Step 5: Mark Claude status ACTIVE.
    await tx.organization.update({
      where: { id: params.orgId },
      data: { claudeStatus: 'ACTIVE' },
      select: { id: true },
    });

    return { orgId: params.orgId, claudeStatus: 'ACTIVE', promptsCreated };
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });
}

async function assertMcpActive(): Promise<void> {
  const base = process.env['MCP_CONNECTOR_URL'];
  if (!base || base.trim().length === 0) throw new Error('MCP_CONNECTOR_URL_REQUIRED');

  const url = base.replace(/\/+$/, '') + '/health';
  let res: any;
  try {
    res = await fetch(url, { method: 'GET' });
  } catch {
    throw new Error('MCP_CONNECTOR_UNREACHABLE');
  }
  if (!res.ok) throw new Error('MCP_CONNECTOR_UNHEALTHY');
  const json: any = await res.json().catch(() => null);
  if (!json || json.ok !== true) throw new Error('MCP_CONNECTOR_UNHEALTHY');
}

async function assertComplianceAccessible(db: PrismaClient, orgId: string): Promise<void> {
  // Compliance data must be present; empty means onboarding cannot produce compliance-aware prompts.
  const count = await db.complianceCalendar.count({ where: { orgId } });
  if (count <= 0) throw new Error('COMPLIANCE_DATA_MISSING');
}
