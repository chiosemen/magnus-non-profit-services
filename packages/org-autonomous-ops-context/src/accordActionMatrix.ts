/**
 * Target action-class policy per connector (governance matrix).
 *
 * Bands:
 * - AUTONOMOUS — May proceed without a human approval gate under org Tier A-style operation (subject to actual code paths existing).
 * - ASK_FIRST — Requires explicit human approval before executing on behalf of the org.
 * - NEVER — Autonomous execution is forbidden; humans may still act outside agent automation.
 * - NOT_SUPPORTED — This connector / product surface does not implement the action class.
 *
 * **Current code enforcement** (today) is NOT per-action-class per-connector: agents use `AutonomyTier` + `requiresHumanReview`
 * and `assertInternalSideEffectAllowed` for a small set of internal effects (`handoff`, `memory`) in `apps/agents`.
 * This matrix is the **target** contract for product, docs, and future policy hooks.
 *
 * @see docs/product/MAGNUS_ACCORD_ACTION_MATRIX.md
 */

import type { AccordConnectorKey } from './connectorRegistry';

/** Minimum required action classes for client-facing autonomy governance. */
export type AccordActionClass =
  | 'observe_read'
  | 'internal_draft'
  | 'internal_notify'
  | 'internal_escalate'
  | 'external_draft'
  | 'external_send'
  | 'external_submit'
  | 'data_write_back'
  | 'irreversible_action';

export type AccordActionPolicyBand = 'AUTONOMOUS' | 'ASK_FIRST' | 'NEVER' | 'NOT_SUPPORTED';

export const ACCORD_ACTION_CLASSES: readonly AccordActionClass[] = [
  'observe_read',
  'internal_draft',
  'internal_notify',
  'internal_escalate',
  'external_draft',
  'external_send',
  'external_submit',
  'data_write_back',
  'irreversible_action',
] as const;

/** Target: autonomous agent may not perform irreversible actions through any listed connector. */
export const IRREVERSIBLE_ACTION_CLASS: AccordActionClass = 'irreversible_action';

export type ConnectorActionMatrixRow = Record<AccordActionClass, AccordActionPolicyBand>;

export const ACCORD_CONNECTOR_ACTION_MATRIX: Record<AccordConnectorKey, ConnectorActionMatrixRow> = {
  magnusHq: {
    observe_read: 'AUTONOMOUS',
    internal_draft: 'AUTONOMOUS',
    internal_notify: 'AUTONOMOUS',
    internal_escalate: 'AUTONOMOUS',
    external_draft: 'NEVER',
    external_send: 'NEVER',
    external_submit: 'NEVER',
    data_write_back: 'NOT_SUPPORTED',
    irreversible_action: 'NEVER',
  },

  claudePartner: {
    observe_read: 'AUTONOMOUS',
    internal_draft: 'AUTONOMOUS',
    internal_notify: 'NOT_SUPPORTED',
    internal_escalate: 'NOT_SUPPORTED',
    external_draft: 'ASK_FIRST',
    external_send: 'NEVER',
    external_submit: 'NEVER',
    data_write_back: 'NOT_SUPPORTED',
    irreversible_action: 'NEVER',
  },

  mcpConnector: {
    observe_read: 'ASK_FIRST',
    internal_draft: 'ASK_FIRST',
    internal_notify: 'NOT_SUPPORTED',
    internal_escalate: 'NOT_SUPPORTED',
    external_draft: 'NEVER',
    external_send: 'NEVER',
    external_submit: 'NEVER',
    data_write_back: 'NEVER',
    irreversible_action: 'NEVER',
  },

  grantGenerator: {
    observe_read: 'AUTONOMOUS',
    internal_draft: 'AUTONOMOUS',
    internal_notify: 'NOT_SUPPORTED',
    internal_escalate: 'NOT_SUPPORTED',
    external_draft: 'ASK_FIRST',
    external_send: 'NEVER',
    external_submit: 'NEVER',
    data_write_back: 'NOT_SUPPORTED',
    irreversible_action: 'NEVER',
  },

  workerFinancialLayer: {
    observe_read: 'ASK_FIRST',
    internal_draft: 'ASK_FIRST',
    internal_notify: 'NOT_SUPPORTED',
    internal_escalate: 'NOT_SUPPORTED',
    external_draft: 'NEVER',
    external_send: 'NEVER',
    external_submit: 'NEVER',
    data_write_back: 'NEVER',
    irreversible_action: 'NEVER',
  },

  plaidFinancialWatch: {
    observe_read: 'AUTONOMOUS',
    internal_draft: 'NOT_SUPPORTED',
    internal_notify: 'AUTONOMOUS',
    internal_escalate: 'AUTONOMOUS',
    external_draft: 'NEVER',
    external_send: 'NEVER',
    external_submit: 'NEVER',
    data_write_back: 'NOT_SUPPORTED',
    irreversible_action: 'NEVER',
  },

  candidGrantIntelligence: {
    observe_read: 'AUTONOMOUS',
    internal_draft: 'AUTONOMOUS',
    internal_notify: 'AUTONOMOUS',
    internal_escalate: 'AUTONOMOUS',
    external_draft: 'ASK_FIRST',
    external_send: 'NEVER',
    external_submit: 'NEVER',
    data_write_back: 'NOT_SUPPORTED',
    irreversible_action: 'NEVER',
  },

  stripeDonorLinkage: {
    observe_read: 'AUTONOMOUS',
    internal_draft: 'NOT_SUPPORTED',
    internal_notify: 'NOT_SUPPORTED',
    internal_escalate: 'NOT_SUPPORTED',
    external_draft: 'NEVER',
    external_send: 'NEVER',
    external_submit: 'NEVER',
    data_write_back: 'ASK_FIRST',
    irreversible_action: 'NEVER',
  },

  slackOutboundAlerts: {
    observe_read: 'NOT_SUPPORTED',
    internal_draft: 'NOT_SUPPORTED',
    internal_notify: 'NOT_SUPPORTED',
    internal_escalate: 'NOT_SUPPORTED',
    external_draft: 'NOT_SUPPORTED',
    external_send: 'NEVER',
    external_submit: 'NEVER',
    data_write_back: 'NOT_SUPPORTED',
    irreversible_action: 'NEVER',
  },
};

export function getConnectorActionPolicy(params: {
  connectorKey: AccordConnectorKey;
  actionClass: AccordActionClass;
}): AccordActionPolicyBand {
  const row = ACCORD_CONNECTOR_ACTION_MATRIX[params.connectorKey];
  if (!row) throw new Error(`UNKNOWN_CONNECTOR:${params.connectorKey}`);
  return row[params.actionClass];
}

/** Future hook: returns true only when target matrix marks AUTONOMOUS. */
export function isAutonomousActionAllowed(params: {
  connectorKey: AccordConnectorKey;
  actionClass: AccordActionClass;
}): boolean {
  return getConnectorActionPolicy(params) === 'AUTONOMOUS';
}
