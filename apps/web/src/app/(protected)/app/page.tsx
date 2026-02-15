import { requireAuthOrRedirect } from '@/lib/auth/session';
import DashboardClient from './DashboardClient';

/**
 * Server component — enforces session-state + org membership before rendering.
 *
 * Uses requireAuthOrRedirect which enforces all four invariants:
 *   1. JWT signature + expiry
 *   2. DB session lookup — reject if revoked/expired/missing
 *   3. Cross-check JWT orgId against session-bound orgId (tamper detection)
 *   4. Org membership check — confirm worker still belongs to org
 *
 * Redirects to /login?next=/app on ANY failure (fail-closed).
 * NO database queries execute before validation completes.
 */
export default async function AppHomePage() {
  await requireAuthOrRedirect('/app');
  return <DashboardClient />;
}
