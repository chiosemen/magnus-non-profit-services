'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type OrgContextFile = {
  id: string;
  kind: string;
  content: string;
  updatedAt: string;
};

type ReportRow = {
  kind: string;
  label: string;
  purpose: string;
  whatBreaksIfMissing: string;
  requiredForPilot: string;
  status: string;
  configuredState: string;
  blockers: string[];
  warnings: string[];
};

type ValidationReport = {
  asOfIso: string;
  rows: ReportRow[];
  operatorActions: string[];
  grantProfileMissingCodes: string[];
};

function statusColor(status: string): string {
  if (status === 'READY') return '#7dcea0';
  if (status === 'PARTIAL') return '#f4d03f';
  return '#f1948a';
}

export default function DirectoryClient() {
  const [files, setFiles] = useState<OrgContextFile[] | null>(null);
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/autonomous-ops/directory', { cache: 'no-store' });
        if (!res.ok) throw new Error('DIRECTORY_FETCH_FAILED');
        const json = await res.json();
        if (!cancelled) {
          setFiles(json.files || []);
          setReport(json.report ?? null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'DIRECTORY_FETCH_FAILED');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <div className="panel panelPad"><div className="error">{error}</div></div>;
  if (files === null) return <div className="panel panelPad">Loading directory…</div>;

  const expectedKinds = ['ORG_IDENTITY', 'ORG_SOUL', 'ORG_AGENTS', 'ORG_MEMORY', 'ORG_HEARTBEAT'];

  return (
    <div className="panel panelPad">
      <h1 className="h1" style={{ fontSize: 34, marginBottom: 10 }}>Directory &amp; Memory</h1>
      <p className="subhead" style={{ marginBottom: 12 }}>
        Canonical org context files used by Magnus Accord agents. Seeded templates are not “green” until you replace
        placeholders and satisfy validation (see status below).
      </p>
      <p className="subhead" style={{ marginBottom: 16, fontSize: 14 }}>
        <Link href="/app/autonomous-ops/readiness" style={{ color: 'var(--link)' }}>Pilot readiness</Link>
        {' · '}
        <span style={{ color: 'var(--muted)' }}>
          Operator doc: <code>docs/product/MAGNUS_ACCORD_ORG_CONTEXT_FILES.md</code> in repo
        </span>
      </p>

      {report ? (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="cardTitle">Validation summary</div>
          <div className="cardBody" style={{ fontSize: 14, lineHeight: 1.55 }}>
            <p style={{ margin: '0 0 8px', color: 'var(--muted)', fontSize: 13 }}>As of {report.asOfIso}</p>
            {report.grantProfileMissingCodes?.length ? (
              <p style={{ margin: '0 0 12px' }}>
                <strong>Grant profile (HERALD):</strong> missing {report.grantProfileMissingCodes.join(', ')}
              </p>
            ) : null}
            <p style={{ margin: '0 0 8px', fontWeight: 600 }}>Suggested actions</p>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {report.operatorActions.map((a, i) => (
                <li key={i} style={{ marginBottom: 6 }}>
                  {a}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      <div className="cards">
        {expectedKinds.map(kind => {
          const file = files.find(f => f.kind === kind);
          const row = report?.rows.find(r => r.kind === kind);
          return (
            <div className="card" key={kind}>
              <div className="cardTitle" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                {kind}
                {row ? (
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: statusColor(row.status),
                    }}
                  >
                    {row.status} · {row.configuredState}
                  </span>
                ) : null}
              </div>
              {row ? (
                <p className="cardBody" style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>
                  <strong>{row.label}</strong> ({row.requiredForPilot}) — {row.purpose}
                </p>
              ) : null}
              {row?.whatBreaksIfMissing ? (
                <p className="cardBody" style={{ fontSize: 12, color: '#f4d03f', marginBottom: 8 }}>
                  If missing/low quality: {row.whatBreaksIfMissing}
                </p>
              ) : null}
              {row?.blockers?.length ? (
                <ul style={{ fontSize: 12, margin: '0 0 8px', paddingLeft: 18, color: 'var(--muted)' }}>
                  {row.blockers.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              ) : null}
              {row?.warnings?.length ? (
                <ul style={{ fontSize: 12, margin: '0 0 8px', paddingLeft: 18, color: 'var(--muted)' }}>
                  {row.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              ) : null}
              {file ? (
                <>
                  <p className="cardBody" style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>
                    Updated: {new Date(file.updatedAt).toLocaleString()}
                  </p>
                  <pre
                    style={{
                      whiteSpace: 'pre-wrap',
                      fontSize: 13,
                      maxHeight: 200,
                      overflowY: 'auto',
                      padding: 8,
                      background: 'rgba(0,0,0,0.2)',
                      borderRadius: 4,
                    }}
                  >
                    {file.content}
                  </pre>
                </>
              ) : (
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
                  NOT_CONFIGURED
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
