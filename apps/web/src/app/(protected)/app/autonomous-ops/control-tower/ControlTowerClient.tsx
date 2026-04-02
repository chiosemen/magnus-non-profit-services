'use client';

import type {
  ControlTowerNavPreset,
  PortfolioAccountabilityRollups,
  PortfolioAccountabilitySnapshot,
} from '@magnus/org-autonomous-ops-context';
import { useEffect, useState } from 'react';

type ApiPayload = PortfolioAccountabilitySnapshot & {
  orgId: string;
  dueSoonDays: number;
};

function presetExamplePath(preset: ControlTowerNavPreset): string {
  const q = new URLSearchParams(preset.query);
  return `/api/org/autonomous-ops/control-tower/${preset.path}?${q.toString()}`;
}

function RecordTable({ title, data }: { title: string; data: Record<string, number> }) {
  const entries = Object.entries(data).sort(([a], [b]) => a.localeCompare(b));
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 6 }}>{title}</div>
      {entries.length === 0 ? (
        <p className="cardBody" style={{ margin: 0 }}>
          —
        </p>
      ) : (
        <div style={{ display: 'grid', gap: 6 }}>
          {entries.map(([k, v]) => (
            <div
              key={k}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                fontSize: 13,
                padding: '6px 0',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <code style={{ color: 'var(--muted)' }}>{k}</code>
              <b>{v}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ControlTowerClient() {
  const [data, setData] = useState<ApiPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/autonomous-ops/portfolio-accountability', { cache: 'no-store' });
        if (!res.ok) throw new Error('PORTFOLIO_ACCOUNTABILITY_FETCH_FAILED');
        const json = (await res.json()) as ApiPayload;
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'PORTFOLIO_ACCOUNTABILITY_FETCH_FAILED');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <div className="panel panelPad"><div className="error">{error}</div></div>;
  if (!data) return <div className="panel panelPad">Loading portfolio accountability…</div>;

  const r: PortfolioAccountabilityRollups = data.rollups;

  return (
    <div className="panel panelPad">
      <h1 className="h1" style={{ fontSize: 34, marginBottom: 10 }}>
        Control tower · accountability
      </h1>
      <p className="subhead" style={{ marginBottom: 16 }}>
        ORG-scoped rollups aligned with compliance semantics shared with the executive board. Presets target org-dashboard
        API paths; omit <code>scopeId</code> when the JWT already supplies the org.
      </p>
      <p className="subhead" style={{ marginBottom: 20, color: 'var(--muted)', fontSize: 13 }}>
        org <code>{data.orgId}</code> · dueSoonDays <b>{data.dueSoonDays}</b> · as of{' '}
        <code>{data.asOfIso}</code>
      </p>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="cardTitle">Rollups</div>
        <div className="cardBody" style={{ display: 'grid', gap: 4 }}>
          <RecordTable title="Alerts (active) by status" data={r.alertsActiveByStatus} />
          <RecordTable title="Alerts (active) by severity" data={r.alertsActiveBySeverity} />
          <RecordTable title="Agent runs by status" data={r.agentRunsByStatus} />
          <div style={{ marginTop: 8, display: 'grid', gap: 8, fontSize: 14 }}>
            <div>
              Runs requiring human review: <b>{r.agentRunsRequiresHumanReviewCount}</b>
            </div>
            <div>
              Open handoffs: <b>{r.handoffsOpen}</b> · open + requires review:{' '}
              <b>{r.handoffsOpenRequiresHumanReview}</b>
            </div>
            <div>
              Compliance calendar rows: <b>{r.compliance.totalRows}</b> · overdue (not filed):{' '}
              <b>{r.compliance.overdueNotFiled}</b> · due soon (not filed): <b>{r.compliance.dueSoonNotFiled}</b>
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="cardTitle">Semantics</div>
        <ul className="cardBody" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.55 }}>
          {data.semantics.map((s, i) => (
            <li key={i} style={{ marginBottom: 8 }}>
              {s}
            </li>
          ))}
        </ul>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="cardTitle">Navigation presets</div>
        <div className="cardBody" style={{ display: 'grid', gap: 14 }}>
          {data.navigationPresets.map(preset => (
            <div
              key={preset.id}
              style={{
                padding: 12,
                borderRadius: 14,
                border: '1px solid rgba(255, 255, 255, 0.10)',
                background: 'rgba(255, 255, 255, 0.03)',
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 6 }}>{preset.label}</div>
              <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 10px', lineHeight: 1.5 }}>
                {preset.description}
              </p>
              <code
                style={{
                  display: 'block',
                  fontSize: 12,
                  wordBreak: 'break-all',
                  padding: 10,
                  borderRadius: 8,
                  background: 'rgba(0,0,0,0.25)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                {presetExamplePath(preset)}
              </code>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
