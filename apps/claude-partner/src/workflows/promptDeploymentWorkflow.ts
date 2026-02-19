import type { PrismaClient } from '@magnus/db/types';
import { OrgClaudeConfigService } from '../services/OrgClaudeConfigService';
import { PromptLibraryService } from '../services/PromptLibraryService';

export async function promptDeploymentWorkflow(params: { db: PrismaClient; orgId: string; promptId: string }): Promise<void> {
  const cfgSvc = new OrgClaudeConfigService(params.db);
  const libSvc = new PromptLibraryService(params.db);

  // Enforce partner tier on deployment operations.
  await cfgSvc.ensurePartnerAccess(params.orgId);

  await libSvc.activatePromptVersion(params.promptId);
}
