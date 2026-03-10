import { Router, type NextFunction, type Request, type Response } from 'express';
import { createJwtAuthMiddleware } from '@magnus/auth/jwtAuth';
import { requireFeature } from '@magnus/subscription';
import type { DbClient } from '../db';
import { PromptLibraryService } from '../services/PromptLibraryService';
import { OrgClaudeConfigService } from '../services/OrgClaudeConfigService';
import { UsageAuditService } from '../services/UsageAuditService';
import { ClaudeClient } from '../services/ClaudeClient';
import { onboardingWorkflow } from '../workflows/onboardingWorkflow';
import { promptDeploymentWorkflow } from '../workflows/promptDeploymentWorkflow';

export function buildRoutes(params: { db: DbClient; anthropicApiKey: string }): Router {
  const router = Router();
  const jwtAuth = createJwtAuthMiddleware();
  const requireClaudePartner = requireFeature('claude_partner');
  const promptLib = new PromptLibraryService(params.db);
  const cfgSvc = new OrgClaudeConfigService(params.db);
  const auditSvc = new UsageAuditService(params.db);
  const claude = new ClaudeClient({ apiKey: params.anthropicApiKey });

  router.get('/health', (_req, res) => res.json({ ok: true }));

  router.post('/api/claude/onboarding', jwtAuth, requireClaudePartner, asyncHandler(async (req, res) => {
    const orgId = (req as any).auth.orgId as string;
    const result = await onboardingWorkflow({ db: params.db, orgId });
    res.json(result);
  }));

  // New onboarding API: explicit orgId param.
  router.post('/api/claude/onboard/:orgId', jwtAuth, requireClaudePartner, asyncHandler(async (req, res) => {
    const headerOrgId = (req as any).auth.orgId as string;
    const orgId = String(req.params.orgId ?? '');
    if (!orgId) {
      res.status(400).json({ error: 'ORG_ID_REQUIRED' });
      return;
    }
    if (headerOrgId !== orgId) {
      res.status(403).json({ error: 'ORG_MISMATCH' });
      return;
    }
    const result = await onboardingWorkflow({ db: params.db, orgId });
    res.json(result);
  }));

  router.get('/api/claude/config', jwtAuth, requireClaudePartner, asyncHandler(async (req, res) => {
    const orgId = (req as any).auth.orgId as string;
    const cfg = await cfgSvc.get(orgId);
    if (!cfg) {
      res.status(404).json({ error: 'CLAUDE_CONFIG_NOT_FOUND' });
      return;
    }
    res.json({ config: cfg });
  }));

  router.get('/api/claude/prompts', jwtAuth, requireClaudePartner, asyncHandler(async (req, res) => {
    const orgId = (req as any).auth.orgId as string;
    const promptType = typeof req.query['promptType'] === 'string' ? req.query['promptType'] : undefined;
    if (!promptType) {
      res.status(400).json({ error: 'PROMPT_TYPE_REQUIRED' });
      return;
    }
    const parsed = parsePromptType(promptType);
    if (!parsed) {
      res.status(400).json({ error: 'PROMPT_TYPE_INVALID' });
      return;
    }
    const active = await promptLib.getActivePrompt(orgId, parsed);
    res.json({ activePrompt: active });
  }));

  router.post('/api/claude/prompts', jwtAuth, requireClaudePartner, asyncHandler(async (req, res) => {
    const orgId = (req as any).auth.orgId as string;
    await cfgSvc.ensurePartnerAccess(orgId);
    const promptType = typeof req.body?.promptType === 'string' ? req.body.promptType : '';
    const systemPrompt = typeof req.body?.systemPrompt === 'string' ? req.body.systemPrompt : '';
    const userTemplate = typeof req.body?.userTemplate === 'string' ? req.body.userTemplate : '';
    if (!promptType) {
      res.status(400).json({ error: 'PROMPT_TYPE_REQUIRED' });
      return;
    }
    const parsed = parsePromptType(promptType);
    if (!parsed) {
      res.status(400).json({ error: 'PROMPT_TYPE_INVALID' });
      return;
    }
    const created = await promptLib.createPromptVersion(orgId, parsed, systemPrompt, userTemplate);
    res.status(201).json({ prompt: created });
  }));

  router.post('/api/claude/prompts/deploy', jwtAuth, requireClaudePartner, asyncHandler(async (req, res) => {
    const orgId = (req as any).auth.orgId as string;
    const promptId = typeof req.body?.promptId === 'string' ? req.body.promptId : '';
    if (!promptId) {
      res.status(400).json({ error: 'PROMPT_ID_REQUIRED' });
      return;
    }
    await promptDeploymentWorkflow({ db: params.db, orgId, promptId });
    res.json({ ok: true });
  }));

  router.post('/api/claude/messages', jwtAuth, requireClaudePartner, asyncHandler(async (req, res) => {
    const orgId = (req as any).auth.orgId as string;

    // Partner-tier enforcement lives in the core service (not controller business logic).
    await cfgSvc.ensurePartnerAccess(orgId);
    const cfg = await cfgSvc.get(orgId);
    if (!cfg) {
      res.status(404).json({ error: 'CLAUDE_CONFIG_NOT_FOUND' });
      return;
    }

    const userText = typeof req.body?.userText === 'string' ? req.body.userText : '';
    if (!userText) {
      res.status(400).json({ error: 'USER_TEXT_REQUIRED' });
      return;
    }

    const system = typeof req.body?.system === 'string' ? req.body.system : undefined;
    const promptTypeRaw = typeof req.body?.promptType === 'string' ? req.body.promptType : '';
    const promptType = parsePromptType(promptTypeRaw);
    if (!promptType) {
      res.status(400).json({ error: 'PROMPT_TYPE_REQUIRED' });
      return;
    }
    const workerId = typeof req.body?.workerId === 'string' ? req.body.workerId : null;

    // Fail-closed: enforce usage cap before sending any request.
    await auditSvc.enforceUsageCap(orgId);

    const out = await claude.createMessage({
      orgId,
      userText,
      system,
      model: cfg.defaultModel,
      maxTokens: cfg.maxTokens,
      temperature: cfg.temperature,
    });

    // Audit usage (no LLM logic). If tokens are missing, fail closed.
    const tokenCount = (out.inputTokens ?? 0) + (out.outputTokens ?? 0);
    if (!Number.isFinite(tokenCount) || tokenCount <= 0) {
      throw new Error('TOKEN_USAGE_UNAVAILABLE');
    }
    await auditSvc.logUsage({
      orgId,
      workerId,
      promptType,
      tokenCount,
      costUsd: '0',
    });

    res.json({ message: out });
  }));

  return router;
}

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

function parsePromptType(s: string) {
  if (s === 'GRANT_DRAFT' || s === 'BOARD_REPORT' || s === 'DONOR_UPDATE' || s === 'INTERNAL_MEMO') return s;
  return null;
}
