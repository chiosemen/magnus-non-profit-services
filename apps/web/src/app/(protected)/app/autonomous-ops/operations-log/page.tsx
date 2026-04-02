import { requireAuthOrRedirect } from '@/lib/auth/session';
import OperationsLogClient from './OperationsLogClient';

export default async function OperationsLogPage() {
  await requireAuthOrRedirect('/app/autonomous-ops/operations-log');
  return <OperationsLogClient />;
}

