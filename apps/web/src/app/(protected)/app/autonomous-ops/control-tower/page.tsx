import { requireAuthOrRedirect } from '@/lib/auth/session';
import ControlTowerClient from './ControlTowerClient';

export default async function ControlTowerPage() {
  await requireAuthOrRedirect('/app/autonomous-ops/control-tower');
  return <ControlTowerClient />;
}
