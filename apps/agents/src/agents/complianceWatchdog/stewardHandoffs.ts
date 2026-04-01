import type { AlertEvent } from '../../contracts/events';
import type { CreateHandoffInput } from '@magnus/org-autonomous-ops-context';

/** Stable title for dedupe against existing OPEN handoffs to ORACLE. */
export const STEWARD_ORACLE_HANDOFF_TITLE = 'STEWARD → ORACLE: Compliance items for board visibility';

const ORACLE_AGENT_NAME = 'BoardIntelligenceOracle';
const STEWARD_AGENT_NAME = 'ComplianceWatchdog';

/**
 * When STEWARD emits any HIGH-severity compliance alerts, batch them into one internal handoff
 * for ORACLE (board prep). No external action.
 */
export function buildStewardOracleHandoffInput(alerts: AlertEvent[]): CreateHandoffInput | null {
  const high = alerts.filter(a => a.severity === 'HIGH');
  if (high.length === 0) return null;

  const lines = high.map(a => `- **${a.title}** (${a.type})\n  ${a.body.split('\n')[0] ?? ''}`);
  const body = [
    'STEWARD (ComplianceWatchdog) internal escalation for board / executive prep visibility.',
    '',
    '**HIGH-severity compliance signals (verify in dashboard and source systems):**',
    '',
    ...lines,
    '',
    '---',
    'Internal only. No filing, email, or external workflow was triggered by this agent.',
  ].join('\n');

  const sourceEvidence = high.map(a => ({
    type: 'steward_alert',
    alertType: a.type,
    dedupeKey: a.dedupeKey,
  }));

  return {
    fromAgentName: STEWARD_AGENT_NAME,
    toAgentName: ORACLE_AGENT_NAME,
    title: STEWARD_ORACLE_HANDOFF_TITLE,
    body,
    urgency: 'high',
    requiresHumanReview: true,
    sourceEvidence,
  };
}
