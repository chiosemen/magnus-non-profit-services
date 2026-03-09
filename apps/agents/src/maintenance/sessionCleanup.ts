import { prisma } from '../db';

/**
 * Deletes expired and revoked sessions older than the retention period.
 *
 * Cleanup strategy:
 * - Sessions with revokedAt older than 90 days
 * - Sessions with expiresAt older than 90 days
 *
 * This prevents unbounded database growth and maintains compliance with
 * data retention policies.
 *
 * @returns Number of sessions deleted
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const retentionDays = 90;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  try {
    const result = await prisma.session.deleteMany({
      where: {
        OR: [
          {
            revokedAt: {
              not: null,
              lt: cutoffDate,
            },
          },
          {
            expiresAt: {
              lt: cutoffDate,
            },
          },
        ],
      },
    });

    const deletedCount = result.count;

    console.log(
      `[SessionCleanup] Deleted ${deletedCount} session(s) older than ${retentionDays} days (cutoff: ${cutoffDate.toISOString()})`
    );

    return deletedCount;
  } catch (err) {
    console.error('[SessionCleanup] Failed to delete expired sessions:', err);
    throw err;
  }
}
