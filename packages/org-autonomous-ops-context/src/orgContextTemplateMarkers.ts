import type { OrgContextFileKind } from '@magnus/db/types';

/** Bump when default markdown shape changes materially. */
export const MAGNUS_TEMPLATE_VERSION = 1;

/**
 * HTML comment placed immediately after the title line in seeded templates.
 * Operators may remove it after editing; validation uses heuristics beyond this marker.
 */
export function magnusTemplateComment(kind: OrgContextFileKind): string {
  return `<!-- magnus:template kind=${kind} version=${MAGNUS_TEMPLATE_VERSION} -->`;
}

const TEMPLATE_RE = /<!--\s*magnus:template\s+kind=(\w+)\s+version=(\d+)\s*-->/i;

export function extractMagnusTemplateMeta(content: string): { kind: string; version: number } | null {
  const m = TEMPLATE_RE.exec(content);
  if (!m) return null;
  return { kind: m[1]!, version: parseInt(m[2]!, 10) };
}

export function hasMagnusTemplateMarker(content: string): boolean {
  return TEMPLATE_RE.test(content);
}
