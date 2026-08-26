'use client';

import { useParams, useRouter } from 'next/navigation';

export default function CampaignCancelPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  return (
    <div className="section" style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="panel panelPad" style={{ maxWidth: 480, textAlign: 'center', border: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: 'rgba(255,92,92,0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 20px auto',
          color: 'var(--danger)',
          fontSize: 32,
          fontWeight: 'bold',
        }}>
          ✕
        </div>
        <h2 style={{ fontSize: 28, marginBottom: 12 }}>Checkout Cancelled</h2>
        <p className="cardBody" style={{ fontSize: 15, color: 'var(--muted)', marginBottom: 24 }}>
          The donation process was cancelled. No charges were made to your card. Feel free to resume or adjust your contribution at any time.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button className="pill pillPrimary" onClick={() => router.push(`/campaigns/${slug}`)}>
            Return to Campaign
          </button>
          <button className="pill" onClick={() => router.push('/')}>
            Back to Home
          </button>
        </div>
      </div>
    </div>
  );
}
