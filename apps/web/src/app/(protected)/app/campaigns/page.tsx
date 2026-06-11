'use client';

import { useEffect, useState } from 'react';

type Campaign = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  goalAmount: string | null;
  currency: string;
  status: 'DRAFT' | 'LIVE' | 'ARCHIVED';
  createdAt: string;
};

type StripeConnectAccount = {
  stripeAccountId: string | null;
  onboardingStatus: 'NOT_STARTED' | 'LINK_CREATED' | 'IN_PROGRESS' | 'ENABLED' | 'RESTRICTED' | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
};

export default function AdminCampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [stripeAccount, setStripeAccount] = useState<StripeConnectAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Forms and Modals state
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [goalAmount, setGoalAmount] = useState('');
  const [currency, setCurrency] = useState('USD');

  // Stripe onboarding loading state
  const [onboardingLoading, setOnboardingLoading] = useState(false);
  const stripeReady = stripeAccount?.onboardingStatus === 'ENABLED' && !!stripeAccount?.chargesEnabled;

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch campaigns
      const campaignsRes = await fetch('/api/org/campaigns');
      if (!campaignsRes.ok) throw new Error('Failed to fetch campaigns.');
      const campaignsData = await campaignsRes.ok ? await campaignsRes.json() : { campaigns: [] };
      setCampaigns(campaignsData.campaigns || []);

      // 2. Fetch Stripe status
      const stripeRes = await fetch('/api/org/stripe-connect/status');
      if (stripeRes.ok) {
        const stripeData = await stripeRes.json();
        setStripeAccount(stripeData.status || null);
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred loading dashboard information.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleConnectStripe = async () => {
    setOnboardingLoading(true);
    try {
      const res = await fetch('/api/org/stripe-connect/onboarding-link', {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to initiate Stripe onboarding.');
      }
      if (data.onboarding?.onboardingUrl) {
        window.location.href = data.onboarding.onboardingUrl;
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setOnboardingLoading(false);
    }
  };

  const handleSaveCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) {
      alert('Name and slug are required.');
      return;
    }

    try {
      const url = editingCampaign ? `/api/org/campaigns/${editingCampaign.id}` : '/api/org/campaigns';
      const method = editingCampaign ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: name.trim(),
          slug: slug.trim(),
          description: description.trim() || null,
          goalAmount: goalAmount ? parseFloat(goalAmount) : null,
          currency: currency.trim().toUpperCase(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save campaign.');
      }

      setShowCampaignModal(false);
      setEditingCampaign(null);
      setName('');
      setSlug('');
      setDescription('');
      setGoalAmount('');
      setCurrency('USD');
      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handlePublish = async (campaign: Campaign) => {
    try {
      const res = await fetch(`/api/org/campaigns/${campaign.id}/publish`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to publish campaign.');
      }
      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleArchive = async (campaign: Campaign) => {
    try {
      const res = await fetch(`/api/org/campaigns/${campaign.id}/archive`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to archive campaign.');
      }
      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const openCreateModal = () => {
    setEditingCampaign(null);
    setName('');
    setSlug('');
    setDescription('');
    setGoalAmount('');
    setCurrency('USD');
    setShowCampaignModal(true);
  };

  const openEditModal = (campaign: Campaign) => {
    setEditingCampaign(campaign);
    setName(campaign.title);
    setSlug(campaign.slug);
    setDescription(campaign.description || '');
    setGoalAmount(campaign.goalAmount ? parseFloat(campaign.goalAmount).toString() : '');
    setCurrency(campaign.currency);
    setShowCampaignModal(true);
  };

  return (
    <div className="panel panelPad">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 className="h1" style={{ fontSize: 34, marginBottom: 4 }}>Fundraising Campaigns</h1>
          <p className="subhead" style={{ marginBottom: 0 }}>Create public donation campaigns and manage merchant payment processing integrations.</p>
        </div>
        <button className="pill pillPrimary" onClick={openCreateModal}>
          Create Campaign
        </button>
      </div>

      {error && <div className="error" style={{ marginBottom: 20 }}>{error}</div>}

      {/* Stripe Connect Configuration Status Panel */}
      <div className="panel panelPad" style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 16,
        marginBottom: 24,
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: 20,
        alignItems: 'center',
      }}>
        <div>
          <h3 style={{ fontSize: 18, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>Stripe Connect Merchant Integration</span>
            <span style={{
              fontSize: 11,
              padding: '2px 8px',
              borderRadius: 10,
              background: stripeReady ? 'rgba(92,255,160,0.1)' : 'rgba(255,92,92,0.1)',
              color: stripeReady ? 'var(--accent)' : 'var(--danger)',
              fontWeight: 600,
            }}>
              {stripeReady ? 'CONNECTED' : 'DISCONNECTED'}
            </span>
          </h3>
          <p style={{ color: 'var(--muted)', fontSize: 13, margin: '8px 0 0 0', lineHeight: 1.5 }}>
            {stripeReady
              ? `Connected Account ID: ${stripeAccount?.stripeAccountId}. Direct-to-merchant donation flow is enabled.`
              : 'Stripe merchant onboarding is incomplete. You must link your Stripe account before campaign pages can be published LIVE.'}
          </p>
        </div>
        <div>
          <button
            className="pill pillPrimary"
            onClick={handleConnectStripe}
            disabled={onboardingLoading}
          >
            {onboardingLoading ? 'Loading Onboarding…' : stripeReady ? 'Reconfigure Stripe' : 'Connect Stripe Account'}
          </button>
        </div>
      </div>

      {/* Campaigns Listing */}
      <div className="panel panelPad" style={{ background: 'transparent', padding: 0 }}>
        {loading ? (
          <div style={{ color: 'var(--muted)' }}>Retrieving campaign records…</div>
        ) : campaigns.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '40px 20px',
            borderRadius: 12,
            border: '1px dashed rgba(255,255,255,0.1)',
            color: 'var(--muted)',
          }}>
            No campaigns created. Click the button above to launch your first public fundraising campaign page.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {campaigns.map((c) => {
              const pathUrl = `/campaigns/${c.slug}`;
              return (
                <div
                  key={c.id}
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <h4 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{c.title}</h4>
                      <span style={{
                        fontSize: 10,
                        padding: '2px 6px',
                        borderRadius: 4,
                        background: c.status === 'LIVE' ? 'rgba(92,200,255,0.2)' : 'rgba(255,255,255,0.1)',
                        color: c.status === 'LIVE' ? 'rgba(92,200,255,1)' : 'var(--muted)',
                        fontWeight: 600,
                      }}>
                        {c.status}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                      Slug: <b>{c.slug}</b> • Goal: <b>{c.goalAmount ? `$${parseFloat(c.goalAmount).toLocaleString()}` : 'None'}</b>
                    </div>
                    {c.status === 'LIVE' && (
                      <div style={{ fontSize: 12, color: 'var(--accent)', marginTop: 8 }}>
                        Public Link:{' '}
                        <a href={pathUrl} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>
                          {window.location.origin}{pathUrl}
                        </a>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button className="pill" onClick={() => openEditModal(c)}>
                      Edit Details
                    </button>
                    {c.status === 'LIVE' ? (
                      <button className="pill" onClick={() => handleArchive(c)}>
                        Archive
                      </button>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                        <button
                          className="pill pillPrimary"
                          onClick={() => handlePublish(c)}
                          disabled={!stripeReady}
                          style={{ opacity: stripeReady ? 1 : 0.5 }}
                        >
                          Publish Live
                        </button>
                        {!stripeReady && (
                          <span style={{ fontSize: 10, color: 'var(--danger)', marginTop: 4 }}>
                            Requires Stripe Connect
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Campaign Create/Edit Modal */}
      {showCampaignModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="panel panelPad" style={{ width: '500px', background: '#0b0f17' }}>
            <h3 style={{ margin: 0, marginBottom: 16 }}>{editingCampaign ? 'Edit Campaign Info' : 'Create Campaign'}</h3>
            <form onSubmit={handleSaveCampaign} className="form">
              <div className="field">
                <label className="label">Campaign Name</label>
                <input
                  type="text"
                  className="input"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (!editingCampaign) {
                      setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
                    }
                  }}
                  required
                />
              </div>

              <div className="field">
                <label className="label">Public Slug</label>
                <input
                  type="text"
                  className="input"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, ''))}
                  required
                  placeholder="e.g. summer-drive-2026"
                />
              </div>

              <div className="field">
                <label className="label">Goal Amount (USD, Optional)</label>
                <input
                  type="number"
                  step="1"
                  className="input"
                  value={goalAmount}
                  onChange={(e) => setGoalAmount(e.target.value)}
                />
              </div>

              <div className="field">
                <label className="label">Campaign Description</label>
                <textarea
                  className="input"
                  style={{ minHeight: 100, fontFamily: 'inherit' }}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24 }}>
                <button type="button" className="pill" onClick={() => setShowCampaignModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="pill pillPrimary">
                  Save Campaign
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
