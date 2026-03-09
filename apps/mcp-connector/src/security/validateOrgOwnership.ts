/**
 * Magnus MCP Connector — Organization Ownership Validation
 * Prevents cross-tenant access by validating that EINs belong to the authenticated orgId
 */

import { prisma } from '@magnus/db';
import { MagnusError } from '../utils/errors';

/**
 * Validates that an EIN belongs to the authenticated organization.
 *
 * Security: Prevents cross-tenant access vulnerability where authenticated users
 * could pass EINs from other organizations to access their data.
 *
 * @param ein - The EIN to validate (will be cleaned of non-digits)
 * @param orgId - The authenticated organization ID from JWT
 * @throws MagnusError with 403 status if EIN doesn't belong to orgId
 * @throws MagnusError with 404 status if EIN is not found in database
 */
export async function validateOrgOwnership(ein: string, orgId: string): Promise<void> {
  // Clean EIN (remove dashes, spaces)
  const cleanEIN = ein.replace(/\D/g, '');

  // Lookup organization by EIN
  const org = await prisma.organization.findUnique({
    where: { ein: cleanEIN },
    select: { id: true },
  });

  // EIN not found
  if (!org) {
    throw new MagnusError(
      `Organization with EIN ${cleanEIN} not found`,
      'ORG_NOT_FOUND',
      404
    );
  }

  // EIN belongs to different organization
  if (org.id !== orgId) {
    throw new MagnusError(
      'Forbidden: EIN does not belong to authenticated organization',
      'FORBIDDEN',
      403
    );
  }

  // Success: EIN belongs to authenticated org
}

/**
 * Validates that a worker ID belongs to an organization accessible by the authenticated orgId.
 *
 * Security: Prevents access to workers from other organizations.
 *
 * @param workerId - The worker ID to validate
 * @param orgId - The authenticated organization ID from JWT
 * @throws MagnusError with 403 status if worker doesn't belong to an org accessible by orgId
 * @throws MagnusError with 404 status if worker is not found
 */
export async function validateWorkerAccess(workerId: string, orgId: string): Promise<void> {
  // Check if worker exists and has relationship with this org
  const relationship = await prisma.workerOrgRelationship.findFirst({
    where: {
      workerId,
      orgId,
    },
    select: { id: true },
  });

  if (!relationship) {
    // Check if worker exists at all
    const workerExists = await prisma.worker.findUnique({
      where: { id: workerId },
      select: { id: true },
    });

    if (!workerExists) {
      throw new MagnusError(
        `Worker with ID ${workerId} not found`,
        'WORKER_NOT_FOUND',
        404
      );
    }

    // Worker exists but not linked to this org
    throw new MagnusError(
      'Forbidden: Worker does not belong to authenticated organization',
      'FORBIDDEN',
      403
    );
  }

  // Success: Worker is linked to authenticated org
}
