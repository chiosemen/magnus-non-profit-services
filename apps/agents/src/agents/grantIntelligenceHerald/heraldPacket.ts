import type { GrantMatch } from './opportunityClient';

export type HeraldSourceModule = 'candid_opportunity' | 'org_identity' | 'handoff';

export type HeraldSourceRef = { module: HeraldSourceModule; ref: string; label: string; url?: string };

export type HeraldReviewPacket = {
  orgId: string;
  orgName: string;
  orgEin: string;
  windowStartIso: string;
  windowEndIso: string;
  matches: Array<{
    opportunityId: string;
    funderName: string;
    programName: string;
    matchScore: number;
    urgency: string;
    applicationDeadline?: string;
    applicationUrl?: string;
    requiresLetterOfInquiry: boolean;
    recommendedAction: string;
    matchReasons: string[];
  }>;
  sourceIndex: HeraldSourceRef[];
  disclaimers: string[];
};

export function buildHeraldReviewPacket(params: {
  org: { id: string; name: string; ein: string };
  window: { start: Date; end: Date };
  matches: GrantMatch[];
  orgIdentityFileId: string | null;
}): HeraldReviewPacket {
  const sourceIndex: HeraldSourceRef[] = [];
  if (params.orgIdentityFileId) {
    sourceIndex.push({
      module: 'org_identity',
      ref: params.orgIdentityFileId,
      label: 'ORG_IDENTITY (grant profile inputs)',
    });
  }

  for (const m of params.matches) {
    sourceIndex.push({
      module: 'candid_opportunity',
      ref: m.opportunity.id,
      label: `${m.opportunity.funderName} — ${m.opportunity.programName}`,
      url: m.opportunity.applicationUrl,
    });
  }

  return {
    orgId: params.org.id,
    orgName: params.org.name,
    orgEin: params.org.ein,
    windowStartIso: params.window.start.toISOString(),
    windowEndIso: params.window.end.toISOString(),
    matches: params.matches.slice(0, 12).map(m => ({
      opportunityId: m.opportunity.id,
      funderName: m.opportunity.funderName,
      programName: m.opportunity.programName,
      matchScore: m.matchScore,
      urgency: m.urgency,
      applicationDeadline: m.opportunity.applicationDeadline,
      applicationUrl: m.opportunity.applicationUrl,
      requiresLetterOfInquiry: m.opportunity.requiresLetterOfInquiry,
      recommendedAction: m.recommendedAction,
      matchReasons: m.matchReasons.slice(0, 6),
    })),
    sourceIndex,
    disclaimers: [
      'Internal draft packet. Do not submit or contact funders automatically.',
      'Matches are rule-scored; verify eligibility, deadlines, and requirements on the funder site.',
      'No claims of fit beyond listed match reasons; staff must confirm.',
    ],
  };
}

function formatSourceIndex(packet: HeraldReviewPacket): string {
  const lines: string[] = ['', '---', '**Source index** (verify before drafting):'];
  for (const s of packet.sourceIndex.slice(0, 80)) {
    const url = s.url ? ` (${s.url})` : '';
    lines.push(`- \`${s.module}\` → \`${s.ref}\` — ${s.label}${url}`);
  }
  if (packet.sourceIndex.length > 80) {
    lines.push(`- …and ${packet.sourceIndex.length - 80} more references truncated`);
  }
  return lines.join('\n');
}

export function formatHeraldReviewPacketMarkdown(packet: HeraldReviewPacket): string {
  const lines: string[] = [
    `# HERALD — Grant opportunity review (internal)`,
    `${packet.orgName} (EIN ${packet.orgEin}) · window end ${packet.windowEndIso.slice(0, 10)}`,
    '',
    '## Top matches (rule-scored)',
  ];

  if (packet.matches.length === 0) {
    lines.push('- No matches above threshold for this run window.');
  } else {
    for (const m of packet.matches) {
      const ddl = m.applicationDeadline ? ` · deadline ${m.applicationDeadline.slice(0, 10)}` : '';
      const url = m.applicationUrl ? ` · ${m.applicationUrl}` : '';
      const loi = m.requiresLetterOfInquiry ? ' · LOI required' : '';
      lines.push(`- **${m.funderName}** — ${m.programName} (score ${m.matchScore}${ddl}${loi})${url}`);
      lines.push(`  - urgency: ${m.urgency}`);
      lines.push(`  - recommended_action: ${m.recommendedAction}`);
      if (m.matchReasons.length > 0) lines.push(`  - match_reasons: ${m.matchReasons.join('; ')}`);
    }
  }

  lines.push('', '## Disclaimers', ...packet.disclaimers.map(d => `- ${d}`));
  lines.push(formatSourceIndex(packet));
  return lines.join('\n');
}

