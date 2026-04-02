import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultMarkdownForKind } from '../templates';
import { magnusTemplateComment } from '../orgContextTemplateMarkers';
import { buildOrgContextValidationReport } from '../orgContextValidation';
import { parseOrgIdentityForGrantProfile } from '../orgIdentityParsers/grantProfile';
import type { OrgContextFileKind } from '@magnus/db/types';

const orgSnap = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Test Org',
  ein: '12-3456789',
  fiscalYearEnd: null,
  annualRevenue: null,
  subscriptionTier: 'GROWTH',
};

test('default ORG_IDENTITY template is not READY for grant profile', () => {
  const md = defaultMarkdownForKind('ORG_IDENTITY', orgSnap);
  assert.match(md, /magnus:template kind=ORG_IDENTITY/);
  const r = parseOrgIdentityForGrantProfile({ orgIdentityMarkdown: md, annualRevenueUsdSnapshot: null });
  assert.equal(r.profile, null);
});

test('buildOrgContextValidationReport marks seeded templates as not READY', () => {
  const kinds: OrgContextFileKind[] = ['ORG_IDENTITY', 'ORG_SOUL', 'ORG_AGENTS', 'ORG_MEMORY', 'ORG_HEARTBEAT'];
  const filesByKind = Object.fromEntries(
    kinds.map(k => [k, { content: defaultMarkdownForKind(k, orgSnap) }]),
  ) as Record<OrgContextFileKind, { content: string }>;
  const report = buildOrgContextValidationReport({
    orgId: orgSnap.id,
    filesByKind,
    annualRevenueUsdSnapshot: null,
  });
  assert.ok(report.rows.every(r => r.status !== 'READY'));
  const id = report.rows.find(r => r.kind === 'ORG_IDENTITY');
  assert.equal(id?.configuredState, 'template_unedited');
});

test('ORG_IDENTITY READY when grant profile parses and template marker removed', () => {
  const kinds: OrgContextFileKind[] = ['ORG_IDENTITY', 'ORG_SOUL', 'ORG_AGENTS', 'ORG_MEMORY', 'ORG_HEARTBEAT'];
  const orgWithRev = { ...orgSnap, annualRevenue: '50000' };
  const filesByKind = Object.fromEntries(
    kinds.map(k => [k, { content: defaultMarkdownForKind(k, orgWithRev) }]),
  ) as Record<OrgContextFileKind, { content: string }>;
  const edited = filesByKind.ORG_IDENTITY.content
    .replace(magnusTemplateComment('ORG_IDENTITY'), '')
    .replace('(Add primary NTEE or sector.)', 'Primary NTEE: B20')
    .replace('(States where you operate or solicit.)', 'CA');
  filesByKind.ORG_IDENTITY = { content: edited };
  const report = buildOrgContextValidationReport({
    orgId: orgSnap.id,
    filesByKind,
    annualRevenueUsdSnapshot: 50_000,
  });
  const id = report.rows.find(r => r.kind === 'ORG_IDENTITY');
  assert.equal(id?.status, 'READY');
  assert.equal(id?.configuredState, 'ready');
});
