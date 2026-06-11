'use client';

import { useEffect, useState } from 'react';

// Interfaces for response shapes
interface BoardPacket {
  orgId: string;
  asOfIso: string;
  executiveSummary: {
    title: string;
    generatedAt: string;
    description: string;
  };
  financialSummary: {
    activeSentinelAlertsCount: number;
    financialReportStatus: string;
    netChange: number;
  };
  fundBalanceSummary: any;
  campaignPerformance: Array<{
    id: string;
    name: string;
    slug: string;
    status: string;
    goalAmount: number | null;
    totalRaised: number;
    donationsCount: number;
  }>;
  donorActivity: {
    totalDonorsCount: number;
    totalDonationsCount: number;
    totalDonationsAmount: number;
    averageDonationAmount: number;
  };
  grantMilestones: Array<{
    id: string;
    funderName: string;
    totalAmount: number;
    spentToDate: number;
    startDate: string;
    endDate: string;
    percentSpent: number;
  }>;
  complianceObligations: {
    totalDeadlinesCount: number;
    pendingCount: number;
    inProgressCount: number;
    filedCount: number;
    deadlines: Array<{
      id: string;
      deadlineType: string;
      dueDateIso: string;
      status: string;
    }>;
  };
  volunteerEventImpact: {
    totalVolunteersCount: number;
    totalHoursLogged: number;
    totalEventsCount: number;
    totalRegistrationsCount: number;
  };
  openRisksAndAlerts: Array<{
    id: string;
    severity: string;
    title: string;
    body: string;
    createdAtIso: string;
  }>;
  recommendedBoardActions: Array<{
    id: string;
    fromAgentName: string;
    title: string;
    body: string;
    requiresHumanReview: boolean;
  }>;
  aiNarrative: {
    content: string | null;
    status: 'ENABLED_DRAFT' | 'DISABLED' | 'NO_INSIGHTS';
  };
}

interface Proposal {
  id: string;
  type: 'LEGACY_IMPORT_MAP' | 'DONOR_SEGMENT' | 'CAMPAIGN_DRAFT' | 'BOARD_BRIEF' | 'COMPLIANCE_REMINDER' | 'ACCOUNT_MAPPING';
  status: 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'APPLIED';
  confidence: number;
  payload: any;
  createdAt: string;
}

interface Handoff {
  id: string;
  fromAgentName: string;
  toAgentName: string;
  title: string;
  body: string;
  urgency: string;
  requiresHumanReview: boolean;
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'CANCELLED';
  createdAt: string;
}

