import { requireAuthOrRedirect } from '@/lib/auth/session';
import ReadinessClient from './ReadinessClient';

export default async function PilotReadinessPage() {
  await requireAuthOrRedirect('/app/autonomous-ops/readiness');
  return <ReadinessClient />;
}
