'use client';

import { useEffect, useState } from 'react';

type Proposal = {
  id: string;
  type: 'LEGACY_IMPORT_MAP' | 'DONOR_SEGMENT' | 'CAMPAIGN_DRAFT' | 'BOARD_BRIEF' | 'COMPLIANCE_REMINDER' | 'ACCOUNT_MAPPING';
  status: 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'APPLIED';
  confidence: number;
  payload: any;
  sourceRef: string | null;
  createdByAgent: string | null;
  reviewedByUser: string | null;
  reviewedAt: string | null;
  appliedAt: string | null;
  appliedBy: string | null;
  createdAt: string;
};

export default function ConciergeClient() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // AI Task Trigger inputs
  const [csvHeaders, setCsvHeaders] = useState('Giver Name, Received Date, Value');
  const [csvRows, setCsvRows] = useState('Alice, 2026-01-01, $100.00');
  const [campaignTopic, setCampaignTopic] = useState('Clean Water Well Construction');
  
  // Status Filtering
  const [filterStatus, setFilterStatus] = useState<string>('PENDING_REVIEW');
  const [filterType, setFilterType] = useState<string>('');

  const [activeProposal, setActiveProposal] = useState<Proposal | null>(null);

  const fetchProposals = async () => {
    setLoading(true);
    setError(null);
    try {
      let url = '/api/org/concierge/proposals';
      const params = [];
      if (filterStatus) params.push(`status=${filterStatus}`);
      if (filterType) params.push(`type=${filterType}`);
      if (params.length > 0) url += `?${params.join('&')}`;

      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) {
        throw new Error('Failed to retrieve AI proposals registry.');
      }
      const data = await res.json();
      setProposals(data.proposals || []);
      if (data.proposals && data.proposals.length > 0) {
        // Keep active selection if it still exists
        const found = data.proposals.find((p: Proposal) => p.id === activeProposal?.id);
        setActiveProposal(found || data.proposals[0]);
      } else {
        setActiveProposal(null);
      }
    } catch (err: any) {
      setError(err.message || 'Error loading AI Concierge suggestions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProposals();
  }, [filterStatus, filterType]);

  const handleTriggerTask = async (task: string) => {
    setError(null);
    try {
      let res;
      if (task === 'csv-mapping') {
        const headersArr = csvHeaders.split(',').map(h => h.trim());
        const rowsArr = [csvRows.split(',').map(r => r.trim())];
        res = await fetch('/api/org/concierge/csv-mapping', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ headers: headersArr, sampleRows: rowsArr }),
        });
      } else if (task === 'segmentation') {
        res = await fetch('/api/org/concierge/segmentation', { method: 'POST' });
      } else if (task === 'campaign-draft') {
        res = await fetch('/api/org/concierge/campaign-draft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ goalTopic: campaignTopic }),
        });
      } else if (task === 'board-brief') {
        res = await fetch('/api/org/concierge/board-brief', { method: 'POST' });
      } else if (task === 'compliance') {
        res = await fetch('/api/org/concierge/compliance', { method: 'POST' });
      }

      if (!res || !res.ok) {
        const errJson = await res?.json().catch(() => null);
        throw new Error(errJson?.error || 'AI Concierge generation request failed.');
      }

      alert('Proposal generated successfully by AI Concierge.');
      fetchProposals();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleUpdateStatus = async (proposalId: string, status: 'APPROVED' | 'REJECTED') => {
    setError(null);
    try {
      const res = await fetch(`/api/org/concierge/proposals/${proposalId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, actorName: 'Human Admin' }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || 'Status update failed.');
      }

      fetchProposals();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleApply = async (proposalId: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/org/concierge/proposals/${proposalId}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actorName: 'Human Admin' }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || 'Execution check failed.');
      }

      alert('Proposal applied successfully to active system records.');
      fetchProposals();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="panel panelPad">
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 className="h1" style={{ fontSize: 34, marginBottom: 4 }}>AI Concierge Review Center</h1>
        <p className="subhead" style={{ marginBottom: 0 }}>Human-in-the-loop audit dashboard for AI legacy imports, campaign drafts, and board reports.</p>
      </div>

      {error && <div className="error" style={{ marginBottom: 20 }}>{error}</div>}

      {/* Bento Grid layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr 340px', gap: 20 }}>
        
        {/* Left Column: Tasks Trigger */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ fontSize: 16, marginBottom: 12, textTransform: 'uppercase', color: 'var(--muted)' }}>AI Assistants</h3>
            
            {/* CSV mapping trigger */}
            <div style={{ marginBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 12 }}>
              <h4 style={{ fontSize: 14, margin: '0 0 8px' }}>Legacy CSV Mapping</h4>
              <input type="text" className="input" value={csvHeaders} onChange={e => setCsvHeaders(e.target.value)} placeholder="Headers" style={{ fontSize: 12, marginBottom: 6 }} />
              <input type="text" className="input" value={csvRows} onChange={e => setCsvRows(e.target.value)} placeholder="Sample Data" style={{ fontSize: 12, marginBottom: 8 }} />
              <button className="pill pillPrimary" onClick={() => handleTriggerTask('csv-mapping')} style={{ width: '100%', fontSize: 12 }}>Draft CSV Map</button>
            </div>

            {/* Campaign trigger */}
            <div style={{ marginBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 12 }}>
              <h4 style={{ fontSize: 14, margin: '0 0 8px' }}>Campaign Generator</h4>
              <input type="text" className="input" value={campaignTopic} onChange={e => setCampaignTopic(e.target.value)} placeholder="Topic" style={{ fontSize: 12, marginBottom: 8 }} />
              <button className="pill pillPrimary" onClick={() => handleTriggerTask('campaign-draft')} style={{ width: '100%', fontSize: 12 }}>Draft Campaign</button>
            </div>

            {/* General triggers */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button className="pill" onClick={() => handleTriggerTask('segmentation')} style={{ width: '100%', fontSize: 12 }}>Suggest Donor Segments</button>
              <button className="pill" onClick={() => handleTriggerTask('board-brief')} style={{ width: '100%', fontSize: 12 }}>Draft Board Briefing</button>
              <button className="pill" onClick={() => handleTriggerTask('compliance')} style={{ width: '100%', fontSize: 12 }}>Suggest Compliance Reminders</button>
            </div>
          </div>
        </div>

        {/* Middle Column: Review Queue list */}
        <div>
          <div className="card" style={{ padding: 16, minHeight: 400 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, margin: 0 }}>Proposals Queue</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                <select className="input" value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ padding: '4px 8px', fontSize: 12, width: 'auto' }}>
                  <option value="PENDING_REVIEW">Pending Review</option>
                  <option value="APPROVED">Approved</option>
                  <option value="REJECTED">Rejected</option>
                  <option value="APPLIED">Applied</option>
                </select>
                <select className="input" value={filterType} onChange={e => setFilterType(e.target.value)} style={{ padding: '4px 8px', fontSize: 12, width: 'auto' }}>
                  <option value="">All Types</option>
                  <option value="LEGACY_IMPORT_MAP">CSV Maps</option>
                  <option value="DONOR_SEGMENT">Segments</option>
                  <option value="CAMPAIGN_DRAFT">Campaigns</option>
                  <option value="BOARD_BRIEF">Board Briefs</option>
                  <option value="COMPLIANCE_REMINDER">Compliance</option>
                </select>
              </div>
            </div>

            {loading ? (
              <div>Retrieving proposal lists…</div>
            ) : proposals.length === 0 ? (
              <div style={{ color: 'var(--muted)', textAlign: 'center', padding: '40px 0' }}>
                No proposals in this queue state. Use the AI Assistants panel on the left to trigger recommendations.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {proposals.map(p => (
                  <div
                    key={p.id}
                    onClick={() => setActiveProposal(p)}
                    style={{
                      padding: 12,
                      borderRadius: 8,
                      border: activeProposal?.id === p.id ? '1px solid var(--accent)' : '1px solid rgba(255,255,255,0.06)',
                      background: activeProposal?.id === p.id ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.01)',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{p.type.replace(/_/g, ' ')}</span>
                      <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.1)' }}>
                        Conf: {(p.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                      Created: {new Date(p.createdAt).toLocaleDateString()} by {p.createdByAgent || 'AI'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Detailed Proposal Inspector */}
        <div>
          <div className="card" style={{ padding: 16, minHeight: 400 }}>
            {activeProposal ? (
              <div>
                <div style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 12, marginBottom: 16 }}>
                  <span style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 10,
                    background: 'rgba(244,208,63,0.15)',
                    color: '#f4d03f',
                    textTransform: 'uppercase',
                  }}>
                    AI Draft Recommendation
                  </span>
                  <h3 style={{ fontSize: 20, margin: '8px 0 4px' }}>{activeProposal.type.replace(/_/g, ' ')}</h3>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>Confidence score: {(activeProposal.confidence * 100).toFixed(0)}%</div>
                </div>

                {/* Detail Payloads based on type */}
                <div style={{ marginBottom: 20, fontSize: 13, lineHeight: 1.55 }}>
                  
                  {activeProposal.type === 'LEGACY_IMPORT_MAP' && (
                    <div>
                      <h4 style={{ fontSize: 14, margin: '0 0 8px' }}>Proposed Mappings</h4>
                      <table style={{ width: '100%', fontSize: 12, textAlign: 'left', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                            <th style={{ padding: 6 }}>CSV Header</th>
                            <th style={{ padding: 6 }}>S4NP Field</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeProposal.payload.mappings?.map((m: any, idx: number) => (
                            <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                              <td style={{ padding: 6 }}><code>{m.csvHeader}</code></td>
                              <td style={{ padding: 6, color: 'var(--accent)' }}><code>{m.mappedField}</code></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div style={{ marginTop: 12, fontSize: 12, color: 'var(--muted)' }}>Reasoning: {activeProposal.payload.reasoning}</div>
                    </div>
                  )}

                  {activeProposal.type === 'DONOR_SEGMENT' && (
                    <div>
                      <h4 style={{ fontSize: 14, margin: '0 0 8px' }}>Suggested Segments</h4>
                      {activeProposal.payload.segments?.map((s: any, idx: number) => (
                        <div key={idx} style={{ background: 'rgba(255,255,255,0.02)', padding: 8, borderRadius: 6, marginBottom: 8 }}>
                          <div style={{ fontWeight: 600 }}>{s.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>Criteria: {s.criteria}</div>
                          <div style={{ fontSize: 11, marginTop: 4 }}>Action: {s.recommendedAction}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {activeProposal.type === 'CAMPAIGN_DRAFT' && (
                    <div>
                      <h4 style={{ fontSize: 14, margin: '0 0 4px' }}>Draft Campaign</h4>
                      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{activeProposal.payload.title}</div>
                      <p style={{ color: 'var(--muted)', fontSize: 12, margin: '0 0 10px' }}>{activeProposal.payload.story}</p>
                      <div style={{ fontSize: 12 }}>Suggested Presets: {activeProposal.payload.suggestedAmounts?.join(', ')}</div>
                    </div>
                  )}

                  {activeProposal.type === 'BOARD_BRIEF' && (
                    <div>
                      <h4 style={{ fontSize: 14, margin: '0 0 6px' }}>Narrative Draft Brief</h4>
                      <p style={{ background: 'rgba(255,255,255,0.02)', padding: 10, borderRadius: 6, fontSize: 12, color: 'var(--muted)' }}>
                        {activeProposal.payload.boardBriefDraftText}
                      </p>
                      <div style={{ fontWeight: 600, fontSize: 12, marginTop: 10 }}>Highlights:</div>
                      <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11 }}>
                        {activeProposal.payload.keyHighlights?.map((h: string, idx: number) => (
                          <li key={idx}>{h}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {activeProposal.type === 'COMPLIANCE_REMINDER' && (
                    <div>
                      <h4 style={{ fontSize: 14, margin: '0 0 8px' }}>Proposed Reminders</h4>
                      {activeProposal.payload.reminders?.map((r: any, idx: number) => (
                        <div key={idx} style={{ background: 'rgba(255,255,255,0.02)', padding: 8, borderRadius: 6, marginBottom: 8 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontWeight: 600 }}>{r.deadlineType}</span>
                            <span style={{ color: 'var(--danger)', fontSize: 11 }}>{r.priority}</span>
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>Due: {r.dueDate}</div>
                          <div style={{ fontSize: 12, marginTop: 4 }}>{r.reminderText}</div>
                        </div>
                      ))}
                    </div>
                  )}

                </div>

                {/* Audit & Actions Panel */}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 16 }}>
                  {activeProposal.status === 'PENDING_REVIEW' && (
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button className="pill" onClick={() => handleUpdateStatus(activeProposal.id, 'REJECTED')} style={{ flex: 1, background: 'rgba(255,92,92,0.1)', color: 'var(--danger)' }}>
                        Reject
                      </button>
                      <button className="pill pillPrimary" onClick={() => handleUpdateStatus(activeProposal.id, 'APPROVED')} style={{ flex: 1 }}>
                        Approve
                      </button>
                    </div>
                  )}

                  {activeProposal.status === 'APPROVED' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', marginBottom: 4 }}>Approved by {activeProposal.reviewedByUser}</div>
                      <button className="pill pillPrimary" onClick={() => handleApply(activeProposal.id)} style={{ width: '100%' }}>
                        Apply Suggestion
                      </button>
                      <button className="pill" onClick={() => handleUpdateStatus(activeProposal.id, 'REJECTED')} style={{ width: '100%', background: 'rgba(255,92,92,0.05)', color: 'var(--danger)' }}>
                        Revoke & Reject
                      </button>
                    </div>
                  )}

                  {activeProposal.status === 'REJECTED' && (
                    <div style={{ textAlign: 'center', color: 'var(--danger)', fontSize: 13 }}>
                      Proposal was rejected by {activeProposal.reviewedByUser || 'Human Admin'}.
                    </div>
                  )}

                  {activeProposal.status === 'APPLIED' && (
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                      <div style={{ color: 'var(--accent)', fontWeight: 600, marginBottom: 4 }}>APPLIED STATUS SUCCESS</div>
                      Executed on {new Date(activeProposal.appliedAt!).toLocaleString()} by {activeProposal.appliedBy}.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ color: 'var(--muted)', textAlign: 'center', padding: '40px 0' }}>
                Select a proposal from the queue list to inspect details and apply review audits.
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
