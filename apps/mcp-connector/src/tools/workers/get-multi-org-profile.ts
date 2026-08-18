/**
 * Magnus MCP Tool — get-multi-org-profile
 * Cross-org dashboard: combined metrics, alerts, side-by-side comparison.
 *
 * PRODUCTION CONTRACT:
 * - Returns NOT_FOUND (404-equivalent) when no orgs are registered for the user.
 * - Never falls back to hardcoded seed org data.
 * - WorkerService.getSeedOrgs has been DELETED — callers see NotFoundError.
 */

import { z } from 'zod';
import WorkerService from '../../services/WorkerService';
import { NotFoundError } from '../../utils/errors';
import { formatCurrency } from '../../utils/formatters';
import { renderMultiOrgProfile } from './renderMultiOrgProfile';

export const getMultiOrgProfileSchema = z.object({
  eins: z.array(z.string()).optional().describe('Filter to specific EINs (default: all linked orgs)'),
  include_comparison: z.boolean().default(true),
});

export type GetMultiOrgProfileInput = z.infer<typeof getMultiOrgProfileSchema>;

const service = new WorkerService();

export async function execute(
  input: GetMultiOrgProfileInput,
  context: { userId: string; orgId: string }
): Promise<string> {
  const { eins, include_comparison } = getMultiOrgProfileSchema.parse(input);
  const user_id = context.userId;

  try {
    const profile = await service.getMultiOrgProfile(user_id, eins);

    // P0-4 (R4): rendering lives in renderMultiOrgProfile — null values stay
    // null with provenance; a null filing status is never shown as
    // "✅ Current" and no health label is synthesized without a score.
    const output = renderMultiOrgProfile({
      profile,
      userId: user_id,
      includeComparison: include_comparison,
      formatCurrency,
    });

    return JSON.stringify(output, null, 2);

  } catch (err) {
    if (err instanceof NotFoundError) {
      return JSON.stringify({
        error: 'NOT_FOUND',
        code: err.code,
        message: err.message,
        onboarding_action:
          'No organizations are registered for this user. ' +
          'Add organizations via the Magnus dashboard before using this tool.',
        user_id,
      }, null, 2);
    }
    throw err;
  }
}

export default { name: 'get-multi-org-profile', schema: getMultiOrgProfileSchema, execute };
