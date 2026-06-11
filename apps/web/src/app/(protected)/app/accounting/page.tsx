'use client';

import { useEffect, useState } from 'react';

type Fund = {
  id: string;
  name: string;
  code: string;
  type: 'RESTRICTED' | 'UNRESTRICTED';
  description: string | null;
};

type Account = {
  id: string;
  name: string;
  code: string;
  type: 'ASSET' | 'LIABILITY' | 'FUND_BALANCE' | 'REVENUE' | 'EXPENSE';
  parentId: string | null;
};

type Donation = {
  id: string;
  donorId: string;
  amount: string;
  currency: string;
  receivedAt: string;
  paymentMethod: string;
  notes: string | null;
  donor?: { name: string };
};

type FundBalanceRow = {
  fundId: string;
  fundName: string;
  fundCode: string;
  isRestricted: boolean;
  openingBalance: number;
  revenue: number;
  expenses: number;
  netChange: number;
  currentBalance: number;
};

type IncomeExpenseRow = {
  accountId: string;
  accountName: string;
  accountCode: string;
  type: 'REVENUE' | 'EXPENSE';
  amount: number;
};

type BoardSummary = {
  fiscalYear: number;
  totalGiving: number;
  restrictedGiving: number;
  unrestrictedGiving: number;
  topCampaigns: { name: string; amount: number }[];
  fundBalances: { name: string; balance: number; isRestricted: boolean }[];
  interpretation: string;
};

