import { requireAuthOrRedirect } from '@/lib/auth/session';
import RulesClient from './RulesClient';

export default async function RulesPage() {
  await requireAuthOrRedirect('/app/autonomous-ops/rules');
  return <RulesClient />;
}
