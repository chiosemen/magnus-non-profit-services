'use client';

import { useEffect, useState } from 'react';

type Grant = {
  id: string;
  funderName: string;
  totalAmount: string;
  startDate: string;
  endDate: string;
  spentToDate: string;
  reportingSchedule: any;
  createdAt: string;
};

export default function GrantsPage() {
  const [grants, setGrants] = useState<Grant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [showModal, setShowModal] = useState(false);
  const [funderName, setFunderName] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [spentToDate, setSpentToDate] = useState('0');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reportingScheduleText, setReportingScheduleText] = useState('{"milestones": []}');

  const fetchGrants = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/org/grants');
      if (!res.ok) throw new Error('Failed to fetch grants.');
      const data = await res.json();
      setGrants(data.grants || []);
    } catch (err: any) {
      setError(err.message || 'An error occurred loading grants.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGrants();
  }, []);

  const handleSaveGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!funderName.trim() || !totalAmount.trim() || !startDate || !endDate) {
      alert('Funder name, amount, start date, and end date are required.');
      return;
    }

    let reportingSchedule = {};
    try {
      reportingSchedule = JSON.parse(reportingScheduleText);
    } catch {
      alert('Reporting schedule must be valid JSON.');
      return;
    }

    try {
      const res = await fetch('/api/org/grants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          funderName: funderName.trim(),
          totalAmount: parseFloat(totalAmount),
          spentToDate: parseFloat(spentToDate || '0'),
          startDate,
          endDate,
          reportingSchedule,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save grant.');
      }

      setShowModal(false);
      setFunderName('');
      setTotalAmount('');
      setSpentToDate('0');
      setStartDate('');
      setEndDate('');
      setReportingScheduleText('{"milestones": []}');
      fetchGrants();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="panel panelPad">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 className="h1" style={{ fontSize: 34, marginBottom: 4 }}>Grants Tracker</h1>
          <p className="subhead" style={{ marginBottom: 0 }}>Register and track grant expenditures, compliance deadlines, and funder requirements.</p>
        </div>
        <button className="pill pillPrimary" onClick={() => setShowModal(true)}>
          Add Grant
        </button>
      </div>

      {error && <div className="error" style={{ marginBottom: 20 }}>{error}</div>}

      <div className="panel panelPad" style={{ background: 'transparent', padding: 0 }}>
        {loading ? (
          <div style={{ color: 'var(--muted)' }}>Retrieving grants…</div>
        ) : grants.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '40px 20px',
            borderRadius: 12,
            border: '1px dashed rgba(255,255,255,0.1)',
            color: 'var(--muted)',
          }}>
            No grants recorded. Click the button above to register a new grant.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {grants.map((g) => {
              const total = parseFloat(g.totalAmount);
              const spent = parseFloat(g.spentToDate);
              const percent = total > 0 ? Math.round((spent / total) * 100) : 0;
              return (
                <div
                  key={g.id}
                  style={{
                    padding: 20,
                    borderRadius: 12,
                    border: '1px solid rgba(255,255,255,0.06)',
                    background: 'rgba(255,255,255,0.01)',
                    display: 'grid',
                    gridTemplateColumns: '1fr auto',
                    alignItems: 'center',
                    gap: 20,
                  }}
                >
                  <div>
                    <h4 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{g.funderName}</h4>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                      Term: <b>{new Date(g.startDate).toLocaleDateString()}</b> to <b>{new Date(g.endDate).toLocaleDateString()}</b>
                    </div>
                    <div style={{ marginTop: 12, background: 'rgba(255,255,255,0.05)', borderRadius: 4, height: 6, width: '200px', overflow: 'hidden' }}>
                      <div style={{ background: 'var(--accent)', height: '100%', width: `${Math.min(100, percent)}%` }} />
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                      Budget: <b>${total.toLocaleString()}</b> • Spent: <b>${spent.toLocaleString()}</b> ({percent}%)
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                      Schedule: <code>{JSON.stringify(g.reportingSchedule)}</code>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="panel panelPad" style={{ width: '500px', background: '#0b0f17' }}>
            <h3 style={{ margin: 0, marginBottom: 16 }}>Register Grant</h3>
            <form onSubmit={handleSaveGrant} className="form">
              <div className="field">
                <label className="label">Funder Name</label>
                <input
                  type="text"
                  className="input"
                  value={funderName}
                  onChange={(e) => setFunderName(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="field">
                  <label className="label">Total Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    className="input"
                    value={totalAmount}
                    onChange={(e) => setTotalAmount(e.target.value)}
                    required
                  />
                </div>
                <div className="field">
                  <label className="label">Spent To Date</label>
                  <input
                    type="number"
                    step="0.01"
                    className="input"
                    value={spentToDate}
                    onChange={(e) => setSpentToDate(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="field">
                  <label className="label">Start Date</label>
                  <input
                    type="date"
                    className="input"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                  />
                </div>
                <div className="field">
                  <label className="label">End Date</label>
                  <input
                    type="date"
                    className="input"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="field">
                <label className="label">Reporting Schedule (JSON)</label>
                <textarea
                  className="input"
                  style={{ minHeight: 80, fontFamily: 'monospace', fontSize: 12 }}
                  value={reportingScheduleText}
                  onChange={(e) => setReportingScheduleText(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24 }}>
                <button type="button" className="pill" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="pill pillPrimary">
                  Save Grant
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