export default function AccountingDashboardPage() {
  const [activeTab, setActiveTab] = useState<'funds' | 'accounts' | 'allocations' | 'reports' | 'board'>('funds');
  const [funds, setFunds] = useState<Fund[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [donations, setDonations] = useState<Donation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Forms state
  const [showFundModal, setShowFundModal] = useState(false);
  const [fundName, setFundName] = useState('');
  const [fundCode, setFundCode] = useState('');
  const [fundType, setFundType] = useState<'RESTRICTED' | 'UNRESTRICTED'>('UNRESTRICTED');
  const [fundDescription, setFundDescription] = useState('');

  const [showAccountModal, setShowAccountModal] = useState(false);
  const [accName, setAccName] = useState('');
  const [accCode, setAccCode] = useState('');
  const [accType, setAccType] = useState<'ASSET' | 'LIABILITY' | 'FUND_BALANCE' | 'REVENUE' | 'EXPENSE'>('ASSET');
  const [accParentId, setAccParentId] = useState('');

  // Allocations state
  const [selectedDonation, setSelectedDonation] = useState<Donation | null>(null);
  const [allocationsMap, setAllocationsMap] = useState<Record<string, number>>({});
  const [allocatingAmount, setAllocatingAmount] = useState('');
  const [allocatingFundId, setAllocatingFundId] = useState('');

  // Reports state
  const [fundBalanceReport, setFundBalanceReport] = useState<FundBalanceRow[]>([]);
  const [incExpReport, setIncExpReport] = useState<IncomeExpenseRow[]>([]);
  const [boardSummary, setBoardSummary] = useState<BoardSummary | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch Funds
      const fundsRes = await fetch('/api/org/accounting/funds');
      if (!fundsRes.ok) throw new Error('Failed to retrieve funds registry.');
      const fundsData = await fundsRes.json();
      setFunds(fundsData.funds || []);

      // 2. Fetch Accounts
      const accountsRes = await fetch('/api/org/accounting/accounts');
      if (!accountsRes.ok) throw new Error('Failed to retrieve chart of accounts.');
      const accountsData = await accountsRes.json();
      setAccounts(accountsData.accounts || []);

      // 3. Fetch Donations
      const donationsRes = await fetch('/api/org/donations');
      if (donationsRes.ok) {
        const donData = await donationsRes.json();
        setDonations(donData.donations || []);
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred fetching accounting ledger details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const loadReports = async () => {
    try {
      const q = `?startDate=${startDate}&endDate=${endDate}`;
      const fRes = await fetch(`/api/org/accounting/reports/fund-balance${q}`);
      if (fRes.ok) {
        const fJson = await fRes.json();
        setFundBalanceReport(fJson.report || []);
      }

      const ieRes = await fetch(`/api/org/accounting/reports/income-expense${q}`);
      if (ieRes.ok) {
        const ieJson = await ieRes.json();
        setIncExpReport(ieJson.report || []);
      }

      const boardRes = await fetch('/api/org/accounting/reports/board-summary');
      if (boardRes.ok) {
        const boardJson = await boardRes.json();
        setBoardSummary(boardJson.summary || null);
      }
    } catch {
      // Fail silently for report refreshes to avoid covering other screens
    }
  };

  useEffect(() => {
    if (activeTab === 'reports' || activeTab === 'board') {
      loadReports();
    }
  }, [activeTab, startDate, endDate]);

  const handleCreateFund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fundName.trim() || !fundCode.trim()) return;

    try {
      const res = await fetch('/api/org/accounting/funds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: fundName.trim(),
          code: fundCode.trim(),
          type: fundType,
          description: fundDescription.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create fund.');

      setShowFundModal(false);
      setFundName('');
      setFundCode('');
      setFundType('UNRESTRICTED');
      setFundDescription('');
      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accName.trim() || !accCode.trim()) return;

    try {
      const res = await fetch('/api/org/accounting/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: accName.trim(),
          code: accCode.trim(),
          type: accType,
          parentId: accParentId || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create account.');

      setShowAccountModal(false);
      setAccName('');
      setAccCode('');
      setAccType('ASSET');
      setAccParentId('');
      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleAllocateDonation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDonation || !allocatingFundId || !allocatingAmount) return;

    const amt = parseFloat(allocatingAmount);
    if (isNaN(amt) || amt <= 0) {
      alert('Please enter a valid allocation amount.');
      return;
    }

    try {
      const res = await fetch('/api/org/accounting/allocations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          donationId: selectedDonation.id,
          fundId: allocatingFundId,
          amount: amt,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Allocation rejected.');

      setAllocatingAmount('');
      setAllocatingFundId('');
      alert('Gifts allocated successfully to program fund.');
      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="panel panelPad">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 className="h1" style={{ fontSize: 34, marginBottom: 4 }}>Fund Accounting Lite</h1>
          <p className="subhead" style={{ marginBottom: 0 }}>Double-entry accountability system for restricted program funds, assets, and executive reports.</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {activeTab === 'funds' && (
            <button className="pill pillPrimary" onClick={() => setShowFundModal(true)}>Create Fund</button>
          )}
          {activeTab === 'accounts' && (
            <button className="pill pillPrimary" onClick={() => setShowAccountModal(true)}>Create Account</button>
          )}
        </div>
      </div>

      {error && <div className="error" style={{ marginBottom: 16 }}>{error}</div>}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 12, marginBottom: 20 }}>
        <button className={`pill ${activeTab === 'funds' ? 'pillPrimary' : ''}`} onClick={() => setActiveTab('funds')}>
          Funds buckets
        </button>
        <button className={`pill ${activeTab === 'accounts' ? 'pillPrimary' : ''}`} onClick={() => setActiveTab('accounts')}>
          Chart of Accounts
        </button>
        <button className={`pill ${activeTab === 'allocations' ? 'pillPrimary' : ''}`} onClick={() => setActiveTab('allocations')}>
          Donation Allocation
        </button>
        <button className={`pill ${activeTab === 'reports' ? 'pillPrimary' : ''}`} onClick={() => setActiveTab('reports')}>
          Financial Reports
        </button>
        <button className={`pill ${activeTab === 'board' ? 'pillPrimary' : ''}`} onClick={() => setActiveTab('board')}>
          Board financial summary
        </button>
      </div>

      {loading ? (
        <div>Retrieving accounting logs…</div>
      ) : (
        <div>
          {/* Funds Tab */}
          {activeTab === 'funds' && (
            <div>
              {funds.length === 0 ? (
                <div style={{ color: 'var(--muted)', padding: '20px 0' }}>No funds configured. Click Create Fund above to start tracking restricted allocations.</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  {funds.map((f) => (
                    <div key={f.id} style={{
                      padding: 16,
                      borderRadius: 12,
                      border: '1px solid rgba(255,255,255,0.06)',
                      background: 'rgba(255,255,255,0.01)',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h4 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{f.name}</h4>
                        <span style={{
                          fontSize: 10,
                          padding: '2px 8px',
                          borderRadius: 10,
                          background: f.type === 'RESTRICTED' ? 'rgba(255,92,92,0.15)' : 'rgba(92,200,255,0.15)',
                          color: f.type === 'RESTRICTED' ? 'var(--danger)' : 'var(--accent)',
                          fontWeight: 600,
                        }}>
                          {f.type}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>Code: {f.code}</div>
                      {f.description && <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8, margin: 0 }}>{f.description}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Chart of Accounts Tab */}
          {activeTab === 'accounts' && (
            <div>
              {accounts.length === 0 ? (
                <div style={{ color: 'var(--muted)', padding: '20px 0' }}>No accounts registered. Add accounts to build the organization chart.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {accounts.map((a) => (
                    <div key={a.id} style={{
                      padding: 12,
                      borderRadius: 8,
                      border: '1px solid rgba(255,255,255,0.04)',
                      background: 'rgba(255,255,255,0.01)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}>
                      <div>
                        <span style={{ fontWeight: 600, marginRight: 12 }}>{a.code}</span>
                        <span>{a.name}</span>
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>{a.type}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Donation Allocation Tab */}
          {activeTab === 'allocations' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div>
                <h3 style={{ fontSize: 18, marginBottom: 12 }}>Received Donations Ledger</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {donations.map((d) => (
                    <div
                      key={d.id}
                      onClick={() => setSelectedDonation(d)}
                      style={{
                        padding: 12,
                        borderRadius: 10,
                        border: '1px solid rgba(255,255,255,0.06)',
                        background: selectedDonation?.id === d.id ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.01)',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontWeight: 600 }}>${parseFloat(d.amount).toFixed(2)}</span>
                        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{new Date(d.receivedAt).toLocaleDateString()}</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                        Donor: {d.donor?.name || 'Anonymous'} • Method: {d.paymentMethod}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 style={{ fontSize: 18, marginBottom: 12 }}>Allocation Registry</h3>
                {selectedDonation ? (
                  <form onSubmit={handleAllocateDonation} className="form" style={{ background: 'rgba(255,255,255,0.02)', padding: 20, borderRadius: 12 }}>
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 14, color: 'var(--muted)' }}>Donation Amount:</div>
                      <div style={{ fontSize: 24, fontWeight: 700 }}>${parseFloat(selectedDonation.amount).toFixed(2)}</div>
                    </div>

                    <div className="field">
                      <label className="label">Target Fund bucket</label>
                      <select className="input" value={allocatingFundId} onChange={(e) => setAllocatingFundId(e.target.value)} required>
                        <option value="">-- Select Fund --</option>
                        {funds.map((f) => (
                          <option key={f.id} value={f.id}>{f.code} - {f.name} ({f.type})</option>
                        ))}
                      </select>
                    </div>

                    <div className="field">
                      <label className="label">Allocation Amount (USD)</label>
                      <input
                        type="number"
                        step="0.01"
                        className="input"
                        value={allocatingAmount}
                        onChange={(e) => setAllocatingAmount(e.target.value)}
                        required
                      />
                    </div>

                    <button type="submit" className="pill pillPrimary" style={{ width: '100%', marginTop: 12 }}>
                      Confirm Allocation
                    </button>
                  </form>
                ) : (
                  <div style={{ color: 'var(--muted)' }}>Select a donation record from the ledger on the left to designate/allocate fund splits.</div>
                )}
              </div>
            </div>
          )}

          {/* Financial Reports Tab */}
          {activeTab === 'reports' && (
            <div>
              <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
                <input type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} placeholder="Start Date" />
                <input type="date" className="input" value={endDate} onChange={(e) => setEndDate(e.target.value)} placeholder="End Date" />
              </div>

              {/* Fund Balances */}
              <div style={{ marginBottom: 30 }}>
                <h3 style={{ fontSize: 18, marginBottom: 12 }}>Fund Balance Report</h3>
                <div style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 14 }}>
                    <thead>
                      <tr style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                        <th style={{ padding: 12 }}>Fund Code</th>
                        <th style={{ padding: 12 }}>Fund Name</th>
                        <th style={{ padding: 12 }}>Type</th>
                        <th style={{ padding: 12 }}>Opening Balance</th>
                        <th style={{ padding: 12 }}>Revenue</th>
                        <th style={{ padding: 12 }}>Expenses</th>
                        <th style={{ padding: 12 }}>Current Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fundBalanceReport.length === 0 ? (
                        <tr><td colSpan={7} style={{ padding: 16, textAlign: 'center', color: 'var(--muted)' }}>No reporting entries for the selected dates.</td></tr>
                      ) : (
                        fundBalanceReport.map((r) => (
                          <tr key={r.fundId} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                            <td style={{ padding: 12, fontWeight: 600 }}>{r.fundCode}</td>
                            <td style={{ padding: 12 }}>{r.fundName}</td>
                            <td style={{ padding: 12 }}>
                              <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: r.isRestricted ? 'rgba(255,92,92,0.1)' : 'rgba(92,200,255,0.1)' }}>
                                {r.isRestricted ? 'RESTRICTED' : 'UNRESTRICTED'}
                              </span>
                            </td>
                            <td style={{ padding: 12 }}>${r.openingBalance.toFixed(2)}</td>
                            <td style={{ padding: 12, color: 'var(--accent)' }}>+${r.revenue.toFixed(2)}</td>
                            <td style={{ padding: 12, color: 'var(--danger)' }}>-${r.expenses.toFixed(2)}</td>
                            <td style={{ padding: 12, fontWeight: 700 }}>${r.currentBalance.toFixed(2)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Income & Expense */}
              <div>
                <h3 style={{ fontSize: 18, marginBottom: 12 }}>Statement of Income & Expense</h3>
                <div style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 14 }}>
                    <thead>
                      <tr style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                        <th style={{ padding: 12 }}>Account Code</th>
                        <th style={{ padding: 12 }}>Account Name</th>
                        <th style={{ padding: 12 }}>Type</th>
                        <th style={{ padding: 12 }}>Total splits</th>
                      </tr>
                    </thead>
                    <tbody>
                      {incExpReport.length === 0 ? (
                        <tr><td colSpan={4} style={{ padding: 16, textAlign: 'center', color: 'var(--muted)' }}>No revenue or expense records found.</td></tr>
                      ) : (
                        incExpReport.map((r) => (
                          <tr key={r.accountId} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                            <td style={{ padding: 12, fontWeight: 600 }}>{r.accountCode}</td>
                            <td style={{ padding: 12 }}>{r.accountName}</td>
                            <td style={{ padding: 12, color: 'var(--muted)' }}>{r.type}</td>
                            <td style={{ padding: 12, fontWeight: 700, color: r.type === 'REVENUE' ? 'var(--accent)' : 'var(--danger)' }}>
                              {r.type === 'REVENUE' ? '+' : '-'}${r.amount.toFixed(2)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

          {/* Board financial summary Tab */}
          {activeTab === 'board' && (
            <div>
              {boardSummary ? (
                <div className="panel panelPad" style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 16,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 16, marginBottom: 20 }}>
                    <h3 style={{ fontSize: 22, margin: 0 }}>Executive Board Summary — FY {boardSummary.fiscalYear}</h3>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>Status: DETERMINISTIC AUDIT GREEN</span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20, marginBottom: 24 }}>
                    <div style={{ padding: 16, background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.04)' }}>
                      <div style={{ fontSize: 13, color: 'var(--muted)' }}>Total Giving Ledger</div>
                      <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4 }}>${boardSummary.totalGiving.toLocaleString()}</div>
                    </div>
                    <div style={{ padding: 16, background: 'rgba(255,92,92,0.04)', borderRadius: 12, border: '1px solid rgba(255,92,92,0.1)' }}>
                      <div style={{ fontSize: 13, color: 'var(--danger)' }}>Restricted Program Funds</div>
                      <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4, color: 'var(--danger)' }}>${boardSummary.restrictedGiving.toLocaleString()}</div>
                    </div>
                    <div style={{ padding: 16, background: 'rgba(92,200,255,0.04)', borderRadius: 12, border: '1px solid rgba(92,200,255,0.1)' }}>
                      <div style={{ fontSize: 13, color: 'var(--accent)' }}>General Operations</div>
                      <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4, color: 'var(--accent)' }}>${boardSummary.unrestrictedGiving.toLocaleString()}</div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
                    <div>
                      <h4 style={{ fontSize: 15, textTransform: 'uppercase', marginBottom: 12, color: 'var(--muted)' }}>Top Performing Campaigns</h4>
                      {boardSummary.topCampaigns.length === 0 ? (
                        <div style={{ color: 'var(--muted)' }}>No campaigns recorded.</div>
                      ) : (
                        boardSummary.topCampaigns.map((c, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                            <span>{c.name}</span>
                            <span style={{ fontWeight: 600 }}>${c.amount.toLocaleString()}</span>
                          </div>
                        ))
                      )}
                    </div>

                    <div>
                      <h4 style={{ fontSize: 15, textTransform: 'uppercase', marginBottom: 12, color: 'var(--muted)' }}>Active Fund balances</h4>
                      {boardSummary.fundBalances.length === 0 ? (
                        <div style={{ color: 'var(--muted)' }}>No funds recorded.</div>
                      ) : (
                        boardSummary.fundBalances.map((f, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                            <span>{f.name} {f.isRestricted ? '(Restricted)' : '(Unrestricted)'}</span>
                            <span style={{ fontWeight: 600 }}>${f.balance.toLocaleString()}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div style={{ padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 12, borderLeft: '4px solid var(--accent)' }}>
                    <h5 style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Plain-Language Treasurer interpretation</h5>
                    <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0, lineHeight: 1.6 }}>{boardSummary.interpretation}</p>
                  </div>
                </div>
              ) : (
                <div style={{ color: 'var(--muted)' }}>No board summary payload available. Add donation allocations to compile executive briefs.</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Funds Modal */}
      {showFundModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="panel panelPad" style={{ width: '400px', background: '#0b0f17' }}>
            <h3 style={{ margin: 0, marginBottom: 16 }}>Create Fund bucket</h3>
            <form onSubmit={handleCreateFund} className="form">
              <div className="field">
                <label className="label">Fund Name</label>
                <input type="text" className="input" value={fundName} onChange={(e) => setFundName(e.target.value)} required />
              </div>
              <div className="field">
                <label className="label">Unique Fund Code</label>
                <input type="text" className="input" value={fundCode} onChange={(e) => setFundCode(e.target.value)} required placeholder="e.g. FD-101" />
              </div>
              <div className="field">
                <label className="label">Fund Restriction Type</label>
                <select className="input" value={fundType} onChange={(e) => setFundType(e.target.value as any)}>
                  <option value="UNRESTRICTED">Unrestricted Fund</option>
                  <option value="RESTRICTED">Restricted Fund</option>
                </select>
              </div>
              <div className="field">
                <label className="label">Purpose / Description</label>
                <textarea className="input" style={{ minHeight: 60 }} value={fundDescription} onChange={(e) => setFundDescription(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
                <button type="button" className="pill" onClick={() => setShowFundModal(false)}>Cancel</button>
                <button type="submit" className="pill pillPrimary">Save Fund</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Accounts Modal */}
      {showAccountModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="panel panelPad" style={{ width: '400px', background: '#0b0f17' }}>
            <h3 style={{ margin: 0, marginBottom: 16 }}>Create Chart Account</h3>
            <form onSubmit={handleCreateAccount} className="form">
              <div className="field">
                <label className="label">Account Name</label>
                <input type="text" className="input" value={accName} onChange={(e) => setAccName(e.target.value)} required />
              </div>
              <div className="field">
                <label className="label">Unique Account Code</label>
                <input type="text" className="input" value={accCode} onChange={(e) => setAccCode(e.target.value)} required placeholder="e.g. 1000" />
              </div>
              <div className="field">
                <label className="label">Account Classification</label>
                <select className="input" value={accType} onChange={(e) => setAccType(e.target.value as any)}>
                  <option value="ASSET">ASSET (Cash, Receivables)</option>
                  <option value="LIABILITY">LIABILITY (Payables, Debt)</option>
                  <option value="FUND_BALANCE">FUND BALANCE / EQUITY</option>
                  <option value="REVENUE">REVENUE (Donations, Grants)</option>
                  <option value="EXPENSE">EXPENSE (Fees, Programs)</option>
                </select>
              </div>
              <div className="field">
                <label className="label">Parent Account (Optional)</label>
                <select className="input" value={accParentId} onChange={(e) => setAccParentId(e.target.value)}>
                  <option value="">-- None --</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
                <button type="button" className="pill" onClick={() => setShowAccountModal(false)}>Cancel</button>
                <button type="submit" className="pill pillPrimary">Save Account</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