export default function ControlTowerClient() {
  const [boardPacket, setBoardPacket] = useState<BoardPacket | null>(null);
  const [boardPacketError, setBoardPacketError] = useState<string | null>(null);
  const [boardPacketLoading, setBoardPacketLoading] = useState(true);

  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [proposalsError, setProposalsError] = useState<string | null>(null);
  const [proposalsLoading, setProposalsLoading] = useState(true);

  const [handoffs, setHandoffs] = useState<Handoff[]>([]);
  const [handoffsError, setHandoffsError] = useState<string | null>(null);
  const [handoffsLoading, setHandoffsLoading] = useState(true);

  const [isCompiling, setIsCompiling] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Fetch functions
  const fetchBoardPacket = async () => {
    setBoardPacketLoading(true);
    try {
      const res = await fetch('/api/org/executive/board-packet?includeAiNarrative=true');
      if (!res.ok) throw new Error(`HTTP_${res.status}: Failed to fetch Board Packet`);
      const data = await res.json();
      setBoardPacket(data.boardPacket);
      setBoardPacketError(null);
    } catch (err: any) {
      setBoardPacketError(err.message || 'Failed to fetch Board Packet');
    } finally {
      setBoardPacketLoading(false);
    }
  };

  const fetchProposals = async () => {
    setProposalsLoading(true);
    try {
      const res = await fetch('/api/org/concierge/proposals');
      if (!res.ok) throw new Error(`HTTP_${res.status}: Failed to fetch concierge proposals`);
      const data = await res.json();
      setProposals(data.proposals || []);
      setProposalsError(null);
    } catch (err: any) {
      setProposalsError(err.message || 'Failed to fetch proposals');
    } finally {
      setProposalsLoading(false);
    }
  };

  const fetchHandoffs = async () => {
    setHandoffsLoading(true);
    try {
      const res = await fetch('/api/org/autonomous-ops/handoffs');
      if (!res.ok) throw new Error(`HTTP_${res.status}: Failed to fetch agent handoffs`);
      const data = await res.json();
      setHandoffs(data.handoffs || []);
      setHandoffsError(null);
    } catch (err: any) {
      setHandoffsError(err.message || 'Failed to fetch handoffs');
    } finally {
      setHandoffsLoading(false);
    }
  };

  useEffect(() => {
    fetchBoardPacket();
    fetchProposals();
    fetchHandoffs();
  }, []);

  // Governance actions
  const handleProposalStatusUpdate = async (proposalId: string, status: 'APPROVED' | 'REJECTED') => {
    const actorName = prompt('Enter your name to sign this decision (Audit trail requirement):');
    if (!actorName || !actorName.trim()) {
      alert('Reviewer name is required to log governance actions.');
      return;
    }

    try {
      const res = await fetch(`/api/org/concierge/proposals/${proposalId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, actorName }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to update proposal status');
      }
      setActionMessage(`Proposal successfully marked as ${status}.`);
      fetchProposals();
    } catch (err: any) {
      alert(`Action failed: ${err.message}`);
    }
  };

  const handleApplyProposal = async (proposalId: string) => {
    const actorName = prompt('Enter your name to apply this action to the authoritative ledger:');
    if (!actorName || !actorName.trim()) {
      alert('Auditor name is required to apply changes.');
      return;
    }

    try {
      const res = await fetch(`/api/org/concierge/proposals/${proposalId}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actorName }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to apply proposal');
      }
      setActionMessage(`Proposal successfully applied to database.`);
      fetchProposals();
      fetchBoardPacket(); // Refresh stats
    } catch (err: any) {
      alert(`Execution failed: ${err.message}`);
    }
  };

  const handleHandoffStatusUpdate = async (handoffId: string, toStatus: 'RESOLVED' | 'ACKNOWLEDGED') => {
    const actorName = prompt('Enter your name to resolve this operational block:');
    if (!actorName || !actorName.trim()) {
      alert('Operator name is required.');
      return;
    }

    try {
      const res = await fetch(`/api/org/autonomous-ops/handoffs/${handoffId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toStatus, actorType: 'user', actorName }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to resolve handoff');
      }
      setActionMessage(`Handoff marked as ${toStatus}.`);
      fetchHandoffs();
      fetchBoardPacket();
    } catch (err: any) {
      alert(`Transition failed: ${err.message}`);
    }
  };

  const handleCompileBoardPacket = async () => {
    setIsCompiling(true);
    try {
      const res = await fetch('/api/org/concierge/board-brief', { method: 'POST' });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to draft brief');
      }
      setActionMessage('New board brief draft created in the Concierge Proposal queue.');
      fetchProposals();
    } catch (err: any) {
      alert(`Compilation failed: ${err.message}`);
    } finally {
      setIsCompiling(false);
    }
  };

  return (
    <div className="control-tower-dashboard">
      <style dangerouslySetInnerHTML={{ __html: `
        .control-tower-dashboard {
          color: var(--text);
        }
        .header-section {
          margin-bottom: 24px;
        }
        .bento-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 20px;
          margin-bottom: 24px;
        }
        .bento-item {
          min-height: 200px;
        }
        .full-width {
          grid-column: span 3;
        }
        .two-thirds {
          grid-column: span 2;
        }
        .badge {
          display: inline-block;
          padding: 4px 8px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
        }
        .badge-healthy {
          background: rgba(57, 255, 136, 0.15);
          color: var(--accent);
          border: 1px solid rgba(57, 255, 136, 0.3);
        }
        .badge-attention {
          background: rgba(255, 179, 64, 0.15);
          color: #ffb340;
          border: 1px solid rgba(255, 179, 64, 0.3);
        }
        .badge-blocked {
          background: rgba(255, 92, 92, 0.15);
          color: var(--danger);
          border: 1px solid rgba(255, 92, 92, 0.3);
        }
        .badge-draft {
          background: rgba(92, 200, 255, 0.15);
          color: var(--accent2);
          border: 1px solid rgba(92, 200, 255, 0.3);
        }
        .action-banner {
          background: linear-gradient(135deg, rgba(57, 255, 136, 0.1), rgba(92, 200, 255, 0.08));
          border: 1px solid rgba(57, 255, 136, 0.25);
          padding: 12px 18px;
          border-radius: 12px;
          margin-bottom: 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .gov-btn {
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.12);
          color: var(--text);
          padding: 6px 12px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 500;
          transition: background 0.2s;
        }
        .gov-btn:hover {
          background: rgba(255, 255, 255, 0.15);
        }
        .gov-btn-primary {
          background: var(--accent);
          color: #0b0f17;
          border: none;
          font-weight: 600;
        }
        .gov-btn-primary:hover {
          background: #2de076;
        }
        .gov-btn-danger {
          background: rgba(255, 92, 92, 0.15);
          color: var(--danger);
          border: 1px solid rgba(255, 92, 92, 0.3);
        }
        .gov-btn-danger:hover {
          background: rgba(255, 92, 92, 0.25);
        }
        .pacing-bar-bg {
          background: rgba(255, 255, 255, 0.08);
          border-radius: 6px;
          height: 10px;
          overflow: hidden;
          margin-top: 8px;
        }
        .pacing-bar-fill {
          height: 100%;
          background: linear-gradient(90deg, var(--accent), var(--accent2));
          border-radius: 6px;
        }
        .empty-text {
          color: var(--muted);
          font-style: italic;
          font-size: 13px;
        }
        @media (max-width: 920px) {
          .bento-grid {
            grid-template-columns: 1fr;
          }
          .two-thirds {
            grid-column: span 1;
          }
          .full-width {
            grid-column: span 1;
          }
        }
      `}} />

      {/* Header section */}
      <div className="header-section">
        <h1 className="h1">Accord Control Tower</h1>
        <p className="subhead">
          Unified command center, compliance dashboard, and AI Concierge governance portal.
        </p>
      </div>

      {actionMessage && (
        <div className="action-banner">
          <span>{actionMessage}</span>
          <button className="gov-btn" onClick={() => setActionMessage(null)}>Dismiss</button>
        </div>
      )}

      {/* Surface 1: Executive Overview & Board Packet Center */}
      <div className="bento-grid">
        <div className="panel panelPad bento-item two-thirds">
          <div className="cardTitle" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Executive Overview</span>
            {boardPacket && (
              <span className={`badge badge-${
                boardPacket.financialSummary.financialReportStatus === 'STABLE' ? 'healthy' : 'attention'
              }`}>
                System Status: {boardPacket.financialSummary.financialReportStatus}
              </span>
            )}
          </div>
          
          {boardPacketLoading ? (
            <p>Loading board packet rollup...</p>
          ) : boardPacketError ? (
            <p className="error">API Failure: {boardPacketError}</p>
          ) : boardPacket ? (
            <div>
              <p className="cardBody" style={{ fontSize: 15, marginBottom: 16 }}>
                {boardPacket.executiveSummary.description}
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                <div className="kpiItem">
                  <div className="kpiBig">
                    {boardPacket.financialSummary.netChange >= 0 ? '+' : ''}
                    ${boardPacket.financialSummary.netChange.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                  <div className="kpiSmall">Net Financial Pacing</div>
                </div>
                <div className="kpiItem">
                  <div className="kpiBig">{boardPacket.financialSummary.activeSentinelAlertsCount}</div>
                  <div className="kpiSmall">Active Sentinel Alerts</div>
                </div>
                <div className="kpiItem">
                  <div className="kpiBig">
                    {boardPacket.aiNarrative.status === 'ENABLED_DRAFT' ? 'Draft Drafted' : 'Disabled'}
                  </div>
                  <div className="kpiSmall">AI Narrative Mode</div>
                </div>
              </div>
            </div>
          ) : (
            <p className="empty-text">No executive overview compiled.</p>
          )}
        </div>

        <div className="panel panelPad bento-item">
          <div className="cardTitle">Board Packet Center</div>
          <p className="cardBody" style={{ fontSize: 13, marginBottom: 14 }}>
            Deterministic rollup of organizational status ready for board review.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button 
              className="gov-btn gov-btn-primary" 
              onClick={handleCompileBoardPacket}
              disabled={isCompiling}
            >
              {isCompiling ? 'Compiling Draft...' : 'Compile Board Briefing'}
            </button>
            <button className="gov-btn" onClick={fetchBoardPacket}>Refresh Real Data</button>
          </div>
        </div>

        {/* Surface 2: Donor CRM Summary */}
        <div className="panel panelPad bento-item">
          <div className="cardTitle">Donor CRM Insights</div>
          {boardPacketLoading ? (
            <p>Loading CRM metrics...</p>
          ) : boardPacketError ? (
            <p className="error">API Failure: {boardPacketError}</p>
          ) : boardPacket ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <span className="kpiSmall">Total Donors</span>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{boardPacket.donorActivity.totalDonorsCount}</div>
              </div>
              <div>
                <span className="kpiSmall">Total Donations</span>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{boardPacket.donorActivity.totalDonationsCount}</div>
              </div>
              <div>
                <span className="kpiSmall">Average Gift Size</span>
                <div style={{ fontSize: 20, fontWeight: 700 }}>
                  ${boardPacket.donorActivity.averageDonationAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </div>
              </div>
            </div>
          ) : (
            <p className="empty-text">No donor data compiled.</p>
          )}
        </div>

        {/* Surface 3: Campaign Performance */}
        <div className="panel panelPad bento-item two-thirds">
          <div className="cardTitle">Active Campaigns</div>
          {boardPacketLoading ? (
            <p>Loading campaigns...</p>
          ) : boardPacketError ? (
            <p className="error">API Failure: {boardPacketError}</p>
          ) : boardPacket && boardPacket.campaignPerformance.length > 0 ? (
            <div style={{ display: 'grid', gap: 12 }}>
              {boardPacket.campaignPerformance.map(c => {
                const percent = c.goalAmount ? Math.min(100, Math.round((c.totalRaised / c.goalAmount) * 100)) : 0;
                return (
                  <div key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <b>{c.name}</b>
                      <span>
                        ${c.totalRaised.toLocaleString()} raised
                        {c.goalAmount ? ` of $${c.goalAmount.toLocaleString()}` : ' (No goal)'}
                      </span>
                    </div>
                    {c.goalAmount && (
                      <div className="pacing-bar-bg">
                        <div className="pacing-bar-fill" style={{ width: `${percent}%` }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="empty-text">No active campaigns logged.</p>
          )}
        </div>

        {/* Surface 4: Fund Accounting Summary */}
        <div className="panel panelPad bento-item">
          <div className="cardTitle">Fund Accounting Summary</div>
          {boardPacketLoading ? (
            <p>Loading ledger funds...</p>
          ) : boardPacketError ? (
            <p className="error">API Failure: {boardPacketError}</p>
          ) : boardPacket && boardPacket.fundBalanceSummary && boardPacket.fundBalanceSummary !== 'unavailable' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Object.entries(boardPacket.fundBalanceSummary).map(([fundName, balance]: [string, any]) => (
                <div key={fundName} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <code style={{ color: 'var(--muted)' }}>{fundName}</code>
                  <b>${Number(balance).toLocaleString(undefined, { minimumFractionDigits: 2 })}</b>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-text">No fund balances compiled from ledger records.</p>
          )}
        </div>

        {/* Surface 5: Grants Lifecycle */}
        <div className="panel panelPad bento-item two-thirds">
          <div className="cardTitle">Grants Pacing & Milestones</div>
          {boardPacketLoading ? (
            <p>Loading grants...</p>
          ) : boardPacketError ? (
            <p className="error">API Failure: {boardPacketError}</p>
          ) : boardPacket && boardPacket.grantMilestones.length > 0 ? (
            <div style={{ display: 'grid', gap: 12 }}>
              {boardPacket.grantMilestones.map(g => (
                <div key={g.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <b>{g.funderName}</b>
                    <span>{g.percentSpent}% Budget Burn Rate</span>
                  </div>
                  <div className="pacing-bar-bg">
                    <div className="pacing-bar-fill" style={{ width: `${g.percentSpent}%` }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                    <span>Spent: ${g.spentToDate.toLocaleString()}</span>
                    <span>Total grant: ${g.totalAmount.toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-text">No active grants listed.</p>
          )}
        </div>

        {/* Surface 6: Compliance Obligations */}
        <div className="panel panelPad bento-item">
          <div className="cardTitle">Compliance Deadlines</div>
          {boardPacketLoading ? (
            <p>Loading compliance calendar...</p>
          ) : boardPacketError ? (
            <p className="error">API Failure: {boardPacketError}</p>
          ) : boardPacket && boardPacket.complianceObligations ? (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12, textAlign: 'center' }}>
                <div style={{ padding: 6, background: 'rgba(255,92,92,0.1)', borderRadius: 6 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--danger)' }}>
                    {boardPacket.complianceObligations.pendingCount}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>Pending</div>
                </div>
                <div style={{ padding: 6, background: 'rgba(255,179,64,0.1)', borderRadius: 6 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#ffb340' }}>
                    {boardPacket.complianceObligations.inProgressCount}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>Working</div>
                </div>
                <div style={{ padding: 6, background: 'rgba(57,255,136,0.1)', borderRadius: 6 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent)' }}>
                    {boardPacket.complianceObligations.filedCount}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>Filed</div>
                </div>
              </div>
              <div style={{ maxHeight: 100, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {boardPacket.complianceObligations.deadlines.map(d => (
                  <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                    <span>{d.deadlineType}</span>
                    <span style={{ color: d.status === 'FILED' ? 'var(--accent)' : '#ffb340' }}>{d.status}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="empty-text">No compliance calendar obligations found.</p>
          )}
        </div>

        {/* Surface 7: Volunteer / Event Impact */}
        <div className="panel panelPad bento-item">
          <div className="cardTitle">Volunteer & Event Impact</div>
          {boardPacketLoading ? (
            <p>Loading volunteer tracking...</p>
          ) : boardPacketError ? (
            <p className="error">API Failure: {boardPacketError}</p>
          ) : boardPacket && boardPacket.volunteerEventImpact ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <span className="kpiSmall">Total Logged Hours</span>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent2)' }}>
                  {boardPacket.volunteerEventImpact.totalHoursLogged} hours
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <span className="kpiSmall">Volunteers</span>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>
                    {boardPacket.volunteerEventImpact.totalVolunteersCount}
                  </div>
                </div>
                <div>
                  <span className="kpiSmall">Registrations</span>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>
                    {boardPacket.volunteerEventImpact.totalRegistrationsCount}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <p className="empty-text">No volunteer stats reported.</p>
          )}
        </div>

        {/* Surface 8: AI narrative card if compiled */}
        <div className="panel panelPad bento-item two-thirds">
          <div className="cardTitle">
            <span>Executive Board Briefing</span>
            <span className="badge badge-draft" style={{ marginLeft: 8 }}>AI Generated Briefing Draft</span>
          </div>
          {boardPacketLoading ? (
            <p>Loading executive brief...</p>
          ) : boardPacket && boardPacket.aiNarrative && boardPacket.aiNarrative.content ? (
            <pre style={{ 
              whiteSpace: 'pre-wrap', 
              fontSize: 13, 
              fontFamily: 'inherit', 
              color: 'var(--text)', 
              background: 'rgba(0,0,0,0.2)', 
              padding: 12, 
              borderRadius: 8, 
              border: '1px solid rgba(255,255,255,0.06)' 
            }}>
              {boardPacket.aiNarrative.content}
            </pre>
          ) : (
            <p className="empty-text">No AI narrative brief generated yet. Use the compile button to draft a briefing.</p>
          )}
        </div>

        {/* Surface 9: AI Concierge Proposal Queue */}
        <div className="panel panelPad bento-item full-width">
          <div className="cardTitle" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>AI Concierge Proposal Queue</span>
            <button className="gov-btn" onClick={fetchProposals}>Reload Queue</button>
          </div>
          <p className="subhead" style={{ fontSize: 13, marginBottom: 14 }}>
            Proposals drafted by AI concierge require user verification before mutating database records.
          </p>

          {proposalsLoading ? (
            <p>Loading proposals...</p>
          ) : proposalsError ? (
            <p className="error">API Failure: {proposalsError}</p>
          ) : proposals.length === 0 ? (
            <p className="empty-text">No pending proposals in the review queue.</p>
          ) : (
            <div style={{ display: 'grid', gap: 14 }}>
              {proposals.map(p => (
                <div 
                  key={p.id} 
                  style={{ 
                    padding: 14, 
                    borderRadius: 12, 
                    border: '1px solid rgba(255,255,255,0.1)', 
                    background: 'rgba(255,255,255,0.02)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="badge badge-draft">AI Suggestion</span>
                      <b>{p.type}</b>
                      <span className="badge" style={{ background: 'rgba(255,255,255,0.08)' }}>
                        Confidence: {Math.round(p.confidence * 100)}%
                      </span>
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                      Status: <b style={{ color: p.status === 'PENDING_REVIEW' ? '#ffb340' : p.status === 'APPROVED' ? 'var(--accent)' : 'var(--danger)' }}>{p.status}</b>
                    </span>
                  </div>

                  <p className="cardBody" style={{ fontSize: 13, margin: '6px 0' }}>
                    <b>Payload Preview:</b> {JSON.stringify(p.payload)}
                  </p>

                  <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                    {p.status === 'PENDING_REVIEW' && (
                      <>
                        <button 
                          className="gov-btn gov-btn-primary" 
                          onClick={() => handleProposalStatusUpdate(p.id, 'APPROVED')}
                        >
                          Approve Draft
                        </button>
                        <button 
                          className="gov-btn gov-btn-danger" 
                          onClick={() => handleProposalStatusUpdate(p.id, 'REJECTED')}
                        >
                          Reject Suggestion
                        </button>
                      </>
                    )}
                    {p.status === 'APPROVED' && (
                      <button 
                        className="gov-btn gov-btn-primary" 
                        onClick={() => handleApplyProposal(p.id)}
                      >
                        Apply Changes to DB
                      </button>
                    )}
                    {p.status === 'PENDING_REVIEW' && (
                      <span style={{ fontSize: 11, color: 'var(--muted)', alignSelf: 'center' }}>
                        *Requires signing decision before application
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Surface 10: Agent Approvals & Handoffs */}
        <div className="panel panelPad bento-item full-width">
          <div className="cardTitle" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Agent Approvals & Handoffs</span>
            <button className="gov-btn" onClick={fetchHandoffs}>Reload Handoffs</button>
          </div>
          <p className="subhead" style={{ fontSize: 13, marginBottom: 14 }}>
            System agent alerts and workflows requiring admin resolution.
          </p>

          {handoffsLoading ? (
            <p>Loading handoffs...</p>
          ) : handoffsError ? (
            <p className="error">API Failure: {handoffsError}</p>
          ) : handoffs.length === 0 ? (
            <p className="empty-text">No active agent operational handoffs found.</p>
          ) : (
            <div style={{ display: 'grid', gap: 14 }}>
              {handoffs.map(h => (
                <div 
                  key={h.id} 
                  style={{ 
                    padding: 14, 
                    borderRadius: 12, 
                    border: '1px solid rgba(255,255,255,0.1)', 
                    background: 'rgba(255,255,255,0.02)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className={`badge ${
                        h.urgency === 'HIGH' || h.urgency === 'CRITICAL' ? 'badge-blocked' : 'badge-attention'
                      }`}>
                        {h.urgency} Urgency
                      </span>
                      <b>{h.title}</b>
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                        from {h.fromAgentName} to {h.toAgentName}
                      </span>
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                      Status: <b style={{ color: h.status === 'OPEN' ? 'var(--danger)' : 'var(--accent)' }}>{h.status}</b>
                    </span>
                  </div>

                  <p className="cardBody" style={{ fontSize: 13, margin: '6px 0' }}>
                    {h.body}
                  </p>

                  {h.status === 'OPEN' && (
                    <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                      <button 
                        className="gov-btn gov-btn-primary" 
                        onClick={() => handleHandoffStatusUpdate(h.id, 'RESOLVED')}
                      >
                        Acknowledge & Resolve Handoff
                      </button>
                      <button 
                        className="gov-btn" 
                        onClick={() => handleHandoffStatusUpdate(h.id, 'ACKNOWLEDGED')}
                      >
                        Acknowledge Only
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
