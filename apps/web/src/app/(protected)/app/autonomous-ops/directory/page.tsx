import { requireAuthOrRedirect } from '@/lib/auth/session';
import DirectoryClient from './DirectoryClient';

export default async function DirectoryPage() {
  await requireAuthOrRedirect('/app/autonomous-ops/directory');
  return <DirectoryClient />;
}
