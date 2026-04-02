'use client';

import { useEffect, useMemo, useState } from 'react';

type EvidenceLink = { label: string; href: string; status: 'IMPLEMENTED' | 'UNIMPLEMENTED_IN_REPO' };
type OperationsLogRow = {
  id: string;
  occurredAtIso: string;
  type: string;
  summary: string;
  automaticOrHuman: 'AUTOMATIC' | 'HUMAN_ACTION' | 'DERIVED_SNAPSHOT';
  agentName?: string | null;
  statusBefore?: string | null;
  statusAfter?: string | null;
  requiresHumanReview?: boolean | null;
  evidenceLinks: EvidenceLink[];
  limitations?: string[] | null;
};

type ApiResponse = {
  orgId: string;
  asOfIso: string;
  take: number;
  rows: OperationsLogRow[];
  disclaimers: string[];
};

function qs(params: Record<string, string | null | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === '') continue;
    q.set(k, v);
  }
  return q.toString();
}

function Badge({ label }: { label: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '4px 8px',
        borderRadius: 999,
        border: '1px solid rgba(255,255,255,0.18)',
        background: 'rgba(255,255,255,0.05)',
        fontSize: 12,
        color: 'var(--muted)',
      }}
    >
      {label}
    </span>
  );
}

export default function OperationsLogClient() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [agentName, setAgentName] = useState<string>('');
  const [types, setTypes] = useState<string>('');
  const [since, setSince] = useState<string>('');
  const [until, setUntil] = useState<string>('');
  const [take, setTake] = useState<string>('100');

  const url = useMemo(() => {
    const query = qs({
      agentName: agentName.trim() || null,
      type: types.trim() || null,
      since: since.trim() || null,
      until: until.trim() || null,
      take: take.trim() || null,
    });
    return `/api/autonomous-ops/operations-log${query ? `?${query}` : ''}`;
  }, [agentName, types, since, until, take]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setError(null);
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error('OPERATIONS_LOG_FETCH_FAILED');
        const json = (await res.json()) as ApiResponse;
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'OPERATIONS_LOG_FETCH_FAILED');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <div className="panel panelPad">
      <h1 className="h1" style={{ fontSize: 34, marginBottom: 10 }}>
        Operations log
      </h1>
      <p className="subhead" style={{ marginBottom: 16 }}>
        Client-readable record of significant platform activity (derived from persisted alerts, handoffs, audits, and agent runs).
      </p>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="cardTitle">Filters (cheap)</div>
        <div className="cardBody" style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'grid', gap: 6 }}>
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>agentName (comma-separated)</div>
            <input className="input" value={agentName} onChange={e => setAgentName(e.target.value)} placeholder="ComplianceWatchdog,BoardIntelligenceOracle" />
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>type (comma-separated)</div>
            <input className="input" value={types} onChange={e => setTypes(e.target.value)} placeholder="ALERT_CREATED,HANDOFF_STATUS_CHANGED,AUTONOMY_BLOCKED_INTERNAL_EFFECT" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px', gap: 10 }}>
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>since (ISO)</div>
              <input className="input" value={since} onChange={e => setSince(e.target.value)} placeholder="2026-04-01T00:00:00Z" />
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>until (ISO)</div>
              <input className="input" value={until} onChange={e => setUntil(e.target.value)} placeholder="2026-04-02T23:59:59Z" />
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>take</div>
              <input className="input" value={take} onChange={e => setTake(e.target.value)} />
            </div>
          </div>
          <div style={{ color: 'var(--muted)', fontSize: 12 }}>
            request: <code>{url}</code>
          </div>
        </div>
      </div>

      {error ? <div className="error">{error}</div> : null}
      {!data && !error ? <p className="cardBody">Loading operations log…</p> : null}

      {data ? (
        <>
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="cardTitle">Disclaimers</div>
            <ul className="cardBody" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.55 }}>
              {data.disclaimers.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          </div>

          <div className="card" style={{ marginBottom: 14 }}>
            <div className="cardTitle">Events</div>
            {data.rows.length === 0 ? (
              <p className="cardBody">No events matched the current filters.</p>
            ) : (
              <div className="cardBody" style={{ display: 'grid', gap: 10 }}>
                {data.rows.map(r => (
                  <div
                    key={r.id}
                    style={{
                      padding: 12,
                      borderRadius: 14,
                      border: '1px solid rgba(255, 255, 255, 0.10)',
                      background: 'rgba(255, 255, 255, 0.03)',
                      display: 'grid',
                      gap: 8,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Badge label={r.type} />
                        <Badge label={r.automaticOrHuman} />
                        {r.agentName ? <Badge label={`agent:${r.agentName}`} /> : null}
                        {r.requiresHumanReview ? <Badge label="HUMAN_REVIEW" /> : null}
                        {r.statusBefore || r.statusAfter ? <Badge label={`${r.statusBefore ?? '—'} → ${r.statusAfter ?? '—'}`} /> : null}
                      </div>
                      <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                        <code>{r.occurredAtIso}</code>
                      </div>
                    </div>

                    <div style={{ lineHeight: 1.55 }}>{r.summary}</div>

                    {r.evidenceLinks?.length ? (
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        {r.evidenceLinks.map((e, idx) => (
                          <a
                            key={`${r.id}-e-${idx}`}
                            className="pill"
                            href={e.href}
                            title={e.status}
                            style={{
                              opacity: e.href ? 1 : 0.6,
                              pointerEvents: e.href ? 'auto' : 'none',
                            }}
                          >
                            {e.label}
                          </a>
                        ))}
                      </div>
                    ) : null}

                    {Array.isArray(r.limitations) && r.limitations.length > 0 ? (
                      <div style={{ color: 'var(--muted)', fontSize: 12, lineHeight: 1.5 }}>
                        limitations: {r.limitations.join(' ')}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

