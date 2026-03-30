import { Prisma } from '@magnus/db/types';
import prisma from '@magnus/db/client';
import type { PartnerUserRole } from '@magnus/db/types';
import { parseProgramEnabledFeatures, ProgramFeatureParseError } from '@magnus/subscription';
import {
  getPartnerPortfolioSummary,
  type PartnerPortfolioSummaryResult,
} from './partnerPortfolioService';

export class PartnerProgramInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PartnerProgramInputError';
  }
}

export class PartnerProgramNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PartnerProgramNotFoundError';
  }
}

export type PartnerProgramDto = {
  id: string;
  partnerId: string;
  label: string;
  slug: string | null;
  isActive: boolean;
  notes: string | null;
  enabledFeatures: string[];
  createdAt: Date;
  updatedAt: Date;
};

export type PartnerProgramSummaryResult = PartnerPortfolioSummaryResult & {
  program: {
    id: string;
    label: string;
    slug: string | null;
    isActive: boolean;
    notes: string | null;
    enabledFeatures: string[];
  };
};

const MAX_LABEL_LEN = 200;
const MAX_NOTES_LEN = 4000;
const MAX_SLUG_LEN = 64;

function trimOrNull(s: string | null | undefined): string | null {
  if (s === null || s === undefined) return null;
  const t = s.trim();
  return t.length === 0 ? null : t;
}

export async function listPartnerPrograms(partnerId: string): Promise<PartnerProgramDto[]> {
  const rows = await prisma.partnerProgram.findMany({
    where: { partnerId },
    orderBy: [{ label: 'asc' }],
  });
  return rows.map(toDto);
}

function toDto(p: {
  id: string;
  partnerId: string;
  label: string;
  slug: string | null;
  isActive: boolean;
  notes: string | null;
  enabledFeatures: string[];
  createdAt: Date;
  updatedAt: Date;
}): PartnerProgramDto {
  return {
    id: p.id,
    partnerId: p.partnerId,
    label: p.label,
    slug: p.slug,
    isActive: p.isActive,
    notes: p.notes,
    enabledFeatures: [...p.enabledFeatures],
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

export async function createPartnerProgram(
  partnerId: string,
  input: {
    label: string;
    slug?: string | null;
    notes?: string | null;
    enabledFeatures?: unknown;
    isActive?: boolean;
  }
): Promise<PartnerProgramDto> {
  const label = input.label.trim();
  if (!label) throw new PartnerProgramInputError('label_required');
  if (label.length > MAX_LABEL_LEN) throw new PartnerProgramInputError('label_too_long');

  let enabled: string[];
  try {
    enabled = parseProgramEnabledFeatures(input.enabledFeatures ?? []);
  } catch (e) {
    if (e instanceof ProgramFeatureParseError) throw new PartnerProgramInputError(e.message);
    throw e;
  }

  const slug = trimOrNull(input.slug ?? null);
  if (slug && slug.length > MAX_SLUG_LEN) throw new PartnerProgramInputError('slug_too_long');

  const notes = input.notes === undefined ? null : trimOrNull(input.notes);
  if (notes && notes.length > MAX_NOTES_LEN) throw new PartnerProgramInputError('notes_too_long');

  try {
    const created = await prisma.partnerProgram.create({
      data: {
        partnerId,
        label,
        slug,
        notes,
        enabledFeatures: enabled,
        isActive: input.isActive ?? true,
      },
    });
    return toDto(created);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new PartnerProgramInputError('PROGRAM_SLUG_CONFLICT');
    }
    throw err;
  }
}

export async function updatePartnerProgram(
  partnerId: string,
  programId: string,
  patch: {
    label?: string;
    slug?: string | null;
    notes?: string | null;
    enabledFeatures?: unknown;
    isActive?: boolean;
  }
): Promise<PartnerProgramDto> {
  const existing = await prisma.partnerProgram.findFirst({
    where: { id: programId, partnerId },
  });
  if (!existing) throw new PartnerProgramNotFoundError('PARTNER_PROGRAM_NOT_FOUND');

  const data: Prisma.PartnerProgramUpdateInput = {};
  if (Object.prototype.hasOwnProperty.call(patch, 'label')) {
    const label = typeof patch.label === 'string' ? patch.label.trim() : '';
    if (!label) throw new PartnerProgramInputError('label_required');
    if (label.length > MAX_LABEL_LEN) throw new PartnerProgramInputError('label_too_long');
    data.label = label;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'slug')) {
    const slug = trimOrNull(patch.slug ?? null);
    if (slug && slug.length > MAX_SLUG_LEN) throw new PartnerProgramInputError('slug_too_long');
    data.slug = slug;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'notes')) {
    const n = patch.notes === null ? null : trimOrNull(patch.notes);
    if (n && n.length > MAX_NOTES_LEN) throw new PartnerProgramInputError('notes_too_long');
    data.notes = n;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'isActive') && typeof patch.isActive === 'boolean') {
    data.isActive = patch.isActive;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'enabledFeatures')) {
    try {
      data.enabledFeatures = { set: parseProgramEnabledFeatures(patch.enabledFeatures) };
    } catch (e) {
      if (e instanceof ProgramFeatureParseError) throw new PartnerProgramInputError(e.message);
      throw e;
    }
  }

  if (Object.keys(data).length === 0) throw new PartnerProgramInputError('no_updatable_fields');

  try {
    const updated = await prisma.partnerProgram.update({
      where: { id: programId },
      data,
    });
    return toDto(updated);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new PartnerProgramInputError('PROGRAM_SLUG_CONFLICT');
    }
    throw err;
  }
}

