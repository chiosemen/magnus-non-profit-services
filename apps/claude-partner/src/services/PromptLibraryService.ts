import type { Prisma, PrismaClient } from '@magnus/db/types';
import type { PromptType, OrgPromptLibraryRecord } from '../contracts/prompts';

type Db = PrismaClient | Prisma.TransactionClient;

export class PromptLibraryService {
  private readonly db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  async createPromptVersion(
    orgId: string,
    promptType: PromptType,
    systemPrompt: string,
    userTemplate: string,
  ): Promise<OrgPromptLibraryRecord> {
    validateSystemPrompt(systemPrompt);
    validateUserTemplate(userTemplate);

    const name = promptType; // deterministic default name

    // Version auto-increments per org + promptType.
    // If called outside a transaction, wrap in one and retry on unique conflicts.
    if (hasTransaction(this.db)) {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          return await this.db.$transaction(async tx => this.createPromptVersionInTx(tx, orgId, promptType, name, systemPrompt, userTemplate));
        } catch (err: any) {
          if (err?.code === 'P2002') continue;
          throw err;
        }
      }
      throw new Error('PROMPT_VERSION_CREATE_CONFLICT');
    }

    // Already in a transaction: do not nest.
    return this.createPromptVersionInTx(this.db, orgId, promptType, name, systemPrompt, userTemplate);
  }

  async activatePromptVersion(promptId: string): Promise<void> {
    // Only one active version per org + promptType.
    if (hasTransaction(this.db)) {
      await this.db.$transaction(async tx => this.activatePromptVersionInTx(tx, promptId));
      return;
    }
    await this.activatePromptVersionInTx(this.db, promptId);
  }

  async getActivePrompt(orgId: string, promptType: PromptType): Promise<OrgPromptLibraryRecord | null> {
    const row = await this.db.orgPromptLibrary.findFirst({
      where: { orgId, promptType: promptType as any, isActive: true },
      orderBy: [{ version: 'desc' }],
      select: {
        id: true,
        orgId: true,
        name: true,
        promptType: true,
        systemPrompt: true,
        userTemplate: true,
        version: true,
        isActive: true,
        createdAt: true,
      },
    });
    return row ? mapRow(row) : null;
  }

  private async createPromptVersionInTx(
    tx: Prisma.TransactionClient,
    orgId: string,
    promptType: PromptType,
    name: string,
    systemPrompt: string,
    userTemplate: string,
  ): Promise<OrgPromptLibraryRecord> {
    const latest = await tx.orgPromptLibrary.findFirst({
      where: { orgId, promptType: promptType as any },
      orderBy: [{ version: 'desc' }],
      select: { version: true },
    });
    const nextVersion = (latest?.version ?? 0) + 1;

    const row = await tx.orgPromptLibrary.create({
      data: {
        orgId,
        name,
        promptType: promptType as any,
        systemPrompt,
        userTemplate,
        version: nextVersion,
        isActive: false,
        createdAt: new Date(),
      },
      select: {
        id: true,
        orgId: true,
        name: true,
        promptType: true,
        systemPrompt: true,
        userTemplate: true,
        version: true,
        isActive: true,
        createdAt: true,
      },
    });
    return mapRow(row);
  }

  private async activatePromptVersionInTx(tx: Prisma.TransactionClient, promptId: string): Promise<void> {
    const row = await tx.orgPromptLibrary.findUnique({
      where: { id: promptId },
      select: { id: true, orgId: true, promptType: true },
    });
    if (!row) throw new Error('PROMPT_NOT_FOUND');

    await tx.orgPromptLibrary.updateMany({
      where: { orgId: row.orgId, promptType: row.promptType },
      data: { isActive: false },
    });

    await tx.orgPromptLibrary.update({
      where: { id: row.id },
      data: { isActive: true },
      select: { id: true },
    });
  }
}

function hasTransaction(db: Db): db is PrismaClient {
  return typeof (db as any).$transaction === 'function';
}

function validateSystemPrompt(systemPrompt: string): void {
  const s = systemPrompt.trim();
  if (s.length < 20) throw new Error('SYSTEM_PROMPT_TOO_SHORT');
  // Must include an explicit role definition.
  const hasRole = /(you are|role:|act as)/i.test(s);
  if (!hasRole) throw new Error('SYSTEM_PROMPT_ROLE_REQUIRED');
}

function validateUserTemplate(userTemplate: string): void {
  const s = userTemplate.trim();
  if (s.length < 10) throw new Error('USER_TEMPLATE_TOO_SHORT');
  // Must contain at least one variable placeholder (support {{var}} and ${var}).
  const hasPlaceholder = /{{\s*[\w.]+\s*}}|\$\{\s*[\w.]+\s*\}/.test(s);
  if (!hasPlaceholder) throw new Error('USER_TEMPLATE_PLACEHOLDER_REQUIRED');
}

function mapRow(row: any): OrgPromptLibraryRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    name: row.name,
    promptType: row.promptType,
    systemPrompt: row.systemPrompt,
    userTemplate: row.userTemplate,
    version: row.version,
    isActive: row.isActive,
    createdAt: row.createdAt,
  };
}
