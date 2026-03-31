import type { OrgContextFileKind } from '@magnus/db/types';

export type OrgIdentityTemplateInput = {
  id: string;
  name: string;
  ein: string;
  fiscalYearEnd: Date | null;
  annualRevenue: string | null;
  subscriptionTier: string;
};

function fmtDate(d: Date | null): string {
  if (!d) return '(not set)';
  return d.toISOString().slice(0, 10);
}

/**
 * Initial markdown for each kind. ORG_IDENTITY is source-linked to Organization row fields at creation time.
 * Staff edits persist in OrgContextFile.content; re-seeding does not overwrite existing rows.
 */
export function defaultMarkdownForKind(kind: OrgContextFileKind, org: OrgIdentityTemplateInput): string {
  if (kind === 'ORG_IDENTITY') {
    return [
      '# ORG_IDENTITY',
      '',
      '<!-- source-linked: prisma.Organization snapshot at file creation; safe to edit below -->',
      '',
      '| Field | Value |',
      '| --- | --- |',
      `| org_id | \`${org.id}\` |`,
      `| legal_name | ${org.name} |`,
      `| ein | ${org.ein} |`,
      `| fiscal_year_end | ${fmtDate(org.fiscalYearEnd)} |`,
      `| annual_revenue_snapshot | ${org.annualRevenue ?? '(not set)'} |`,
      `| subscription_tier_snapshot | ${org.subscriptionTier} |`,
      '',
      '## Mission',
      '(Add mission statement.)',
      '',
      '## Sector / NTEE',
      '(Add primary NTEE or sector.)',
      '',
      '## State footprint',
      '(States where you operate or solicit.)',
      '',
      '## Board basics',
      '(Chair, meeting cadence, committee list.)',
      '',
      '## Key contacts',
      '(Internal roles — do not put secrets in autonomous-ops context.)',
      '',
      '## Active modules',
      '(Which Magnus Accord modules this org uses.)',
      '',
    ].join('\n');
  }
  if (kind === 'ORG_SOUL') {
    return [
      '# ORG_SOUL',
      '',
      '<!-- org voice and boundaries for autonomous internal drafts -->',
      '',
      '## Mission language',
      '',
      '## Tone preferences',
      '',
      '## Values / non-negotiables',
      '',
      '## Relationship sensitivities',
      '',
      '## Red-line behaviors (never imply in drafts)',
      '',
      '## Risk posture',
      '',
    ].join('\n');
  }
  if (kind === 'ORG_AGENTS') {
    return [
      '# ORG_AGENTS',
      '',
      '<!-- which agents/workflows are enabled; autonomy by workflow -->',
      '',
      '## Active agents',
      '- (List enabled agent names / schedules.)',
      '',
      '## Enabled workflows',
      '',
      '## Integrations',
      '',
      '## Autonomy tier by workflow',
      '| Workflow | Tier (A/B) | Notes |',
      '| --- | --- | --- |',
      '',
      '## Escalation map',
      '(Who gets internal alerts for compliance / grants / finance.)',
      '',
    ].join('\n');
  }
  if (kind === 'ORG_MEMORY') {
    return [
      '# ORG_MEMORY',
      '',
      '<!-- curated durable learnings; not raw logs -->',
      '',
      '## Verified patterns',
      '',
      '## Recurring problems',
      '',
      '## Funder-specific lessons',
      '',
      '## Governance / finance / grant lessons',
      '',
    ].join('\n');
  }
  return [
    '# ORG_HEARTBEAT',
    '',
    '<!-- cadence for autonomous checks; org timezone should match scheduler env -->',
    '',
    '## Daily',
    '',
    '## Weekly',
    '',
    '## Monthly',
    '',
    '## Quarterly',
    '',
    '## When idle',
    '',
    '## Escalation triggers',
    '',
  ].join('\n');
}