export async function getPartnerProgramSummary(
  partnerId: string,
  programId: string,
  params: { role: PartnerUserRole; includeInactive: boolean; now?: Date }
): Promise<PartnerProgramSummaryResult> {
  const program = await prisma.partnerProgram.findFirst({
    where: { id: programId, partnerId },
  });
  if (!program) throw new PartnerProgramNotFoundError('PARTNER_PROGRAM_NOT_FOUND');

  const portfolio = await getPartnerPortfolioSummary(partnerId, {
    role: params.role,
    includeInactive: params.includeInactive,
    filters: { programId },
    now: params.now,
  });

  return {
    ...portfolio,
    program: {
      id: program.id,
      label: program.label,
      slug: program.slug,
      isActive: program.isActive,
      notes: program.notes,
      enabledFeatures: [...program.enabledFeatures],
    },
  };
}

export function parsePartnerProgramPatchBody(body: unknown): {
  label?: string;
  slug?: string | null;
  notes?: string | null;
  enabledFeatures?: unknown;
  isActive?: boolean;
} {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new PartnerProgramInputError('object_body_required');
  }
  const o = body as Record<string, unknown>;
  const out: {
    label?: string;
    slug?: string | null;
    notes?: string | null;
    enabledFeatures?: unknown;
    isActive?: boolean;
  } = {};
  if (Object.prototype.hasOwnProperty.call(o, 'label')) {
    if (typeof o['label'] !== 'string') throw new PartnerProgramInputError('label_invalid');
    out.label = o['label'];
  }
  if (Object.prototype.hasOwnProperty.call(o, 'slug')) {
    if (o['slug'] === null || o['slug'] === undefined) out.slug = null;
    else if (typeof o['slug'] === 'string') out.slug = o['slug'];
    else throw new PartnerProgramInputError('slug_invalid');
  }
  if (Object.prototype.hasOwnProperty.call(o, 'notes')) {
    if (o['notes'] === null || o['notes'] === undefined) out.notes = null;
    else if (typeof o['notes'] === 'string') out.notes = o['notes'];
    else throw new PartnerProgramInputError('notes_invalid');
  }
  if (Object.prototype.hasOwnProperty.call(o, 'enabledFeatures')) {
    out.enabledFeatures = o['enabledFeatures'];
  }
  if (Object.prototype.hasOwnProperty.call(o, 'isActive')) {
    if (typeof o['isActive'] !== 'boolean') throw new PartnerProgramInputError('isActive_invalid');
    out.isActive = o['isActive'];
  }
  if (Object.keys(out).length === 0) throw new PartnerProgramInputError('no_updatable_fields');
  return out;
}

export function parsePartnerProgramCreateBody(body: unknown): {
  label: string;
  slug?: string | null;
  notes?: string | null;
  enabledFeatures?: unknown;
  isActive?: boolean;
} {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new PartnerProgramInputError('object_body_required');
  }
  const o = body as Record<string, unknown>;
  if (typeof o['label'] !== 'string' || o['label'].trim().length === 0) {
    throw new PartnerProgramInputError('label_required');
  }
  const out: {
    label: string;
    slug?: string | null;
    notes?: string | null;
    enabledFeatures?: unknown;
    isActive?: boolean;
  } = { label: o['label'] };
  if (Object.prototype.hasOwnProperty.call(o, 'slug')) {
    if (o['slug'] === null || o['slug'] === undefined) out.slug = null;
    else if (typeof o['slug'] === 'string') out.slug = o['slug'];
    else throw new PartnerProgramInputError('slug_invalid');
  }
  if (Object.prototype.hasOwnProperty.call(o, 'notes')) {
    if (o['notes'] === null || o['notes'] === undefined) out.notes = null;
    else if (typeof o['notes'] === 'string') out.notes = o['notes'];
    else throw new PartnerProgramInputError('notes_invalid');
  }
  if (Object.prototype.hasOwnProperty.call(o, 'enabledFeatures')) {
    out.enabledFeatures = o['enabledFeatures'];
  }
  if (Object.prototype.hasOwnProperty.call(o, 'isActive')) {
    if (typeof o['isActive'] !== 'boolean') throw new PartnerProgramInputError('isActive_invalid');
    out.isActive = o['isActive'];
  }
  return out;
}
