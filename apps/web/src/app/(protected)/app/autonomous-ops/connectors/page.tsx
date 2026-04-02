import { requireAuthOrRedirect } from '@/lib/auth/session';
import ConnectorsClient from './ConnectorsClient';

export default async function ConnectorsPage() {
  await requireAuthOrRedirect('/app/autonomous-ops/connectors');
  return <ConnectorsClient />;
}
