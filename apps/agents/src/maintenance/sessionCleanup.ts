import { prisma } from '../db';

/**
 * Deletes expired sessions older than the retention period.
 *
 * Cleanup strategy:
 * - Sessions with expiresAt older than 90 days
 *
 * This prevents unbounded database growth and maintains compliance with
 * data retention policies.
 *
 * @returns Number of sessions deleted
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const cutoffDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  try {
    const result = await prisma.session.deleteMany({
      where: {
        expiresAt: {
          lt: cutoffDate,
        },
      },
    });

    const deletedCount = result.count;

    console.log(
      `[SessionCleanup] Deleted ${deletedCount} session(s) older than 90 days (cutoff: ${cutoffDate.toISOString()})`
    );

    return deletedCount;
  } catch (err) {
    console.error('[SessionCleanup] Failed to delete expired sessions:', err);
    throw err;
  }
}
