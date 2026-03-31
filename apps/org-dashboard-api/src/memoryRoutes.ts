import type { Express, RequestHandler } from 'express';
import prisma from '@magnus/db/client';
import type { PrismaClient } from '@magnus/db/types';
import { OrgMemoryService, AUTONOMOUS_OPS_MEMORY_DISCLAIMER } from '@magnus/org-autonomous-ops-context';

export function registerMemoryRoutes(app: Express, jwtAuth: RequestHandler): void {
  const svc = new OrgMemoryService(prisma as unknown as PrismaClient);

  app.post('/api/org/autonomous-ops/memory/operational', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as { auth?: { orgId: string } }).auth?.orgId as string;
      const b = req.body as Record<string, unknown>;
      if (typeof b.agentName !== 'string' || typeof b.kind !== 'string') {
        return res.status(400).json({ error: 'INVALID_BODY' });
      }
      const row = await svc.appendOperational(orgId, {
        agentName: b.agentName,
        kind: b.kind,
        payload: b.payload,
        sourceRefs: b.sourceRefs,
        agentRunId: typeof b.agentRunId === 'string' ? b.agentRunId : undefined,
        confidence: typeof b.confidence === 'number' ? b.confidence : null,
      });
      return res.status(201).json({
        disclaimer: AUTONOMOUS_OPS_MEMORY_DISCLAIMER,
        entry: row,
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'ORG_NOT_FOUND') return res.status(404).json({ error: 'ORG_NOT_FOUND' });
      if (err instanceof Error && err.message === 'INVALID_OPERATIONAL_FIELDS') {
        return res.status(400).json({ error: 'INVALID_OPERATIONAL_FIELDS' });
      }
      if (err instanceof Error && err.message === 'INVALID_SOURCE_REFS') {
        return res.status(400).json({ error: 'INVALID_SOURCE_REFS' });
      }
      if (err instanceof Error && err.message === 'INVALID_CONFIDENCE') {
        return res.status(400).json({ error: 'INVALID_CONFIDENCE' });
      }
      if (err instanceof Error && err.message === 'INVALID_RELATED_RUN') {
        return res.status(400).json({ error: 'INVALID_RELATED_RUN' });
      }
      return next(err);
    }
  });

  app.get('/api/org/autonomous-ops/memory/operational', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as { auth?: { orgId: string } }).auth?.orgId as string;
      const includeRecallDisabled = req.query.includeRecallDisabled === 'true';
      const take = req.query.take ? parseInt(String(req.query.take), 10) : undefined;
      const entries = await svc.listOperational(orgId, { includeRecallDisabled, take });
      return res.json({
        disclaimer: AUTONOMOUS_OPS_MEMORY_DISCLAIMER,
        orgId,
        entries,
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'ORG_NOT_FOUND') return res.status(404).json({ error: 'ORG_NOT_FOUND' });
      return next(err);
    }
  });

  app.patch('/api/org/autonomous-ops/memory/operational/:id/recall', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as { auth?: { orgId: string } }).auth?.orgId as string;
      const b = req.body as { disabled?: unknown; reason?: unknown };
      if (typeof b.disabled !== 'boolean') return res.status(400).json({ error: 'INVALID_BODY' });
      const row = await svc.setOperationalRecallDisabled(
        orgId,
        req.params.id,
        b.disabled,
        typeof b.reason === 'string' ? b.reason : null,
      );
      return res.json({ disclaimer: AUTONOMOUS_OPS_MEMORY_DISCLAIMER, entry: row });
    } catch (err) {
      if (err instanceof Error && err.message === 'ORG_NOT_FOUND') return res.status(404).json({ error: 'ORG_NOT_FOUND' });
      if (err instanceof Error && err.message === 'ENTRY_NOT_FOUND') {
        return res.status(404).json({ error: 'ENTRY_NOT_FOUND' });
      }
      return next(err);
    }
  });

  app.post('/api/org/autonomous-ops/memory/curated', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as { auth?: { orgId: string } }).auth?.orgId as string;
      const b = req.body as Record<string, unknown>;
      if (typeof b.body !== 'string') return res.status(400).json({ error: 'INVALID_BODY' });
      const row = await svc.createCurated(orgId, {
        body: b.body,
        title: typeof b.title === 'string' ? b.title : null,
        confidence: typeof b.confidence === 'number' ? b.confidence : undefined,
        sourceRefs: b.sourceRefs,
        createdBy: typeof b.createdBy === 'string' ? b.createdBy : null,
      });
      return res.status(201).json({ disclaimer: AUTONOMOUS_OPS_MEMORY_DISCLAIMER, item: row });
    } catch (err) {
      if (err instanceof Error && err.message === 'ORG_NOT_FOUND') return res.status(404).json({ error: 'ORG_NOT_FOUND' });
      if (err instanceof Error && err.message === 'BODY_REQUIRED') return res.status(400).json({ error: 'BODY_REQUIRED' });
      if (err instanceof Error && err.message === 'BODY_TOO_LARGE') return res.status(413).json({ error: 'BODY_TOO_LARGE' });
      if (err instanceof Error && err.message === 'INVALID_SOURCE_REFS') {
        return res.status(400).json({ error: 'INVALID_SOURCE_REFS' });
      }
      if (err instanceof Error && err.message === 'INVALID_CONFIDENCE') {
        return res.status(400).json({ error: 'INVALID_CONFIDENCE' });
      }
      return next(err);
    }
  });

  app.get('/api/org/autonomous-ops/memory/curated', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as { auth?: { orgId: string } }).auth?.orgId as string;
      const includeInactive = req.query.includeInactive === 'true';
      const take = req.query.take ? parseInt(String(req.query.take), 10) : undefined;
      const items = await svc.listCurated(orgId, { includeInactive, take });
      return res.json({
        disclaimer: AUTONOMOUS_OPS_MEMORY_DISCLAIMER,
        orgId,
        items,
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'ORG_NOT_FOUND') return res.status(404).json({ error: 'ORG_NOT_FOUND' });
      return next(err);
    }
  });

  app.patch('/api/org/autonomous-ops/memory/curated/:id/deactivate', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as { auth?: { orgId: string } }).auth?.orgId as string;
      const row = await svc.deactivateCurated(orgId, req.params.id);
      return res.json({ disclaimer: AUTONOMOUS_OPS_MEMORY_DISCLAIMER, item: row });
    } catch (err) {
      if (err instanceof Error && err.message === 'ORG_NOT_FOUND') return res.status(404).json({ error: 'ORG_NOT_FOUND' });
      if (err instanceof Error && err.message === 'ITEM_NOT_FOUND') return res.status(404).json({ error: 'ITEM_NOT_FOUND' });
      return next(err);
    }
  });

  app.post('/api/org/autonomous-ops/memory/semantic/chunks', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as { auth?: { orgId: string } }).auth?.orgId as string;
      const b = req.body as Record<string, unknown>;
      if (typeof b.chunkText !== 'string') return res.status(400).json({ error: 'INVALID_BODY' });
      const row = await svc.ingestSemanticChunk(orgId, {
        chunkText: b.chunkText,
        confidence: typeof b.confidence === 'number' ? b.confidence : undefined,
        sourceRefs: b.sourceRefs,
      });
      return res.status(201).json({
        disclaimer: AUTONOMOUS_OPS_MEMORY_DISCLAIMER,
        chunk: row,
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'ORG_NOT_FOUND') return res.status(404).json({ error: 'ORG_NOT_FOUND' });
      if (err instanceof Error && err.message === 'CHUNK_REQUIRED') return res.status(400).json({ error: 'CHUNK_REQUIRED' });
      if (err instanceof Error && err.message === 'CHUNK_TOO_LARGE') return res.status(413).json({ error: 'CHUNK_TOO_LARGE' });
      if (err instanceof Error && err.message === 'INVALID_SOURCE_REFS') {
        return res.status(400).json({ error: 'INVALID_SOURCE_REFS' });
      }
      if (err instanceof Error && err.message === 'INVALID_CONFIDENCE') {
        return res.status(400).json({ error: 'INVALID_CONFIDENCE' });
      }
      return next(err);
    }
  });

  app.get('/api/org/autonomous-ops/memory/semantic/search', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as { auth?: { orgId: string } }).auth?.orgId as string;
      const q = typeof req.query.q === 'string' ? req.query.q : '';
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
      const result = await svc.searchSemantic(orgId, q, limit);
      return res.json(result);
    } catch (err) {
      if (err instanceof Error && err.message === 'ORG_NOT_FOUND') return res.status(404).json({ error: 'ORG_NOT_FOUND' });
      return next(err);
    }
  });
}
