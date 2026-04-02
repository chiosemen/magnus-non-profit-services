'use client';

import { useEffect, useState } from 'react';

type RulesStatus = {
  maxAutonomyTier: string;
  enabledAgents: unknown;
  agentBoundaryOverrides: unknown;
};

type LaunchAgentRow = {
  personaLabel: string;
  agentName: string;
  pilotPositioning: string;
  subscriptionEligibilitySummary: string;
  whatItDoes: string;
  humanReviewSemantics: string;
  currentlyEnforcedInCode: string[];
  blockedAutonomousExternal: string[];
};

type AutonomyPolicySurface = {
  currentEnforcementSummary: string[];
  targetPolicyPointer: string;
  externalNeverAutonomous: string[];
  pilotOnlyProductSurfaces: string[];
};

type RulesApiResponse = {
  settings: RulesStatus | null;
  launchAgents?: LaunchAgentRow[];
  autonomyPolicySurface?: AutonomyPolicySurface;
};

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="cardBody" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.55, fontSize: 14 }}>
      {items.map((line, i) => (
        <li key={i}>{line}</li>
      ))}
    </ul>
  );
}

export default function RulesClient() {
  const [data, setData] = useState<RulesApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/autonomous-ops/rules', { cache: 'no-store' });
        if (!res.ok) throw new Error('RULES_FETCH_FAILED');
        const json = (await res.json()) as RulesApiResponse;
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'RULES_FETCH_FAILED');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const settings = data?.settings ?? null;
  const surface = data?.autonomyPolicySurface;
  const launchAgents = data?.launchAgents ?? [];

  return (
    <div className="panel panelPad">
      <h1 className="h1" style={{ fontSize: 34, marginBottom: 10 }}>
        Authority Rules
      </h1>
      <p className="subhead" style={{ marginBottom: 16 }}>
        Platform-level autonomy boundaries and agent permissions. Org-configurable settings cannot exceed these platform rules.
      </p>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="cardTitle">Pilot scope and readiness</div>
        <p className="cardBody" style={{ marginBottom: 12 }}>
          Canonical definitions live in-repo: <code style={{ fontSize: 12 }}>docs/product/MAGNUS_ACCORD_PILOT_LAUNCH_PACKAGE.md</code> and{' '}
          <code style={{ fontSize: 12 }}>docs/product/MAGNUS_ACCORD_FEATURE_DIRECTORY.md</code>.
        </p>
        <ul className="cardBody" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.55, fontSize: 14 }}>
          <li>
            <b>Assisted Ops Pilot (GROWTH):</b> compliance watch + board-prep agents only; Directory, Connectors, Rules, Executive, Control tower
            surfaces.
          </li>
          <li>
            <b>Headquarters Pilot (ENTERPRISE):</b> adds financial watch, grant lifecycle, and grant intelligence agents—subject to configuration and
            data availability caveats in the pilot doc.
          </li>
          <li>
            <b>Not in this web pilot:</b> full alert/history workstation, handoff triage UI, donor/volunteer ledger pages (APIs may exist separately).
          </li>
          <li>Agents operate at internal (Tier A) autonomy for side effects today; no autonomous external submit or money movement.</li>
        </ul>
      </div>

      {error ? <div className="error">{error}</div> : null}
      {!data && !error ? <p className="cardBody">Loading rules…</p> : null}

      {surface && data ? (
        <>
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="cardTitle">Currently enforced (runtime)</div>
            <p className="cardBody" style={{ marginBottom: 12, fontSize: 14 }}>
              What the agents service and API enforce today. This is not the same as the documented target action matrix below.
            </p>
            <BulletList items={surface.currentEnforcementSummary} />
          </div>

          <div className="card" style={{ marginBottom: 20 }}>
            <div className="cardTitle">Target policy (documentation)</div>
            <p className="cardBody" style={{ marginBottom: 12, fontSize: 14 }}>
              {surface.targetPolicyPointer} Aspirational bands are not guaranteed to be checked on every connector call yet.
            </p>
            <p className="cardBody" style={{ fontSize: 13, color: 'var(--muted)' }}>
              See also <code style={{ fontSize: 12 }}>docs/product/MAGNUS_ACCORD_ACTION_MATRIX.md</code>.
            </p>
          </div>

          <div className="card" style={{ marginBottom: 20 }}>
            <div className="cardTitle">External actions — never autonomous</div>
            <BulletList items={surface.externalNeverAutonomous} />
          </div>

          <div className="card" style={{ marginBottom: 20 }}>
            <div className="cardTitle">Pilot-only / placeholder product surfaces</div>
            <BulletList items={surface.pilotOnlyProductSurfaces} />
          </div>
        </>
      ) : null}

      {launchAgents.length > 0 ? (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="cardTitle">Launch agents — capability and gates</div>
          <p className="cardBody" style={{ marginBottom: 12, fontSize: 14 }}>
            Default subscription gates for scheduled runs. <b>STEWARD / ORACLE / SENTINEL / HERALD</b> map to the agents below; Worker optimizer is an
            internal worker-scoped agent, not the HQ pilot persona set.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 13,
                minWidth: 720,
              }}
            >
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
                  <th style={{ padding: '8px 10px 8px 0', whiteSpace: 'nowrap' }}>Persona</th>
                  <th style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>Agent</th>
                  <th style={{ padding: '8px 10px' }}>Subscription</th>
                  <th style={{ padding: '8px 10px' }}>What it does</th>
                  <th style={{ padding: '8px 10px' }}>Human review</th>
                  <th style={{ padding: '8px 10px' }}>Blocked (external)</th>
                  <th style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>Pilot role</th>
                </tr>
              </thead>
              <tbody>
                {launchAgents.map(row => (
                  <tr key={row.agentName} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', verticalAlign: 'top' }}>
                    <td style={{ padding: '10px 10px 10px 0', fontWeight: 600 }}>{row.personaLabel}</td>
                    <td style={{ padding: '10px', fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>{row.agentName}</td>
                    <td style={{ padding: '10px', maxWidth: 220 }}>{row.subscriptionEligibilitySummary}</td>
                    <td style={{ padding: '10px', maxWidth: 280 }}>{row.whatItDoes}</td>
                    <td style={{ padding: '10px', maxWidth: 260 }}>{row.humanReviewSemantics}</td>
                    <td style={{ padding: '10px', maxWidth: 240 }}>
                      <ul style={{ margin: 0, paddingLeft: 16 }}>
                        {row.blockedAutonomousExternal.map((b, i) => (
                          <li key={i}>{b}</li>
                        ))}
                      </ul>
                    </td>
                    <td style={{ padding: '10px', whiteSpace: 'nowrap' }}>
                      {row.pilotPositioning === 'hq_launch_agent' ? 'HQ launch' : 'Worker internal'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {settings ? (
        <div className="cards">
          <div className="card">
            <div className="cardTitle">Max Autonomy Tier</div>
            <p className="cardBody" style={{ fontWeight: 'bold', fontSize: 18, color: '#facc15' }}>
              {settings.maxAutonomyTier.replace('TIER_', '').replace('_', ' ')}
            </p>
            <p className="cardBody" style={{ fontSize: 13, marginTop: 10 }}>
              Defines the absolute highest permission level any agent can take without explicit human confirmation.
            </p>
          </div>
          <div className="card">
            <div className="cardTitle">Enabled Agents</div>
            <pre style={{ fontSize: 12, padding: 8, background: 'rgba(0,0,0,0.2)', borderRadius: 4 }}>
              {JSON.stringify(settings.enabledAgents, null, 2)}
            </pre>
          </div>
        </div>
      ) : data && !error ? (
        <div
          style={{
            padding: '8px 12px',
            background: 'rgba(255,255,255,0.05)',
            borderRadius: 6,
            display: 'inline-block',
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--muted)',
          }}
        >
          NOT_CONFIGURED (Platform defaults apply: TIER_A_AUTONOMOUS)
        </div>
      ) : null}
    </div>
  );
}
