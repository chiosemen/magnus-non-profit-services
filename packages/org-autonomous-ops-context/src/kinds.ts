import type { OrgContextFileKind } from '@magnus/db/types';

export const ORG_CONTEXT_FILE_KINDS: readonly OrgContextFileKind[] = [
  'ORG_IDENTITY',
  'ORG_SOUL',
  'ORG_AGENTS',
  'ORG_MEMORY',
  'ORG_HEARTBEAT',
];

export function parseOrgContextFileKind(raw: string): OrgContextFileKind | null {
  if ((ORG_CONTEXT_FILE_KINDS as readonly string[]).includes(raw)) return raw as OrgContextFileKind;
  return null;
}
