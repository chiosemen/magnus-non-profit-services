import { requireAuthOrRedirect } from '@/lib/auth/session';
import CampaignsClient from './CampaignsClient';

export default async function CampaignsPage() {
  await requireAuthOrRedirect('/app/donors/campaigns');
  return <CampaignsClient />;
}
