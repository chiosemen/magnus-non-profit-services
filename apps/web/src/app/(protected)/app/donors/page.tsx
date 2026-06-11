'use client';

import { useEffect, useState, useRef } from 'react';

type Donor = {
  id: string;
  donorType: 'INDIVIDUAL' | 'ORGANIZATION';
  name: string;
  email: string | null;
  phone: string | null;
  addressJson: string | null;
  createdAt: string;
};

type Donation = {
  id: string;
  donorId: string;
  amount: string;
  currency: string;
  receivedAt: string;
  paymentMethod: string;
  referenceNumber: string | null;
  notes: string | null;
  source: 'MANUAL' | 'CSV_IMPORT' | 'FUTURE_STRIPE' | 'OTHER';
};

type Receipt = {
  id: string;
  donationId: string;
  receiptNumber: string;
  status: 'DRAFT' | 'ISSUED' | 'VOIDED';
  issuedAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
};

type CsvRow = {
  lineNumber: number;
  valid: boolean;
  errors: string[];
  donorName: string;
  donorEmail: string | null;
  donorPhone: string | null;
  amount: number | null;
  paymentMethod: string;
  date: string;
};

type CsvPreview = {
  valid: boolean;
  totalRows: number;
  validRowsCount: number;
  invalidRowsCount: number;
  rows: CsvRow[];
};

