'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

type Campaign = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  goalAmount: string | null;
  currency: string;
  status: 'DRAFT' | 'LIVE' | 'ARCHIVED';
};

export default function PublicCampaignPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [orgName, setOrgName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Donation form state
  const [customAmount, setCustomAmount] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<number | null>(50);
  const [donorName, setDonorName] = useState('');
  const [donorEmail, setDonorEmail] = useState('');
  const [coverFees, setCoverFees] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    fetch(`/api/public/campaigns/${slug}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Campaign not found or unavailable');
        }
        setCampaign(data.campaign);
        setOrgName(data.organizationName || '');
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [slug]);

  const presets = [10, 25, 50, 100, 250];

  const getNetAmount = () => {
    if (selectedPreset !== null) return selectedPreset;
    const val = parseFloat(customAmount);
    return isNaN(val) || val <= 0 ? 0 : val;
  };

  const netAmount = getNetAmount();

  // Deterministic fee calculation: gross charge = (net + 0.30) / 0.971
  const calculateGrossAndFee = (net: number) => {
    if (net <= 0) return { gross: 0, fee: 0 };
    const gross = parseFloat(((net + 0.30) / 0.971).toFixed(2));
    const fee = parseFloat((gross - net).toFixed(2));
    return { gross, fee };
  };

  const { gross, fee } = calculateGrossAndFee(netAmount);
  const displayAmount = coverFees ? gross : netAmount;

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (netAmount <= 0) {
      alert('Please select or enter a valid donation amount.');
      return;
    }
    if (!donorName.trim() || !donorEmail.trim()) {
      alert('Please fill in your name and email address.');
      return;
    }

    setCheckingOut(true);
    try {
      const publicUrl = window.location.origin;
      const res = await fetch(`/api/public/campaigns/${slug}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: netAmount,
          donorEmail: donorEmail.trim(),
          donorName: donorName.trim(),
          coverFees,
          successUrl: `${publicUrl}/campaigns/${slug}/success?session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${publicUrl}/campaigns/${slug}/cancel`,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to initiate checkout.');
      }

      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('Checkout session did not return redirect URL.');
      }
    } catch (err: any) {
      alert(err.message || 'An error occurred during checkout initialization.');
    } finally {
      setCheckingOut(false);
    }
  };

  if (loading) {
    return (
      <div className="section" style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--muted)', fontSize: 18 }}>Loading campaign information...</div>
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div className="section" style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="panel panelPad" style={{ maxWidth: 480, textAlign: 'center' }}>
          <h2 style={{ color: 'var(--danger)', marginBottom: 12 }}>Campaign Unavailable</h2>
          <p className="cardBody" style={{ marginBottom: 20 }}>
            {error || 'This campaign is not currently accepting donations or does not exist.'}
          </p>
          <button className="pill pillPrimary" onClick={() => router.push('/')}>Go to Homepage</button>
        </div>
      </div>
    );
  }

  return (
    <div className="section" style={{ background: 'radial-gradient(circle at top right, rgba(138, 43, 226, 0.05), transparent)' }}>
      <div className="container" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, alignItems: 'start' }}>
        
        {/* Campaign Info */}
        <div style={{ paddingRight: 20 }}>
          <span style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--accent)', fontWeight: 600 }}>
            Active Fundraiser
          </span>
          <h1 className="h1" style={{ fontSize: 48, marginTop: 8, marginBottom: 16 }}>{campaign.title}</h1>
          <p style={{ fontSize: 18, color: 'var(--accent)', marginBottom: 24, fontWeight: 500 }}>
            Benefitting <b>{orgName}</b>
          </p>
          {campaign.description ? (
            <div style={{ color: 'var(--muted)', fontSize: 16, lineHeight: 1.7, whiteSpace: 'pre-line' }}>
              {campaign.description}
            </div>
          ) : (
            <div style={{ color: 'var(--muted)', fontSize: 16, fontStyle: 'italic' }}>
              Join us in supporting our mission. Every donation counts towards making a real difference in the community.
            </div>
          )}

          <div style={{ marginTop: 40, padding: 20, borderRadius: 16, border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.01)' }}>
            <h4 style={{ fontSize: 14, textTransform: 'uppercase', marginBottom: 8, color: 'var(--muted)' }}>Payment Transparency</h4>
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
              Your transaction is processed directly by the charity's merchant gateway via <b>Stripe Connect</b>. 
              Magnus Accord never takes a cut or holds your funds.
            </p>
          </div>
        </div>

        {/* Donation checkout form */}
        <div className="panel panelPad" style={{ border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.02)' }}>
          <h3 style={{ fontSize: 24, marginBottom: 20 }}>Make a Donation</h3>
          
          <form onSubmit={handleCheckout} className="form">
            <div className="field">
              <label className="label">Select Donation Amount</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 12 }}>
                {presets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setSelectedPreset(preset);
                      setCustomAmount('');
                    }}
                    style={{
                      padding: '12px 4px',
                      borderRadius: 8,
                      border: selectedPreset === preset ? '1px solid var(--accent)' : '1px solid rgba(255,255,255,0.1)',
                      background: selectedPreset === preset ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.02)',
                      color: selectedPreset === preset ? '#fff' : 'var(--muted)',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    ${preset}
                  </button>
                ))}
              </div>
              <input
                type="number"
                step="1"
                placeholder="Or enter custom amount..."
                className="input"
                value={customAmount}
                onChange={(e) => {
                  setSelectedPreset(null);
                  setCustomAmount(e.target.value);
                }}
              />
            </div>

            <div className="field">
              <label className="label">Donor Name</label>
              <input
                type="text"
                className="input"
                required
                placeholder="Your full name"
                value={donorName}
                onChange={(e) => setDonorName(e.target.value)}
              />
            </div>

            <div className="field">
              <label className="label">Donor Email</label>
              <input
                type="email"
                className="input"
                required
                placeholder="your.email@example.com"
                value={donorEmail}
                onChange={(e) => setDonorEmail(e.target.value)}
              />
            </div>

            {netAmount > 0 && (
              <div style={{
                padding: 16,
                borderRadius: 12,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                marginBottom: 20,
              }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={coverFees}
                    onChange={(e) => setCoverFees(e.target.checked)}
                    style={{ marginTop: 3 }}
                  />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>Cover transaction costs?</div>
                    <p style={{ fontSize: 12, color: 'var(--muted)', margin: '4px 0 0 0' }}>
                      Add <b>${fee.toFixed(2)}</b> to cover merchant fees so that 100% of your intended <b>${netAmount.toFixed(2)}</b> donation goes to {orgName || 'the charity'}.
                    </p>
                  </div>
                </label>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <span style={{ color: 'var(--muted)', fontSize: 14 }}>Total Donation:</span>
              <span style={{ fontSize: 24, fontWeight: 700 }}>${displayAmount.toFixed(2)} {campaign.currency}</span>
            </div>

            <button
              type="submit"
              className="pill pillPrimary"
              style={{ width: '100%', padding: '14px', fontSize: 16 }}
              disabled={checkingOut || netAmount <= 0}
            >
              {checkingOut ? 'Preparing Checkout...' : `Donate $${displayAmount.toFixed(2)}`}
            </button>
          </form>

        </div>
      </div>
    </div>
  );
}
