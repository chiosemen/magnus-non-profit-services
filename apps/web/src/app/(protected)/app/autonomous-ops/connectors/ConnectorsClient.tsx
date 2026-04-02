'use client';

import type { ConnectorClientPanelRow } from '@magnus/org-autonomous-ops-context';
import { useEffect, useState } from 'react';

export default function ConnectorsClient() {
  const [panels, setPanels] = useState<ConnectorClientPanelRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/autonomous-ops/connectors', { cache: 'no-store' });
        if (!res.ok) throw new Error('CONNECTORS_FETCH_FAILED');
        const json = (await res.json()) as { panels?: ConnectorClientPanelRow[] };
        if (!cancelled) setPanels(json.panels ?? null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'CONNECTORS_FETCH_FAILED');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const renderBadge = (status: string) => {
    let color = 'rgba(255,255,255,0.2)';
    let text = status;
    if (status === 'PILOT_ONLY') {
      color = '#8a2be2';
      text = 'PILOT ONLY';
    }
    if (status === 'NOT_CONFIGURED' || status === 'NOT_ENABLED') {
      color = 'var(--muted)';
    }
    if (status === 'ACTIVE') {
      color = '#10b981';
    }
    if (status === 'CONFIGURING') {
      color = '#ca8a04';
    }
    if (status === 'SUSPENDED') {
      color = '#b45309';
    }

    return (
      <div
        style={{
          display: 'inline-block',
          padding: '4px 8px',
          borderRadius: 4,
          background: color,
          color: '#fff',
          fontSize: 12,
          fontWeight: 'bold',
        }}
      >
        {text}
      </div>
    );
  };

  if (error) {
    return (
      <div className="panel panelPad">
        <div className="error">{error}</div>
      </div>
    );
  }
  if (!panels) {
    return <div className="panel panelPad">Loading connectors…</div>;
  }

  return (
    <div className="panel panelPad">
      <h1 className="h1" style={{ fontSize: 34, marginBottom: 10 }}>
        Operating Doors
      </h1>
      <p className="subhead" style={{ marginBottom: 16 }}>
        Honest view of integration boundaries. Metadata is sourced from the in-repo connector registry plus live status where available.
      </p>

      <div className="cards">
        {panels.map(row => (
          <div className="card" key={row.key}>
            <div className="cardTitle" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span>{row.displayName}</span>
              {renderBadge(row.runtimeStatus)}
            </div>
            <p className="cardBody" style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
              Maturity: <b style={{ color: 'var(--text)' }}>{row.maturity}</b>
              {row.pilotOnly ? (
                <>
                  {' '}
                  · <b style={{ color: 'var(--text)' }}>Pilot-scoped product row</b>
                </>
              ) : null}
            </p>
            <div className="cardBody" style={{ fontSize: 13, marginBottom: 8 }}>
              <div style={{ color: 'var(--muted)', marginBottom: 4 }}>Allowed actions (approval-sensitive)</div>
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.5 }}>
                {row.actions.map(a => (
                  <li key={`${row.key}-${a.kind}`}>
                    <code style={{ fontSize: 12 }}>{a.kind}</code>
                    {a.requiresApproval ? ' — requires human approval if performed externally / authoritatively' : ' — internal or read-only within Tier A bounds'}
                    {a.note ? <span style={{ color: 'var(--muted)' }}> ({a.note})</span> : null}
                  </li>
                ))}
              </ul>
            </div>
            {row.setupPrerequisites.length > 0 ? (
              <div className="cardBody" style={{ fontSize: 13, marginBottom: 8 }}>
                <div style={{ color: 'var(--muted)', marginBottom: 4 }}>Setup prerequisites</div>
                <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.5 }}>
                  {row.setupPrerequisites.map(p => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <p className="cardBody" style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
              {row.disclaimer}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
