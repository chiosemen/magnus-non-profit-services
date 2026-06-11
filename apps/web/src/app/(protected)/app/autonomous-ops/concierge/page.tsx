import { requireAuthOrRedirect } from '@/lib/auth/session';
import ConciergeClient from './ConciergeClient';

export default async function ConciergePage() {
  await requireAuthOrRedirect('/app/autonomous-ops/concierge');
  return <ConciergeClient />;
}
