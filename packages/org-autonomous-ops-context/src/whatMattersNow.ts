import type { ExecutiveBoard, TopItem } from './executiveBoard';
import type { ExecutiveModuleKey, ModuleStateCode, Severity } from './executiveSemantics';
import { moduleStateRank, severityRank } from './executiveSemantics';

export type WhatMattersNowCategory =
  | 'true_current_risk'
  | 'missing_configuration_data'
  | 'blocked_unavailable'
  | 'near_term_actionable';

export type WhatMattersNowItem =
  | {
      kind: 'module_attention';
      category: WhatMattersNowCategory;
      sourceModule: ExecutiveModuleKey;
      state: ModuleStateCode;
      severity: Severity | null;
      why: string;
      destination: { href: string; status: 'IMPLEMENTED' | 'UNIMPLEMENTED_IN_REPO' };
    }
  | {
      kind: 'top_item';
      category: WhatMattersNowCategory;
      sourceModule: ExecutiveModuleKey;
      severity: Severity;
      why: string;
      destination: { href: string; status: 'IMPLEMENTED' | 'UNIMPLEMENTED_IN_REPO' };
    };

function categoryForModuleState(state: ModuleStateCode): WhatMattersNowCategory {
  if (state === 'UNAVAILABLE') return 'blocked_unavailable';
  if (state === 'NOT_CONFIGURED' || state === 'INSUFFICIENT_DATA') return 'missing_configuration_data';
  return 'near_term_actionable';
}

function sourceModuleForTopItemKind(kind: TopItem['kind']): ExecutiveModuleKey {
  if (kind === 'alert') return 'alerts';
  if (kind === 'handoff') return 'handoffs';
  return 'compliance_calendar';
}

function categoryForTopItemKind(kind: TopItem['kind']): WhatMattersNowCategory {
  if (kind === 'alert') return 'true_current_risk';
  return 'near_term_actionable';
}

function whyForTopItem(item: TopItem): string {
  if (item.kind === 'alert') return `${item.type}: ${item.title}`;
  if (item.kind === 'handoff') return `${item.fromAgentName}: ${item.title}`;
  return `${item.deadlineType} due ${item.dueDateIso.slice(0, 10)} (${item.status})`;
}

export function deriveWhatMattersNow(board: ExecutiveBoard, maxItems: number): WhatMattersNowItem[] {
  const moduleAttention = board.moduleStates
    .filter(m => m.state === 'UNAVAILABLE' || m.state === 'NOT_CONFIGURED' || m.state === 'INSUFFICIENT_DATA')
    .slice()
    .sort((a, b) => {
      const state = moduleStateRank(b.state) - moduleStateRank(a.state);
      if (state !== 0) return state;
      const sevA = a.severity ? severityRank(a.severity) : 0;
      const sevB = b.severity ? severityRank(b.severity) : 0;
      const sev = sevB - sevA;
      if (sev !== 0) return sev;
      return a.module.localeCompare(b.module);
    })
    .map<WhatMattersNowItem>(m => ({
      kind: 'module_attention',
      category: categoryForModuleState(m.state),
      sourceModule: m.module,
      state: m.state,
      severity: m.severity,
      why: m.summary,
      destination: m.destination,
    }));

  const top = board.topItems.map<WhatMattersNowItem>(t => ({
    kind: 'top_item',
    category: categoryForTopItemKind(t.kind),
    sourceModule: sourceModuleForTopItemKind(t.kind),
    severity: t.severity,
    why: whyForTopItem(t),
    destination: t.destination,
  }));

  return [...moduleAttention, ...top].slice(0, maxItems);
}

