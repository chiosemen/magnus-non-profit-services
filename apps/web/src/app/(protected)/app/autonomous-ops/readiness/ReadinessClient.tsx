'use client';

import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';

type ReadinessCategory = 'NOT_CONFIGURED' | 'PARTIAL' | 'READY';

type Dimension = {
  id: string;
  label: string;
  status: ReadinessCategory;
  blockers: string[];
  notes: string[];
};

type ApiResponse = {
  disclaimer: string;
  orgId: string;
  asOfIso: string;
  dimensions: Dimension[];
  overall: { summary: ReadinessCategory; pilotCandidate: boolean; blockers: string[] };
  memoryEvaluation: { readiness: string; reasons: string[] };
};

function statusStyle(s: ReadinessCategory): CSSProperties {
  if (s === 'READY') return { color: '#7dcea0' };
  if (s === 'PARTIAL') return { color: '#f4d03f' };
  return { color: '#f1948a' };
}

export default function ReadinessClient() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/autonomous-ops/readiness', { cache: 'no-store' });
        if (!res.ok) throw new Error('READINESS_FETCH_FAILED');
        const json = (await res.json()) as ApiResponse;
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'READINESS_FETCH_FAILED');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="panel panelPad">
      <h1 className="h1" style={{ fontSize: 34, marginBottom: 10 }}>
        Pilot readiness
      </h1>
      <p className="subhead" style={{ marginBottom: 16 }}>
        Truthful, read-only signals for Magnus Accord pilot onboarding. Nothing is marked ready without backing data.
      </p>

      {error ? (
        <div className="card" style={{ borderColor: 'rgba(241,148,138,0.5)' }}>
          <div className="cardTitle">Error</div>
          <div className="cardBody">{error}</div>
        </div>
      ) : null}

      {!data && !error ? <p className="subhead">Loading…</p> : null}

      {data ? (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="cardTitle">Disclaimer</div>
            <div className="cardBody" style={{ fontSize: 14, lineHeight: 1.55 }}>
              {data.disclaimer}
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="cardTitle">Overall</div>
            <div className="cardBody" style={{ fontSize: 14, lineHeight: 1.6 }}>
              <p style={{ margin: '0 0 8px' }}>
                <strong style={statusStyle(data.overall.summary)}>{data.overall.summary}</strong>
                {' · '}
                Pilot candidate: <strong>{data.overall.pilotCandidate ? 'yes' : 'no'}</strong>
              </p>
              <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13 }}>As of {data.asOfIso}</p>
              {data.overall.blockers.length ? (
                <ul style={{ margin: '12px 0 0', paddingLeft: 18 }}>
                  {data.overall.blockers.map((b, i) => (
                    <li key={i} style={{ fontSize: 13 }}>
                      {b}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="cardTitle">Dimensions</div>
            <div className="cardBody" style={{ padding: 0 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <th style={{ padding: '10px 12px' }}>Area</th>
                    <th style={{ padding: '10px 12px' }}>Status</th>
                    <th style={{ padding: '10px 12px' }}>Blockers / notes</th>
                  </tr>
                </thead>
                <tbody>
                  {data.dimensions.map(d => (
                    <tr key={d.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <td style={{ padding: '10px 12px', verticalAlign: 'top' }}>
                        <div style={{ fontWeight: 600 }}>{d.label}</div>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{d.id}</div>
                      </td>
                      <td style={{ padding: '10px 12px', verticalAlign: 'top', fontWeight: 600, ...statusStyle(d.status) }}>
                        {d.status}
                      </td>
                      <td style={{ padding: '10px 12px', verticalAlign: 'top', fontSize: 13 }}>
                        {d.blockers.length ? (
                          <div style={{ marginBottom: d.notes.length ? 8 : 0 }}>
                            <strong>Blockers:</strong>
                            <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                              {d.blockers.map((b, i) => (
                                <li key={i}>{b}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        {d.notes.length ? (
                          <div>
                            <strong>Notes:</strong>
                            <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                              {d.notes.map((n, i) => (
                                <li key={i}>{n}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div className="cardTitle">Memory reflection (operational thresholds)</div>
            <div className="cardBody" style={{ fontSize: 14, lineHeight: 1.55 }}>
              <p style={{ margin: '0 0 8px' }}>
                Readiness: <strong>{data.memoryEvaluation.readiness}</strong>
              </p>
              {data.memoryEvaluation.reasons.length ? (
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {data.memoryEvaluation.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              ) : (
                <p style={{ margin: 0, color: 'var(--muted)' }}>All configured thresholds met.</p>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
