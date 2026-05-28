'use client';

import { useEffect, useMemo, useState } from 'react';
import styles from './CampaignsClient.module.css';

type CampaignStatus = 'DRAFT' | 'LIVE' | 'ARCHIVED';

type Campaign = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  status: CampaignStatus;
  goalAmount: string | null;
  currency: string;
  startsAt: string | null;
  endsAt: string | null;
  publishedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type StripeStatus = {
  onboardingStatus: 'NOT_STARTED' | 'LINK_CREATED' | 'IN_PROGRESS' | 'ENABLED' | 'RESTRICTED' | null;
};

function statusBadge(status: CampaignStatus): { label: string; className: string } {
  if (status === 'LIVE') return { label: 'Live', className: styles.live };
  if (status === 'ARCHIVED') return { label: 'Archived', className: styles.archived };
  return { label: 'Draft', className: styles.draft };
}

function publishBlockedReason(connectStatus: StripeStatus['onboardingStatus']): string | null {
  if (connectStatus === 'ENABLED') return null;
  return 'Publishing is blocked until Stripe Connect status is ENABLED.';
}

export default function CampaignsClient() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [connectStatus, setConnectStatus] = useState<StripeStatus['onboardingStatus']>(null);

  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [goalAmount, setGoalAmount] = useState('');
  const [currency, setCurrency] = useState('USD');

  const selected = useMemo(
    () => campaigns.find(c => c.id === selectedId) ?? null,
    [campaigns, selectedId],
  );

  const publishBlock = publishBlockedReason(connectStatus);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [campaignRes, stripeRes] = await Promise.all([
        fetch('/api/org/campaigns', { cache: 'no-store' }),
        fetch('/api/org/stripe-connect/status', { cache: 'no-store' }),
      ]);

      if (!campaignRes.ok) throw new Error('CAMPAIGNS_FETCH_FAILED');
      if (!stripeRes.ok) throw new Error('STRIPE_CONNECT_STATUS_FETCH_FAILED');

      const campaignJson = (await campaignRes.json()) as { campaigns: Campaign[] };
      const stripeJson = (await stripeRes.json()) as { status: StripeStatus };

      setCampaigns(campaignJson.campaigns ?? []);
      setConnectStatus(stripeJson.status?.onboardingStatus ?? null);
      if (!selectedId && campaignJson.campaigns?.length) {
        setSelectedId(campaignJson.campaigns[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'CAMPAIGNS_FETCH_FAILED');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function createCampaign(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/org/campaigns', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title,
          slug: slug || undefined,
          description: description || undefined,
          goalAmount: goalAmount ? Number(goalAmount) : undefined,
          currency,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || 'CAMPAIGN_CREATE_FAILED');
      }
      const json = (await res.json()) as { campaign: Campaign };
      setCampaigns(prev => [json.campaign, ...prev]);
      setSelectedId(json.campaign.id);
      setTitle('');
      setSlug('');
      setDescription('');
      setGoalAmount('');
      setCurrency('USD');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'CAMPAIGN_CREATE_FAILED');
    } finally {
      setSaving(false);
    }
  }

  async function saveCampaignEdits(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/org/campaigns/${selected.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: selected.title,
          slug: selected.slug,
          description: selected.description,
          goalAmount: selected.goalAmount ? Number(selected.goalAmount) : null,
          currency: selected.currency,
        }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || 'CAMPAIGN_UPDATE_FAILED');
      }

      const json = (await res.json()) as { campaign: Campaign };
      setCampaigns(prev => prev.map(item => (item.id === json.campaign.id ? json.campaign : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'CAMPAIGN_UPDATE_FAILED');
    } finally {
      setSaving(false);
    }
  }

  async function transitionCampaign(id: string, action: 'publish' | 'archive') {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/org/campaigns/${id}/${action}`, { method: 'POST' });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || 'CAMPAIGN_TRANSITION_FAILED');
      }
      const json = (await res.json()) as { campaign: Campaign };
      setCampaigns(prev => prev.map(item => (item.id === json.campaign.id ? json.campaign : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'CAMPAIGN_TRANSITION_FAILED');
    } finally {
      setSaving(false);
    }
  }

  function updateSelectedField(field: keyof Campaign, value: string | null) {
    if (!selected) return;
    setCampaigns(prev =>
      prev.map(item => (item.id === selected.id ? { ...item, [field]: value } : item)),
    );
  }

  return (
    <div className="panel panelPad">
      <h1 className={`h1 ${styles.title}`}>Campaign Admin</h1>
      <p className={`subhead ${styles.subtitle}`}>
        Manage organization-scoped campaigns. This phase includes campaign admin only and does not include public checkout.
      </p>

      {error ? <div className={`error ${styles.error}`}>{error}</div> : null}

      {loading ? <div className="panel panelPad">Loading campaigns…</div> : null}

      {!loading && campaigns.length === 0 ? (
        <div className={`panel panelPad ${styles.emptyState}`}>
          No campaigns yet. Create your first draft campaign below.
        </div>
      ) : null}

      {!loading ? (
        <div className={styles.grid}>
          <section className="card">
            <div className="cardTitle">Campaign list</div>
            <ul className={styles.list}>
              {campaigns.map(campaign => {
                const badge = statusBadge(campaign.status);
                return (
                  <li key={campaign.id}>
                    <button
                      className={campaign.id === selectedId ? styles.itemActive : styles.item}
                      type="button"
                      onClick={() => setSelectedId(campaign.id)}
                    >
                      <span className={styles.itemTitle}>{campaign.title}</span>
                      <span className={`${styles.badge} ${badge.className}`}>{badge.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="card">
            <div className="cardTitle">Create campaign</div>
            <form className={styles.form} onSubmit={createCampaign}>
              <label className={styles.label}>Title</label>
              <input className={styles.input} value={title} onChange={e => setTitle(e.target.value)} required />

              <label className={styles.label}>Slug (optional)</label>
              <input className={styles.input} value={slug} onChange={e => setSlug(e.target.value)} placeholder="community-drive-2026" />

              <label className={styles.label}>Description</label>
              <textarea className={styles.textarea} value={description} onChange={e => setDescription(e.target.value)} rows={4} />

              <label className={styles.label}>Goal amount</label>
              <input className={styles.input} type="number" min="0" step="0.01" value={goalAmount} onChange={e => setGoalAmount(e.target.value)} />

              <label className={styles.label}>Currency</label>
              <input className={styles.input} value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())} maxLength={8} />

              <button className="pill" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Create draft'}</button>
            </form>
          </section>

          <section className="card">
            <div className="cardTitle">Selected campaign</div>
            {!selected ? (
              <p className="cardBody">Select a campaign to edit or transition.</p>
            ) : (
              <form className={styles.form} onSubmit={saveCampaignEdits}>
                <label className={styles.label}>Title</label>
                <input
                  className={styles.input}
                  value={selected.title}
                  onChange={e => updateSelectedField('title', e.target.value)}
                />

                <label className={styles.label}>Slug</label>
                <input
                  className={styles.input}
                  value={selected.slug}
                  onChange={e => updateSelectedField('slug', e.target.value)}
                />

                <label className={styles.label}>Description</label>
                <textarea
                  className={styles.textarea}
                  rows={4}
                  value={selected.description ?? ''}
                  onChange={e => updateSelectedField('description', e.target.value)}
                />

                <label className={styles.label}>Goal amount</label>
                <input
                  className={styles.input}
                  type="number"
                  min="0"
                  step="0.01"
                  value={selected.goalAmount ?? ''}
                  onChange={e => updateSelectedField('goalAmount', e.target.value || null)}
                />

                <label className={styles.label}>Currency</label>
                <input
                  className={styles.input}
                  maxLength={8}
                  value={selected.currency}
                  onChange={e => updateSelectedField('currency', e.target.value.toUpperCase())}
                />

                <div className={styles.statusRow}>
                  <span className={styles.metaLabel}>Status:</span> <strong>{selected.status}</strong>
                </div>

                <div className={styles.actions}>
                  <button className="pill" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save edits'}</button>
                  <button
                    className="pill"
                    type="button"
                    disabled={saving || selected.status === 'LIVE' || Boolean(publishBlock)}
                    onClick={() => transitionCampaign(selected.id, 'publish')}
                    title={publishBlock ?? 'Publish campaign'}
                  >
                    Publish
                  </button>
                  <button
                    className="pill"
                    type="button"
                    disabled={saving || selected.status === 'ARCHIVED'}
                    onClick={() => transitionCampaign(selected.id, 'archive')}
                  >
                    Archive
                  </button>
                </div>

                {publishBlock ? <div className={styles.blocked}>{publishBlock}</div> : null}
              </form>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
