import { requireAuthOrRedirect } from '@/lib/auth/session';
import StripeConnectClient from './StripeConnectClient';

export default async function StripeConnectPage() {
  await requireAuthOrRedirect('/app/donors/stripe-connect');
  return <StripeConnectClient />;
}
