'use client';

import { useEffect, useMemo, useState } from 'react';
import styles from './StripeConnectClient.module.css';

type StripeConnectStatus = {
  orgId: string;
  connected: boolean;
  paymentsEnabled: boolean;
  stripeAccountId: string | null;
  onboardingStatus: 'NOT_STARTED' | 'LINK_CREATED' | 'IN_PROGRESS' | 'ENABLED' | 'RESTRICTED' | null;
  detailsSubmitted: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  requirementsCurrentlyDue: string[];
  requirementsEventuallyDue: string[];
  disabledReason: string | null;
  country: string | null;
  defaultCurrency: string | null;
  onboardingLinkLastCreatedAt: string | null;
  onboardingLinkExpiresAt: string | null;
};

type LinkResult = {
  onboardingUrl: string;
  onboardingStatus: StripeConnectStatus['onboardingStatus'];
  stripeAccountId: string | null;
};

function badge(status: StripeConnectStatus['onboardingStatus']): { label: string; color: string } {
  switch (status) {
    case 'ENABLED':
      return { label: 'Enabled', color: styles.badgeEnabled };
    case 'RESTRICTED':
      return { label: 'Restricted', color: styles.badgeRestricted };
    case 'IN_PROGRESS':
      return { label: 'In progress', color: styles.badgeInProgress };
    case 'LINK_CREATED':
      return { label: 'Onboarding link created', color: styles.badgeLinkCreated };
    case 'NOT_STARTED':
      return { label: 'Not connected', color: styles.badgeNotConnected };
    default:
      return { label: 'Not connected', color: styles.badgeNotConnected };
  }
}

export default function StripeConnectClient() {
  const [status, setStatus] = useState<StripeConnectStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stateParam = useMemo(() => {
    if (typeof window === 'undefined') return null;
    const url = new URL(window.location.href);
    return url.searchParams.get('state');
  }, []);

  async function loadStatus() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/org/stripe-connect/status', { cache: 'no-store' });
      if (!res.ok) throw new Error('STRIPE_CONNECT_STATUS_FETCH_FAILED');
      const json = (await res.json()) as { status: StripeConnectStatus };
      setStatus(json.status);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'STRIPE_CONNECT_STATUS_FETCH_FAILED');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStatus();
  }, []);

  useEffect(() => {
    if (!stateParam) return;
    // Return/refresh land on this page; immediately fetch latest status.
    loadStatus();
  }, [stateParam]);

  async function createOrRefresh(type: 'create' | 'refresh') {
    setBusy(true);
    setError(null);
    try {
      const path =
        type === 'create'
          ? '/api/org/stripe-connect/onboarding-link'
          : '/api/org/stripe-connect/onboarding-link/refresh';

      const res = await fetch(path, { method: 'POST' });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || 'STRIPE_CONNECT_ONBOARDING_LINK_FAILED');
      }

      const json = (await res.json()) as { onboarding: LinkResult };
      if (!json.onboarding.onboardingUrl) throw new Error('STRIPE_CONNECT_ONBOARDING_URL_MISSING');
      window.location.href = json.onboarding.onboardingUrl;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'STRIPE_CONNECT_ONBOARDING_LINK_FAILED');
      await loadStatus();
    } finally {
      setBusy(false);
    }
  }

  const currentBadge = badge(status?.onboardingStatus ?? null);

  return (
    <div className="panel panelPad">
      <h1 className={`h1 ${styles.title}`}>
        Stripe Connect
      </h1>
      <p className={`subhead ${styles.subtitle}`}>
        Foundation onboarding for org-scoped Stripe Connect account status. This page does not create checkout sessions or donations.
      </p>

      {status && !status.paymentsEnabled ? (
        <div className={`card ${styles.errorBox}`}>
          Payments are not enabled in this private pilot. Use your existing donation processor while Magnus Accord tracks campaign readiness. Stripe Connect verification pending.
        </div>
      ) : null}

      {error ? <div className={`error ${styles.errorBox}`}>{error}</div> : null}

      {loading || !status ? (
        <div className="panel panelPad">Loading Stripe Connect status…</div>
      ) : (
        <div className="cards">
          <div className="card">
            <div className={`cardTitle ${styles.statusTitle}`}>
              <span>Connection status</span>
              <span className={`${styles.badge} ${currentBadge.color}`}>
                {currentBadge.label}
              </span>
            </div>
            <p className="cardBody"><b>Stripe account ID:</b> {status.stripeAccountId ?? '—'}</p>
            <p className="cardBody"><b>Details submitted:</b> {status.detailsSubmitted ? 'Yes' : 'No'}</p>
            <p className="cardBody"><b>Charges enabled:</b> {status.chargesEnabled ? 'Yes' : 'No'}</p>
            <p className="cardBody"><b>Payouts enabled:</b> {status.payoutsEnabled ? 'Yes' : 'No'}</p>
            <p className="cardBody"><b>Country:</b> {status.country ?? '—'}</p>
            <p className="cardBody"><b>Default currency:</b> {status.defaultCurrency ?? '—'}</p>
            <p className="cardBody"><b>Disabled reason:</b> {status.disabledReason ?? '—'}</p>
          </div>

          <div className="card">
            <div className="cardTitle">Onboarding requirements</div>
            <p className="cardBody"><b>Currently due:</b> {status.requirementsCurrentlyDue.length ? status.requirementsCurrentlyDue.join(', ') : 'None'}</p>
            <p className="cardBody"><b>Eventually due:</b> {status.requirementsEventuallyDue.length ? status.requirementsEventuallyDue.join(', ') : 'None'}</p>
            <p className="cardBody"><b>Last link created:</b> {status.onboardingLinkLastCreatedAt ?? '—'}</p>
            <p className="cardBody"><b>Link expires at:</b> {status.onboardingLinkExpiresAt ?? '—'}</p>
          </div>

          <div className="card">
            <div className="cardTitle">Actions</div>
            <p className="cardBody">Use onboarding to connect Stripe for this org. No donation or checkout flow is enabled in this phase.</p>
            <div className={styles.actions}>
              <button className="pill" type="button" disabled={busy} onClick={() => createOrRefresh('create')}>
                {busy ? 'Working…' : 'Create onboarding link'}
              </button>
              <button className="pill" type="button" disabled={busy} onClick={() => createOrRefresh('refresh')}>
                {busy ? 'Working…' : 'Refresh onboarding link'}
              </button>
              <button className="pill" type="button" disabled={busy} onClick={() => loadStatus()}>
                Refresh status
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
