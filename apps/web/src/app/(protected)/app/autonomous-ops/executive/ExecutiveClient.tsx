'use client';

import type { ExecutiveBoard, Severity, WhatMattersNowCategory } from '@magnus/org-autonomous-ops-context';
import { deriveWhatMattersNow } from '@magnus/org-autonomous-ops-context';
import { useEffect, useMemo, useState } from 'react';

type Destination = { href: string; status: 'IMPLEMENTED' | 'UNIMPLEMENTED_IN_REPO' };
type ActiveObligation = {
  kind: 'alert' | 'handoff' | 'compliance_calendar';
  id: string;
  sourceModule: 'alerts' | 'handoffs' | 'compliance_calendar';
  severity: Severity | null;
  status: string;
  title: string;
  why: string;
  createdAtIso?: string;
  dueDateIso?: string;
  destination: Destination;
  evidence: Array<{ label: string; destination: Destination }>;
  linkage?: { relatedAlertId?: string; relatedHandoffId?: string; relatedAgentRunId?: string };
  requiresHumanReview: boolean | null;
};

function badgeForCategory(cat: WhatMattersNowCategory): { label: string; border: string; bg: string } {
  if (cat === 'blocked_unavailable') return { label: 'BLOCKED', border: 'rgba(255, 92, 92, 0.35)', bg: 'rgba(255, 92, 92, 0.10)' };
  if (cat === 'missing_configuration_data')
    return { label: 'MISSING', border: 'rgba(92, 200, 255, 0.35)', bg: 'rgba(92, 200, 255, 0.10)' };
  if (cat === 'true_current_risk') return { label: 'RISK', border: 'rgba(57, 255, 136, 0.35)', bg: 'rgba(57, 255, 136, 0.10)' };
  return { label: 'NEXT', border: 'rgba(255, 255, 255, 0.18)', bg: 'rgba(255, 255, 255, 0.05)' };
}

function badgeForSeverity(sev: Severity | null): { label: string; border: string; bg: string } {
  if (!sev) return { label: '—', border: 'rgba(255, 255, 255, 0.18)', bg: 'rgba(255, 255, 255, 0.05)' };
  if (sev === 'CRITICAL') return { label: 'CRITICAL', border: 'rgba(255, 92, 92, 0.55)', bg: 'rgba(255, 92, 92, 0.12)' };
  if (sev === 'HIGH') return { label: 'HIGH', border: 'rgba(255, 92, 92, 0.35)', bg: 'rgba(255, 92, 92, 0.10)' };
  if (sev === 'MED') return { label: 'MED', border: 'rgba(92, 200, 255, 0.35)', bg: 'rgba(92, 200, 255, 0.10)' };
  return { label: 'LOW', border: 'rgba(255, 255, 255, 0.18)', bg: 'rgba(255, 255, 255, 0.05)' };
}

function Pill({ label, border, bg }: { label: string; border: string; bg: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '6px 10px',
        borderRadius: 999,
        border: `1px solid ${border}`,
        background: bg,
        fontSize: 12,
        letterSpacing: 0.2,
      }}
    >
      {label}
    </span>
  );
}

