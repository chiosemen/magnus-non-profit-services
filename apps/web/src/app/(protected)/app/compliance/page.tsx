'use client';

import { useEffect, useState } from 'react';

type ComplianceItem = {
  id: string;
  deadlineType: 'FORM_990' | 'STATE_REGISTRATION' | 'GRANT_REPORT';
  dueDate: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'FILED';
  asanaTaskId: string | null;
  createdAt: string;
};

export default function CompliancePage() {
  const [items, setItems] = useState<ComplianceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [showModal, setShowModal] = useState(false);
  const [deadlineType, setDeadlineType] = useState<'FORM_990' | 'STATE_REGISTRATION' | 'GRANT_REPORT'>('FORM_990');
  const [dueDate, setDueDate] = useState('');
  const [asanaTaskId, setAsanaTaskId] = useState('');

  const fetchCompliance = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/org/compliance');
      if (!res.ok) throw new Error('Failed to fetch compliance calendar.');
      const data = await res.json();
      setItems(data.compliance || data.complianceCalendar || []);
    } catch (err: any) {
      setError(err.message || 'An error occurred loading compliance calendar.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCompliance();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dueDate) {
      alert('Due date is required.');
      return;
    }

    try {
      const res = await fetch('/api/org/compliance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deadlineType,
          dueDate,
          asanaTaskId: asanaTaskId.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create compliance deadline.');

      setShowModal(false);
      setDueDate('');
      setAsanaTaskId('');
      fetchCompliance();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleStatusChange = async (itemId: string, status: 'PENDING' | 'IN_PROGRESS' | 'FILED') => {
    try {
      const res = await fetch(`/api/org/compliance/${itemId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update compliance status.');

      fetchCompliance();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="panel panelPad">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 className="h1" style={{ fontSize: 34, marginBottom: 4 }}>Compliance Calendar</h1>
          <p className="subhead" style={{ marginBottom: 0 }}>Monitor upcoming filing deadlines, state tax registrations, and compliance obligations.</p>
        </div>
        <button className="pill pillPrimary" onClick={() => setShowModal(true)}>
          Add Deadline
        </button>
      </div>

      {error && <div className="error" style={{ marginBottom: 20 }}>{error}</div>}

      <div className="panel panelPad" style={{ background: 'transparent', padding: 0 }}>
        {loading ? (
          <div style={{ color: 'var(--muted)' }}>Retrieving compliance items…</div>
        ) : items.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '40px 20px',
            borderRadius: 12,
            border: '1px dashed rgba(255,255,255,0.1)',
            color: 'var(--muted)',
          }}>
            No compliance items tracked. Click the button above to register an obligation.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {items.map((item) => {
              const overdue = new Date(item.dueDate) < new Date() && item.status !== 'FILED';
              return (
                <div
                  key={item.id}
                  style={{
                    padding: 20,
                    borderRadius: 12,
                    border: overdue ? '1px solid rgba(255,92,92,0.4)' : '1px solid rgba(255,255,255,0.06)',
                    background: overdue ? 'rgba(255,92,92,0.02)' : 'rgba(255,255,255,0.01)',
                    display: 'grid',
                    gridTemplateColumns: '1fr auto',
                    alignItems: 'center',
                    gap: 20,
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <h4 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{item.deadlineType}</h4>
                      <span style={{
                        fontSize: 10,
                        padding: '2px 8px',
                        borderRadius: 999,
                        background:
                          item.status === 'FILED'
                            ? 'rgba(92,255,160,0.1)'
                            : item.status === 'IN_PROGRESS'
                            ? 'rgba(255,233,92,0.1)'
                            : 'rgba(255,92,92,0.1)',
                        color:
                          item.status === 'FILED'
                            ? 'var(--accent)'
                            : item.status === 'IN_PROGRESS'
                            ? '#ffe95c'
                            : 'var(--danger)',
                        fontWeight: 600,
                      }}>
                        {item.status}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
                      Due: <span style={{ color: overdue ? 'var(--danger)' : 'var(--text)', fontWeight: overdue ? 600 : 400 }}>
                        {new Date(item.dueDate).toLocaleDateString()}
                      </span>
                      {item.asanaTaskId && ` • Asana Task: ${item.asanaTaskId}`}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      className="pill"
                      onClick={() => handleStatusChange(item.id, 'IN_PROGRESS')}
                      disabled={item.status === 'IN_PROGRESS'}
                      style={{ opacity: item.status === 'IN_PROGRESS' ? 0.5 : 1 }}
                    >
                      In Progress
                    </button>
                    <button
                      className="pill pillPrimary"
                      onClick={() => handleStatusChange(item.id, 'FILED')}
                      disabled={item.status === 'FILED'}
                      style={{ opacity: item.status === 'FILED' ? 0.5 : 1 }}
                    >
                      Mark Filed
                    </button>
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
            <h3 style={{ margin: 0, marginBottom: 16 }}>Add Compliance Task</h3>
            <form onSubmit={handleCreate} className="form">
              <div className="field">
                <label className="label">Obligation Type</label>
                <select
                  className="input"
                  value={deadlineType}
                  onChange={(e) => setDeadlineType(e.target.value as any)}
                >
                  <option value="FORM_990">FORM_990</option>
                  <option value="STATE_REGISTRATION">STATE_REGISTRATION</option>
                  <option value="GRANT_REPORT">GRANT_REPORT</option>
                </select>
              </div>

              <div className="field">
                <label className="label">Due Date</label>
                <input
                  type="date"
                  className="input"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  required
                />
              </div>

              <div className="field">
                <label className="label">Asana Task ID (Optional)</label>
                <input
                  type="text"
                  className="input"
                  value={asanaTaskId}
                  onChange={(e) => setAsanaTaskId(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24 }}>
                <button type="button" className="pill" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="pill pillPrimary">
                  Save Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
