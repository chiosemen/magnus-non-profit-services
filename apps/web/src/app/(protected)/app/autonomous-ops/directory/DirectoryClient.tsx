'use client';

import { useEffect, useState } from 'react';

type OrgContextFile = {
  id: string;
  kind: string;
  content: string;
  updatedAt: string;
};

export default function DirectoryClient() {
  const [files, setFiles] = useState<OrgContextFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/autonomous-ops/directory', { cache: 'no-store' });
        if (!res.ok) throw new Error('DIRECTORY_FETCH_FAILED');
        const json = await res.json();
        if (!cancelled) setFiles(json.files || []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'DIRECTORY_FETCH_FAILED');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (error) return <div className="panel panelPad"><div className="error">{error}</div></div>;
  if (files === null) return <div className="panel panelPad">Loading directory…</div>;

  const expectedKinds = ['ORG_IDENTITY', 'ORG_SOUL', 'ORG_AGENTS', 'ORG_MEMORY', 'ORG_HEARTBEAT'];

  return (
    <div className="panel panelPad">
      <h1 className="h1" style={{ fontSize: 34, marginBottom: 10 }}>Directory & Memory</h1>
      <p className="subhead" style={{ marginBottom: 16 }}>
        Clear building identity and org memory. 
      </p>

      <div className="cards">
        {expectedKinds.map(kind => {
          const file = files.find(f => f.kind === kind);
          return (
            <div className="card" key={kind}>
              <div className="cardTitle">{kind}</div>
              {file ? (
                <>
                  <p className="cardBody" style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>
                    Updated: {new Date(file.updatedAt).toLocaleString()}
                  </p>
                  <pre style={{ 
                    whiteSpace: 'pre-wrap', 
                    fontSize: 13, 
                    maxHeight: 200, 
                    overflowY: 'auto',
                    padding: 8,
                    background: 'rgba(0,0,0,0.2)',
                    borderRadius: 4
                  }}>
                    {file.content}
                  </pre>
                </>
              ) : (
                <div style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.05)', borderRadius: 6, display: 'inline-block', fontSize: 13, fontWeight: 600, color: 'var(--muted)' }}>
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
