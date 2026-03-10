import type { DbClient } from '../db';
import type { ClaudeOrgConfig } from '../contracts/claudeConfig';

export class OrgClaudeConfigService {
  private readonly db: DbClient;

  constructor(db: DbClient) {
    this.db = db;
  }

  async get(orgId: string): Promise<ClaudeOrgConfig | null> {
    const row = await this.db.orgClaudeConfig.findUnique({
      where: { orgId },
      select: { orgId: true, enabled: true, defaultModel: true, maxTokens: true, temperature: true },
    });
    if (!row) return null;
    return {
      orgId: row.orgId,
      enabled: row.enabled,
      defaultModel: row.defaultModel,
      maxTokens: row.maxTokens,
      temperature: row.temperature,
    };
  }

  async ensurePartnerAccess(orgId: string): Promise<void> {
    const org = await this.db.organization.findUnique({
      where: { id: orgId },
      select: { subscriptionTier: true, claudeStatus: true },
    });
    if (!org) throw new Error('ORG_NOT_FOUND');
    if (org.subscriptionTier !== 'GROWTH' && org.subscriptionTier !== 'ENTERPRISE') {
      throw new Error('PARTNER_TIER_REQUIRED');
    }
    if (org.claudeStatus !== 'ACTIVE') throw new Error('CLAUDE_NOT_ACTIVE');

    const cfg = await this.db.orgClaudeConfig.findUnique({
      where: { orgId },
      select: { enabled: true },
    });
    if (!cfg || !cfg.enabled) {
      throw new Error('CLAUDE_NOT_ENABLED');
    }
  }

  async upsertDefaults(orgId: string): Promise<ClaudeOrgConfig> {
    const row = await this.db.orgClaudeConfig.upsert({
      where: { orgId },
      update: {},
      create: {
        orgId,
        enabled: true,
        defaultModel: 'claude-3-5-sonnet-20241022',
        maxTokens: 1024,
        temperature: 0,
      },
      select: { orgId: true, enabled: true, defaultModel: true, maxTokens: true, temperature: true },
    });
    return {
      orgId: row.orgId,
      enabled: row.enabled,
      defaultModel: row.defaultModel,
      maxTokens: row.maxTokens,
      temperature: row.temperature,
    };
  }

  // Prompt activation is stored in OrgPromptLibrary per promptType (no global active library on config).
}
