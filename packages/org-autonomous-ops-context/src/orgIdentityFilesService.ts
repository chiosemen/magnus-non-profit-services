import type { OrgContextFileKind, PrismaClient } from '@magnus/db/types';
import { ORG_CONTEXT_FILE_KINDS, parseOrgContextFileKind } from './kinds';
import { defaultMarkdownForKind } from './templates';
import type { OrgIdentityTemplateInput } from './templates';

export const MAX_ORG_CONTEXT_CONTENT_BYTES = 512_000;

export type { OrgIdentityTemplateInput };

export class OrgIdentityFilesService {
  constructor(private readonly db: PrismaClient) {}

  async getOrgSnapshot(orgId: string): Promise<OrgIdentityTemplateInput | null> {
    const o = await this.db.organization.findUnique({
      where: { id: orgId },
      select: {
        id: true,
        name: true,
        ein: true,
        fiscalYearEnd: true,
        annualRevenue: true,
        subscriptionTier: true,
      },
    });
    if (!o) return null;
    return {
      id: o.id,
      name: o.name,
      ein: o.ein,
      fiscalYearEnd: o.fiscalYearEnd,
      annualRevenue: o.annualRevenue === null || o.annualRevenue === undefined ? null : o.annualRevenue.toString(),
      subscriptionTier: o.subscriptionTier,
    };
  }

  /**
   * Creates missing rows only; never overwrites existing content (safe default).
   */
  async ensureDefaults(orgId: string): Promise<void> {
    const org = await this.getOrgSnapshot(orgId);
    if (!org) throw new Error('ORG_NOT_FOUND');

    for (const kind of ORG_CONTEXT_FILE_KINDS) {
      const existing = await this.db.orgContextFile.findUnique({
        where: { orgId_kind: { orgId, kind } },
        select: { id: true },
      });
      if (existing) continue;
      const content = defaultMarkdownForKind(kind, org);
      await this.db.orgContextFile.create({
        data: { orgId, kind, content },
      });
    }
  }

  async list(orgId: string, opts?: { ensureDefaults?: boolean }) {
    if (opts?.ensureDefaults !== false) {
      await this.ensureDefaults(orgId);
    }
    return this.db.orgContextFile.findMany({
      where: { orgId },
      orderBy: { kind: 'asc' },
    });
  }

  async get(orgId: string, kind: OrgContextFileKind) {
    await this.ensureDefaults(orgId);
    return this.db.orgContextFile.findUnique({
      where: { orgId_kind: { orgId, kind } },
    });
  }

  async upsertContent(orgId: string, kind: OrgContextFileKind, content: string): Promise<void> {
    OrgIdentityFilesService.assertContentSize(content);
    const org = await this.getOrgSnapshot(orgId);
    if (!org) throw new Error('ORG_NOT_FOUND');

    await this.db.orgContextFile.upsert({
      where: { orgId_kind: { orgId, kind } },
      create: { orgId, kind, content },
      update: { content },
    });
  }

  static assertContentSize(content: string): void {
    const bytes = Buffer.byteLength(content, 'utf8');
    if (bytes > MAX_ORG_CONTEXT_CONTENT_BYTES) throw new Error('CONTENT_TOO_LARGE');
  }
}

export { parseOrgContextFileKind, ORG_CONTEXT_FILE_KINDS };