export default function DonorsPage() {
  // State lists
  const [donors, setDonors] = useState<Donor[]>([]);
  const [donations, setDonations] = useState<Donation[]>([]);
  const [receiptsMap, setReceiptsMap] = useState<Record<string, Receipt>>({});

  // Loading / Error
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Filter
  const [search, setSearch] = useState('');
  const [selectedDonor, setSelectedDonor] = useState<Donor | null>(null);
  const [donorDonations, setDonorDonations] = useState<Donation[]>([]);

  // Modals state
  const [showDonorModal, setShowDonorModal] = useState(false);
  const [editDonor, setEditDonor] = useState<Donor | null>(null);
  const [donorName, setDonorName] = useState('');
  const [donorEmail, setDonorEmail] = useState('');
  const [donorPhone, setDonorPhone] = useState('');
  const [donorAddress, setDonorAddress] = useState('');
  const [donorType, setDonorType] = useState<'INDIVIDUAL' | 'ORGANIZATION'>('INDIVIDUAL');

  const [showDonationModal, setShowDonationModal] = useState(false);
  const [donationAmount, setDonationAmount] = useState('');
  const [donationMethod, setDonationMethod] = useState('MANUAL');
  const [donationRef, setDonationRef] = useState('');
  const [donationNotes, setDonationNotes] = useState('');
  const [donationDate, setDonationDate] = useState(new Date().toISOString().slice(0, 10));

  const [showReceiptConfirm, setShowReceiptConfirm] = useState<Donation | null>(null);
  const [showVoidConfirm, setShowVoidConfirm] = useState<Receipt | null>(null);
  const [voidReason, setVoidReason] = useState('');

  // CSV Import state
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [csvContent, setCsvContent] = useState('');
  const [csvPreview, setCsvPreview] = useState<CsvPreview | null>(null);
  const [csvFileName, setCsvFileName] = useState('import.csv');
  const [csvError, setCsvError] = useState<string | null>(null);
  const [csvUploading, setCsvUploading] = useState(false);

  // API fetches
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch Donors
      const donorsRes = await fetch(`/api/org/donors?search=${encodeURIComponent(search)}`, { cache: 'no-store' });
      if (!donorsRes.ok) throw new Error('Failed to fetch donors');
      const donorsJson = await donorsRes.json();
      setDonors(donorsJson.donors || []);

      // 2. Fetch Donations
      const donationsRes = await fetch('/api/org/donations', { cache: 'no-store' });
      if (!donationsRes.ok) throw new Error('Failed to fetch donations');
      const donationsJson = await donationsRes.json();
      const fetchedDonations = donationsJson.donations || [];
      setDonations(fetchedDonations);

      // 3. Fetch receipts for each donation
      const tempReceipts: Record<string, Receipt> = {};
      for (const don of fetchedDonations) {
        const receiptRes = await fetch(`/api/org/receipts/${don.id}`).catch(() => null);
        if (receiptRes && receiptRes.ok) {
          const rJson = await receiptRes.json();
          if (rJson.receipt) {
            tempReceipts[don.id] = rJson.receipt;
          }
        }
      }
      setReceiptsMap(tempReceipts);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'An error occurred loading records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [search]);

  // Handle donor detail loading
  const handleSelectDonor = async (donor: Donor) => {
    setSelectedDonor(donor);
    try {
      const res = await fetch(`/api/org/donations?donorId=${donor.id}`);
      if (res.ok) {
        const json = await res.json();
        setDonorDonations(json.donations || []);
      }
    } catch {
      setDonorDonations([]);
    }
  };

  // Submit new/edit donor
  const handleSaveDonor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!donorName.trim()) return;

    try {
      const url = editDonor ? `/api/org/donors/${editDonor.id}` : '/api/org/donors';
      const method = editDonor ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: donorName,
          email: donorEmail || null,
          phone: donorPhone || null,
          addressJson: donorAddress || null,
          donorType,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Failed to save donor');
      }

      setShowDonorModal(false);
      setEditDonor(null);
      setDonorName('');
      setDonorEmail('');
      setDonorPhone('');
      setDonorAddress('');
      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Open Edit Donor Modal
  const openEditDonor = (donor: Donor) => {
    setEditDonor(donor);
    setDonorName(donor.name);
    setDonorEmail(donor.email || '');
    setDonorPhone(donor.phone || '');
    setDonorAddress(donor.addressJson || '');
    setDonorType(donor.donorType);
    setShowDonorModal(true);
  };

  // Submit manual donation
  const handleSaveDonation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDonor || !donationAmount) return;

    const amount = parseFloat(donationAmount);
    if (amount <= 0) {
      alert('Amount must be positive');
      return;
    }

    try {
      const res = await fetch('/api/org/donations/manual', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          donorId: selectedDonor.id,
          amount,
          currency: 'USD',
          receivedAt: new Date(donationDate).toISOString(),
          paymentMethod: donationMethod,
          referenceNumber: donationRef || undefined,
          notes: donationNotes || undefined,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Failed to save donation');
      }

      setShowDonationModal(false);
      setDonationAmount('');
      setDonationRef('');
      setDonationNotes('');
      // Reload donor history
      handleSelectDonor(selectedDonor);
      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Issue receipt
  const handleIssueReceipt = async () => {
    if (!showReceiptConfirm) return;
    try {
      const res = await fetch(`/api/org/donations/${showReceiptConfirm.id}/receipt`, {
        method: 'POST',
      });
      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Failed to issue receipt');
      }
      setShowReceiptConfirm(null);
      fetchData();
      if (selectedDonor) handleSelectDonor(selectedDonor);
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Void receipt
  const handleVoidReceipt = async () => {
    if (!showVoidConfirm || !voidReason.trim()) return;
    try {
      const res = await fetch(`/api/org/receipts/${showVoidConfirm.id}/void`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: voidReason }),
      });
      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Failed to void receipt');
      }
      setShowVoidConfirm(null);
      setVoidReason('');
      fetchData();
      if (selectedDonor) handleSelectDonor(selectedDonor);
    } catch (err: any) {
      alert(err.message);
    }
  };

  // CSV Import preview trigger
  const handleCsvPreview = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvFileName(file.name);
    setCsvError(null);
    setCsvPreview(null);
    setCsvUploading(true);

    try {
      const reader = new FileReader();
      reader.onload = async (evt) => {
        const text = evt.target?.result as string;
        setCsvContent(text);

        try {
          const res = await fetch('/api/org/donors/import-preview', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ csvContent: text }),
          });

          const json = await res.json();
          if (!res.ok) throw new Error(json.error || 'Failed to parse CSV');
          setCsvPreview(json.preview);
        } catch (err: any) {
          setCsvError(err.message);
        } finally {
          setCsvUploading(false);
        }
      };
      reader.readAsText(file);
    } catch (err: any) {
      setCsvError(err.message);
      setCsvUploading(false);
    }
  };

  // CSV Import commit trigger
  const handleCsvCommit = async () => {
    if (!csvContent) return;
    setCsvUploading(true);
    setCsvError(null);

    try {
      const res = await fetch('/api/org/donors/import-commit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ csvContent, fileName: csvFileName }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to commit CSV');

      alert(`Successfully imported ${json.rowsProcessed} records! Created ${json.donationsCreated} donations.`);
      setShowCsvImport(false);
      setCsvPreview(null);
      setCsvContent('');
      fetchData();
    } catch (err: any) {
      setCsvError(err.message);
    } finally {
      setCsvUploading(false);
    }
  };

  return (
    <div className="panel panelPad">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 className="h1" style={{ fontSize: 34, marginBottom: 4 }}>CRM & Donations</h1>
          <p className="subhead" style={{ marginBottom: 0 }}>Configure and log organization donors, manual offline gifts, and sequential tax receipts.</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="pill pillPrimary" onClick={() => { setEditDonor(null); setDonorName(''); setDonorEmail(''); setDonorPhone(''); setDonorAddress(''); setDonorType('INDIVIDUAL'); setShowDonorModal(true); }}>
            Add Donor
          </button>
          <button className="pill" onClick={() => setShowCsvImport(true)}>
            Import CSV
          </button>
        </div>
      </div>

      {error && <div className="error" style={{ marginBottom: 16 }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: selectedDonor ? '1fr 1fr' : '1fr', gap: 20 }}>
        {/* Donors List Panel */}
        <div className="panel panelPad" style={{ background: 'rgba(255,255,255,0.02)' }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <input
              type="text"
              className="input"
              style={{ flex: 1 }}
              placeholder="Search donors by name..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {loading ? (
            <div>Loading donors registry…</div>
          ) : donors.length === 0 ? (
            <div style={{ color: 'var(--muted)', padding: '20px 0' }}>No donors found. Create a new donor profile to get started.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {donors.map(d => (
                <div
                  key={d.id}
                  onClick={() => handleSelectDonor(d)}
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    border: '1px solid rgba(255,255,255,0.1)',
                    background: selectedDonor?.id === d.id ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.02)',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{d.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {d.email || 'No Email'} • {d.phone || 'No Phone'}
                    </div>
                  </div>
                  <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: d.donorType === 'ORGANIZATION' ? 'rgba(92,200,255,0.2)' : 'rgba(255,255,255,0.1)' }}>
                    {d.donorType}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Selected Donor Details & Donations Panel */}
        {selectedDonor && (
          <div className="panel panelPad" style={{ background: 'rgba(255,255,255,0.02)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 20 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 22 }}>{selectedDonor.name}</h2>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
                  <div>Email: {selectedDonor.email || '—'}</div>
                  <div>Phone: {selectedDonor.phone || '—'}</div>
                  {selectedDonor.addressJson && <div>Address: {selectedDonor.addressJson}</div>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="pill" onClick={() => openEditDonor(selectedDonor)}>Edit</button>
                <button className="pill pillPrimary" onClick={() => setShowDonationModal(true)}>Log Donation</button>
              </div>
            </div>

            <h3 style={{ fontSize: 16, borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 8, marginBottom: 12 }}>Donation Ledger & Receipts</h3>

            {donorDonations.length === 0 ? (
              <div style={{ color: 'var(--muted)', padding: '20px 0' }}>No donations logged for this donor.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {donorDonations.map(don => {
                  const receipt = receiptsMap[don.id];
                  return (
                    <div key={don.id} style={{ padding: 12, borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.01)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 16 }}>${parseFloat(don.amount).toFixed(2)} {don.currency}</div>
                          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                            Date: {new Date(don.receivedAt).toLocaleDateString()} • Method: {don.paymentMethod}
                          </div>
                          {don.referenceNumber && <div style={{ fontSize: 11, color: 'var(--muted)' }}>Ref: {don.referenceNumber}</div>}
                        </div>

                        {/* Receipt state */}
                        <div>
                          {receipt ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: 12, fontWeight: 500 }}>{receipt.receiptNumber}</div>
                                <div style={{ fontSize: 11, color: receipt.status === 'VOIDED' ? 'var(--danger)' : 'var(--accent)' }}>
                                  {receipt.status}
                                </div>
                              </div>
                              {receipt.status !== 'VOIDED' && (
                                <button className="pill" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => setShowVoidConfirm(receipt)}>
                                  Void
                                </button>
                              )}
                            </div>
                          ) : (
                            <button className="pill pillPrimary" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => setShowReceiptConfirm(don)}>
                              Issue Receipt
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── MODALS ─── */}

      {/* Add / Edit Donor Modal */}
      {showDonorModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="panel panelPad" style={{ width: '400px', background: '#0b0f17' }}>
            <h3 style={{ margin: 0, marginBottom: 16 }}>{editDonor ? 'Edit Donor Profile' : 'Create Donor Profile'}</h3>
            <form onSubmit={handleSaveDonor} className="form">
              <div className="field">
                <label className="label">Donor Type</label>
                <select className="input" value={donorType} onChange={e => setDonorType(e.target.value as any)}>
                  <option value="INDIVIDUAL">Individual</option>
                  <option value="ORGANIZATION">Organization</option>
                </select>
              </div>
              <div className="field">
                <label className="label">Name</label>
                <input type="text" className="input" value={donorName} onChange={e => setDonorName(e.target.value)} required />
              </div>
              <div className="field">
                <label className="label">Email (Optional)</label>
                <input type="email" className="input" value={donorEmail} onChange={e => setDonorEmail(e.target.value)} />
              </div>
              <div className="field">
                <label className="label">Phone (Optional)</label>
                <input type="text" className="input" value={donorPhone} onChange={e => setDonorPhone(e.target.value)} />
              </div>
              <div className="field">
                <label className="label">Address (Optional)</label>
                <input type="text" className="input" value={donorAddress} onChange={e => setDonorAddress(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
                <button type="button" className="pill" onClick={() => setShowDonorModal(false)}>Cancel</button>
                <button type="submit" className="pill pillPrimary">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Log Manual Donation Modal */}
      {showDonationModal && selectedDonor && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="panel panelPad" style={{ width: '400px', background: '#0b0f17' }}>
            <h3 style={{ margin: 0, marginBottom: 16 }}>Log Donation for {selectedDonor.name}</h3>
            <form onSubmit={handleSaveDonation} className="form">
              <div className="field">
                <label className="label">Amount (USD)</label>
                <input type="number" step="0.01" className="input" value={donationAmount} onChange={e => setDonationAmount(e.target.value)} required />
              </div>
              <div className="field">
                <label className="label">Date</label>
                <input type="date" className="input" value={donationDate} onChange={e => setDonationDate(e.target.value)} required />
              </div>
              <div className="field">
                <label className="label">Payment Method</label>
                <select className="input" value={donationMethod} onChange={e => setDonationMethod(e.target.value)}>
                  <option value="MANUAL_CHECK">Check</option>
                  <option value="WIRE_TRANSFER">Wire Transfer</option>
                  <option value="CASH">Cash</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <div className="field">
                <label className="label">Reference Number (Optional)</label>
                <input type="text" className="input" value={donationRef} onChange={e => setDonationRef(e.target.value)} placeholder="Check #, Wire TXID" />
              </div>
              <div className="field">
                <label className="label">Notes (Optional)</label>
                <input type="text" className="input" value={donationNotes} onChange={e => setDonationNotes(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
                <button type="button" className="pill" onClick={() => setShowDonationModal(false)}>Cancel</button>
                <button type="submit" className="pill pillPrimary">Save Donation</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Issue Receipt Confirmation Modal */}
      {showReceiptConfirm && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="panel panelPad" style={{ width: '400px', background: '#0b0f17', textAlign: 'center' }}>
            <h3 style={{ margin: 0, marginBottom: 12 }}>Issue Tax Receipt?</h3>
            <p className="cardBody" style={{ marginBottom: 20 }}>
              This will generate an immutable tax receipt for the donation of <b>${parseFloat(showReceiptConfirm.amount).toFixed(2)}</b>.
              Receipt numbers are logged sequentially and cannot be deleted.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button className="pill" onClick={() => setShowReceiptConfirm(null)}>Cancel</button>
              <button className="pill pillPrimary" onClick={handleIssueReceipt}>Confirm & Issue</button>
            </div>
          </div>
        </div>
      )}

      {/* Void Receipt Confirmation Modal */}
      {showVoidConfirm && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="panel panelPad" style={{ width: '400px', background: '#0b0f17' }}>
            <h3 style={{ margin: 0, marginBottom: 12 }}>Void Receipt {showVoidConfirm.receiptNumber}?</h3>
            <p className="cardBody" style={{ marginBottom: 16 }}>
              Voiding a receipt is permanent. Provide a reason for the audit log.
            </p>
            <div className="field" style={{ marginBottom: 16 }}>
              <label className="label">Void Reason</label>
              <input type="text" className="input" value={voidReason} onChange={e => setVoidReason(e.target.value)} required placeholder="e.g. check bounced" />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="pill" onClick={() => { setShowVoidConfirm(null); setVoidReason(''); }}>Cancel</button>
              <button className="pill pillPrimary" style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={handleVoidReceipt}>
                Confirm Void
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSV Import Modal */}
      {showCsvImport && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="panel panelPad" style={{ width: '700px', maxWidth: '90%', maxHeight: '90%', overflowY: 'auto', background: '#0b0f17' }}>
            <h3 style={{ margin: 0, marginBottom: 16 }}>Import Legacy Donors CSV</h3>

            <div className="field" style={{ marginBottom: 16 }}>
              <label className="label">Upload CSV File</label>
              <input type="file" accept=".csv" className="input" onChange={handleCsvPreview} />
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>CSV must have headers: name, email (optional), phone (optional), amount (optional), payment_method (optional), date (optional)</div>
            </div>

            {csvUploading && <div>Parsing CSV registry…</div>}
            {csvError && <div className="error" style={{ marginBottom: 16 }}>{csvError}</div>}

            {csvPreview && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', gap: 20, marginBottom: 12, padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
                  <div>Total Rows: <b>{csvPreview.totalRows}</b></div>
                  <div style={{ color: 'var(--accent)' }}>Valid Rows: <b>{csvPreview.validRowsCount}</b></div>
                  <div style={{ color: 'var(--danger)' }}>Invalid Rows: <b>{csvPreview.invalidRowsCount}</b></div>
                </div>

                <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: 'rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                        <th style={{ padding: 8 }}>Line</th>
                        <th style={{ padding: 8 }}>Name</th>
                        <th style={{ padding: 8 }}>Email</th>
                        <th style={{ padding: 8 }}>Amount</th>
                        <th style={{ padding: 8 }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {csvPreview.rows.map(r => (
                        <tr key={r.lineNumber} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', background: r.valid ? 'transparent' : 'rgba(255,92,92,0.1)' }}>
                          <td style={{ padding: 8 }}>{r.lineNumber}</td>
                          <td style={{ padding: 8 }}>{r.donorName}</td>
                          <td style={{ padding: 8 }}>{r.donorEmail || '—'}</td>
                          <td style={{ padding: 8 }}>{r.amount !== null ? `$${r.amount}` : '—'}</td>
                          <td style={{ padding: 8, color: r.valid ? 'var(--accent)' : 'var(--danger)' }}>
                            {r.valid ? 'Valid' : r.errors.join(', ')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="pill" onClick={() => { setShowCsvImport(false); setCsvPreview(null); setCsvContent(''); }}>Cancel</button>
              {csvPreview?.valid && (
                <button className="pill pillPrimary" onClick={handleCsvCommit} disabled={csvUploading}>
                  Commit Import
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