export default function ExecutiveClient() {
  const [data, setData] = useState<ExecutiveBoard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/autonomous-ops/executive/board?take=50', { cache: 'no-store' });
        if (!res.ok) throw new Error('EXECUTIVE_BOARD_FETCH_FAILED');
        const json = (await res.json()) as ExecutiveBoard;
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'EXECUTIVE_BOARD_FETCH_FAILED');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const whatMatters = useMemo(() => (data ? deriveWhatMattersNow(data, 5) : []), [data]);

  if (error) return <div className="panel panelPad"><div className="error">{error}</div></div>;
  if (!data) return <div className="panel panelPad">Loading executive board…</div>;

  const obligations = (data as any).activeObligations as ActiveObligation[] | undefined;
  const financial = (data as any).financialSummary as
    | { sentinelActiveAlerts?: unknown[]; grants?: unknown[]; asOfIso?: string; disclaimers?: string[] }
    | undefined;

  return (
    <div className="panel panelPad">
      <h1 className="h1" style={{ fontSize: 34, marginBottom: 10 }}>
        Executive
      </h1>
      <p className="subhead" style={{ marginBottom: 16 }}>
        “What matters now” is derived only from deterministic executive data: module states (blocked/missing config/data) and top items (alerts/handoffs/compliance).
      </p>
      <p style={{ marginBottom: 16 }}>
        <a className="pill" href="/app/autonomous-ops/control-tower">
          Control tower · portfolio accountability
        </a>
      </p>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="cardTitle" style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
          <span>Active obligations</span>
          <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 12 }}>derived view</span>
        </div>
        {!obligations ? (
          <p className="cardBody">This executive payload does not expose active obligations yet.</p>
        ) : obligations.length === 0 ? (
          <p className="cardBody">No active obligations were found in the current bounded window.</p>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {obligations.slice(0, 8).map(o => {
              const sev = badgeForSeverity(o.severity ?? null);
              const destStatus = o.destination.status === 'UNIMPLEMENTED_IN_REPO' ? 'UNIMPLEMENTED_IN_REPO' : 'IMPLEMENTED';
              const review = o.requiresHumanReview === true ? { label: 'HUMAN_REVIEW', border: 'rgba(255, 255, 255, 0.18)', bg: 'rgba(255, 255, 255, 0.05)' } : null;
              return (
                <div
                  key={`${o.kind}:${o.id}`}
                  style={{
                    padding: 12,
                    borderRadius: 14,
                    border: '1px solid rgba(255, 255, 255, 0.10)',
                    background: 'rgba(255, 255, 255, 0.03)',
                    display: 'grid',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <Pill {...sev} />
                      <Pill label={o.status} border="rgba(255, 255, 255, 0.18)" bg="rgba(255, 255, 255, 0.05)" />
                      {review ? <Pill {...review} /> : null}
                      <span style={{ color: 'var(--muted)', fontSize: 12 }}>
                        source: <b style={{ color: 'var(--text)' }}>{o.sourceModule}</b>
                      </span>
                    </div>
                    <a className="pill" href={o.destination.href} title={destStatus}>
                      Go next
                    </a>
                  </div>
                  <div style={{ color: 'var(--muted)', lineHeight: 1.55 }}>{o.why}</div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {o.evidence.map((e, idx) => (
                      <a key={`${o.id}-e-${idx}`} className="pill" href={e.destination.href} title={e.destination.status}>
                        {e.label}
                      </a>
                    ))}
                  </div>
                  <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                    destination: <code>{o.destination.href}</code> ({destStatus})
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="cardTitle" style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
          <span>Financial (projection)</span>
          <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 12 }}>alerts + grants only</span>
        </div>
        {!financial ? (
          <p className="cardBody">This executive payload does not expose a financial projection yet.</p>
        ) : (
          <div className="cardBody" style={{ display: 'grid', gap: 8 }}>
            <div>
              SENTINEL active alerts (capped): <b>{Array.isArray(financial.sentinelActiveAlerts) ? financial.sentinelActiveAlerts.length : '—'}</b>
            </div>
            <div>
              Grants returned: <b>{Array.isArray(financial.grants) ? financial.grants.length : '—'}</b>
            </div>
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>
              asOf: <code>{financial.asOfIso ?? '—'}</code>
            </div>
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>
              disclaimer: {Array.isArray(financial.disclaimers) ? financial.disclaimers[0] ?? '—' : '—'}
            </div>
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="cardTitle" style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
          <span>What matters now</span>
          <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 12 }}>as of {data.asOfIso}</span>
        </div>

        {whatMatters.length === 0 ? (
          <p className="cardBody">No current items were surfaced.</p>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {whatMatters.map((w, idx) => {
              const cat = badgeForCategory(w.category);
              const sev = badgeForSeverity(w.severity ?? null);
              const destStatus = w.destination.status === 'UNIMPLEMENTED_IN_REPO' ? 'UNIMPLEMENTED_IN_REPO' : 'IMPLEMENTED';
              return (
                <div
                  key={`${w.kind}-${w.sourceModule}-${idx}`}
                  style={{
                    padding: 12,
                    borderRadius: 14,
                    border: '1px solid rgba(255, 255, 255, 0.10)',
                    background: 'rgba(255, 255, 255, 0.03)',
                    display: 'grid',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <Pill {...cat} />
                      <Pill {...sev} />
                      {w.kind === 'module_attention' ? (
                        <Pill label={w.state} border="rgba(255, 255, 255, 0.18)" bg="rgba(255, 255, 255, 0.05)" />
                      ) : null}
                      <span style={{ color: 'var(--muted)', fontSize: 12 }}>
                        source: <b style={{ color: 'var(--text)' }}>{w.sourceModule}</b>
                      </span>
                    </div>
                    <a className="pill" href={w.destination.href} title={destStatus}>
                      Go next
                    </a>
                  </div>
                  <div style={{ color: 'var(--muted)', lineHeight: 1.55 }}>{w.why}</div>
                  <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                    destination: <code>{w.destination.href}</code> ({destStatus})
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="cards">
        <div className="card">
          <div className="cardTitle">Module states</div>
          <p className="cardBody">Reported modules: {data.moduleStates.length}</p>
        </div>
        <div className="card">
          <div className="cardTitle">Top items</div>
          <p className="cardBody">Returned (capped): {data.topItems.length}</p>
        </div>
        <div className="card">
          <div className="cardTitle">Disclaimers</div>
          <p className="cardBody">{data.disclaimers[0] ?? '—'}</p>
        </div>
      </div>
    </div>
  );
}

