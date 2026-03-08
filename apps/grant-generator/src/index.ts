import { validateEnv } from '@magnus/config';
validateEnv('grant-generator');

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { z } from 'zod';
import { prisma } from '@magnus/db/client';
import { createJwtAuthMiddleware, type AuthContext } from '@magnus/auth';
import { getClaudeClient } from '../services/ClaudeClient';
import { QualityValidator } from '../services/QualityValidator';
import PROMPT_TEMPLATES from '../prompts/grantSectionTemplates';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: false }));
app.use(express.json());

// Health check - no auth required
app.get('/health', (_req, res) => res.json({ ok: true }));

// Auth middleware for all /api routes
const authMiddleware = createJwtAuthMiddleware();

// ─── Request Validation Schemas ──────────────────────────────────────────────

const GenerateRequestSchema = z.object({
  funderName: z.string().min(1).max(200),
  programName: z.string().min(1).max(200),
  requestedAmount: z.number().positive().max(100_000_000),
  projectDescription: z.string().min(50).max(5000),
  targetPopulation: z.string().min(10).max(1000),
  sections: z.array(z.enum([
    'executive_summary',
    'need_statement',
    'program_design',
    'evaluation_plan',
    'organizational_capacity',
    'budget_narrative',
    'sustainability',
  ])).min(1).max(7).default([
    'executive_summary',
    'need_statement',
    'program_design',
    'evaluation_plan',
  ]),
});

// ─── Routes ──────────────────────────────────────────────────────────────────

// POST /api/grants/generate - Generate a new grant proposal
app.post('/api/grants/generate', authMiddleware, async (req, res) => {
  const auth = req.auth!;
  const parseResult = GenerateRequestSchema.safeParse(req.body);

  if (!parseResult.success) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      details: parseResult.error.flatten().fieldErrors,
    });
  }

  const { funderName, programName, requestedAmount, projectDescription, targetPopulation, sections } = parseResult.data;

  try {
    // Fetch org info for context
    const org = await prisma.organization.findUnique({
      where: { id: auth.orgId },
      select: { id: true, name: true, ein: true },
    });

    if (!org) {
      return res.status(404).json({ error: 'ORG_NOT_FOUND' });
    }

    // Create proposal record in GENERATING state
    const proposal = await prisma.grantProposal.create({
      data: {
        orgId: auth.orgId,
        funderName,
        programName,
        requestedAmount,
        status: 'GENERATING',
        sections: {},
      },
    });

    // Generate sections using Claude
    const claude = getClaudeClient();
    const validator = new QualityValidator();
    const generatedSections: Record<string, {
      title: string;
      content: string;
      wordCount: number;
      qualityScore: number;
    }> = {};

    let totalQualityScore = 0;

    for (const sectionType of sections) {
      const template = PROMPT_TEMPLATES[sectionType];
      if (!template) continue;

      const prompt = buildSectionPrompt({
        sectionType,
        template: {
          title: template.title,
          wordLimit: template.wordLimit,
          instructions: `Write a ${template.title} section following best practices for grant proposals.`,
        },
        orgName: org.name,
        funderName,
        programName,
        projectDescription,
        targetPopulation,
        requestedAmount,
      });

      const result = await claude.generate(prompt, {
        system: template.systemPrompt,
        maxTokens: 2000,
      });

      const validation = validator.validate(sectionType, result.content);

      generatedSections[sectionType] = {
        title: template.title,
        content: result.content,
        wordCount: validation.wordCount,
        qualityScore: validation.overallScore,
      };

      totalQualityScore += validation.overallScore;
    }

    const avgQualityScore = Math.round(totalQualityScore / sections.length);

    // Update proposal with generated content
    const updatedProposal = await prisma.grantProposal.update({
      where: { id: proposal.id },
      data: {
        status: 'COMPLETE',
        sections: generatedSections,
        qualityScore: avgQualityScore,
        generatedAt: new Date(),
      },
    });

    return res.status(201).json({
      id: updatedProposal.id,
      status: updatedProposal.status,
      funderName: updatedProposal.funderName,
      programName: updatedProposal.programName,
      requestedAmount: Number(updatedProposal.requestedAmount),
      qualityScore: updatedProposal.qualityScore,
      sections: updatedProposal.sections,
      generatedAt: updatedProposal.generatedAt,
      createdAt: updatedProposal.createdAt,
    });
  } catch (err) {
    console.error('Grant generation error:', err);
    return res.status(500).json({ error: 'GENERATION_FAILED' });
  }
});

// GET /api/grants - List org's grant proposals
app.get('/api/grants', authMiddleware, async (req, res) => {
  const auth = req.auth!;

  try {
    const proposals = await prisma.grantProposal.findMany({
      where: { orgId: auth.orgId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        funderName: true,
        programName: true,
        requestedAmount: true,
        status: true,
        qualityScore: true,
        generatedAt: true,
        createdAt: true,
      },
    });

    return res.json({
      proposals: proposals.map(p => ({
        ...p,
        requestedAmount: Number(p.requestedAmount),
      })),
    });
  } catch (err) {
    console.error('List grants error:', err);
    return res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// GET /api/grants/:id - Get a specific grant proposal
app.get('/api/grants/:id', authMiddleware, async (req, res) => {
  const auth = req.auth!;
  const { id } = req.params;

  // Validate UUID format
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return res.status(400).json({ error: 'INVALID_ID' });
  }

  try {
    const proposal = await prisma.grantProposal.findUnique({
      where: { id },
    });

    if (!proposal) {
      return res.status(404).json({ error: 'NOT_FOUND' });
    }

    // Ensure org-scoping: only return if it belongs to the authenticated org
    if (proposal.orgId !== auth.orgId) {
      return res.status(404).json({ error: 'NOT_FOUND' });
    }

    return res.json({
      id: proposal.id,
      funderName: proposal.funderName,
      programName: proposal.programName,
      requestedAmount: Number(proposal.requestedAmount),
      status: proposal.status,
      qualityScore: proposal.qualityScore,
      sections: proposal.sections,
      generatedAt: proposal.generatedAt,
      createdAt: proposal.createdAt,
      updatedAt: proposal.updatedAt,
    });
  } catch (err) {
    console.error('Get grant error:', err);
    return res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// 404 handler
app.use((_req, res) => res.status(404).json({ error: 'NOT_FOUND' }));

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface SectionPromptParams {
  sectionType: string;
  template: { title: string; wordLimit: number; instructions: string };
  orgName: string;
  funderName: string;
  programName: string;
  projectDescription: string;
  targetPopulation: string;
  requestedAmount: number;
}

function buildSectionPrompt(params: SectionPromptParams): string {
  return `Write the "${params.template.title}" section for a grant proposal.

CONTEXT:
- Organization: ${params.orgName}
- Funder: ${params.funderName}
- Program: ${params.programName}
- Requested Amount: $${params.requestedAmount.toLocaleString()}
- Target Population: ${params.targetPopulation}

PROJECT DESCRIPTION:
${params.projectDescription}

SECTION REQUIREMENTS:
${params.template.instructions}

CONSTRAINTS:
- Word limit: ${params.template.wordLimit} words maximum
- Write in third person for the organization
- Use specific data and evidence where possible
- Avoid weak phrases like "we believe" or "we hope"
- Be direct and professional

Write only the section content, no headings or labels.`;
}

// ─── Start Server ────────────────────────────────────────────────────────────

const port = parseInt(process.env['PORT'] ?? '3002', 10);
app.listen(port, () => {
  console.log(`grant-generator listening on ${port}`);
});
