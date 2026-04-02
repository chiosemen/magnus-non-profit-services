import { requireAuthOrRedirect } from '@/lib/auth/session';
import ExecutiveClient from './ExecutiveClient';

export default async function ExecutivePage() {
  await requireAuthOrRedirect('/app/autonomous-ops/executive');
  return <ExecutiveClient />;
}

