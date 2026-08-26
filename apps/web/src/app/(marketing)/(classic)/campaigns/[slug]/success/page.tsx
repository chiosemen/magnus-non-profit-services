'use client';

import { useParams, useRouter } from 'next/navigation';

export default function CampaignSuccessPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  return (
    <div className="section" style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="panel panelPad" style={{ maxWidth: 500, textAlign: 'center', border: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: 'rgba(92,255,160,0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 20px auto',
          color: 'var(--accent)',
          fontSize: 32,
          fontWeight: 'bold',
        }}>
          ✓
        </div>
        <h2 style={{ fontSize: 28, marginBottom: 12 }}>Thank You for Your Gift!</h2>
        <p className="cardBody" style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--muted)', marginBottom: 24 }}>
          Your payment authorization was completed successfully. Please note that the final tax receipt will be sent to your email as soon as the merchant gateway broadcasts the finalized settlement confirmation. This usually takes just a few seconds.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button className="pill pillPrimary" onClick={() => router.push(`/campaigns/${slug}`)}>
            Back to Campaign
          </button>
          <button className="pill" onClick={() => router.push('/')}>
            Go Home
          </button>
        </div>
      </div>
    </div>
  );
}
