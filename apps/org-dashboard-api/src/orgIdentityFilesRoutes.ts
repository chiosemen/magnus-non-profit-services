import type { Express, RequestHandler } from 'express';
import prisma from '@magnus/db/client';
import type { OrgContextFileKind, PrismaClient } from '@magnus/db/types';
import {
  OrgIdentityFilesService,
  buildOrgContextValidationReport,
  parseOrgContextFileKind,
} from '@magnus/org-autonomous-ops-context';

export function registerOrgIdentityFilesRoutes(app: Express, jwtAuth: RequestHandler): void {
  const svc = new OrgIdentityFilesService(prisma as unknown as PrismaClient);

  app.get('/api/org/autonomous-ops/identity-files/report', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as { auth?: { orgId: string } }).auth?.orgId as string;
      const [orgRow, files] = await Promise.all([
        prisma.organization.findUnique({
          where: { id: orgId },
          select: { annualRevenue: true },
        }),
        svc.list(orgId, { ensureDefaults: true }),
      ]);
      const annualRevenueUsdSnapshot =
        orgRow?.annualRevenue === null || orgRow?.annualRevenue === undefined ? null : Number(orgRow.annualRevenue);
      const filesByKind = Object.fromEntries(files.map(f => [f.kind, { content: f.content }])) as Partial<
        Record<OrgContextFileKind, { content: string }>
      >;
      const report = buildOrgContextValidationReport({
        orgId,
        filesByKind,
        annualRevenueUsdSnapshot,
      });
      return res.json({ orgId, report });
    } catch (err) {
      if (err instanceof Error && err.message === 'ORG_NOT_FOUND') {
        return res.status(404).json({ error: 'ORG_NOT_FOUND' });
      }
      return next(err);
    }
  });

  app.get('/api/org/autonomous-ops/identity-files', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as { auth?: { orgId: string } }).auth?.orgId as string;
      const files = await svc.list(orgId);
      return res.json({
        orgId,
        files: files.map(f => ({
          id: f.id,
          kind: f.kind,
          content: f.content,
          updatedAt: f.updatedAt.toISOString(),
        })),
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'ORG_NOT_FOUND') {
        return res.status(404).json({ error: 'ORG_NOT_FOUND' });
      }
      return next(err);
    }
  });

  app.get('/api/org/autonomous-ops/identity-files/:kind', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as { auth?: { orgId: string } }).auth?.orgId as string;
      const kind = parseOrgContextFileKind(req.params['kind'] ?? '');
      if (!kind) return res.status(400).json({ error: 'INVALID_KIND' });

      const file = await svc.get(orgId, kind);
      if (!file) return res.status(404).json({ error: 'NOT_FOUND' });
      return res.json({
        orgId,
        kind: file.kind,
        id: file.id,
        content: file.content,
        updatedAt: file.updatedAt.toISOString(),
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'ORG_NOT_FOUND') {
        return res.status(404).json({ error: 'ORG_NOT_FOUND' });
      }
      return next(err);
    }
  });

  app.put('/api/org/autonomous-ops/identity-files/:kind', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as { auth?: { orgId: string } }).auth?.orgId as string;
      const kind = parseOrgContextFileKind(req.params['kind'] ?? '');
      if (!kind) return res.status(400).json({ error: 'INVALID_KIND' });

      const body = req.body as { content?: unknown };
      if (body === null || typeof body !== 'object' || typeof body.content !== 'string') {
        return res.status(400).json({ error: 'INVALID_BODY' });
      }

      await svc.upsertContent(orgId, kind, body.content);
      const file = await svc.get(orgId, kind);
      return res.json({
        orgId,
        kind: file?.kind,
        id: file?.id,
        content: file?.content,
        updatedAt: file?.updatedAt.toISOString(),
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'ORG_NOT_FOUND') {
        return res.status(404).json({ error: 'ORG_NOT_FOUND' });
      }
      if (err instanceof Error && err.message === 'CONTENT_TOO_LARGE') {
        return res.status(413).json({ error: 'CONTENT_TOO_LARGE' });
      }
      return next(err);
    }
  });
}
