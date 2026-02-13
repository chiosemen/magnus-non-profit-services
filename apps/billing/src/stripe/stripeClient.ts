import Stripe from 'stripe';

export function createStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, { apiVersion: '2024-06-20' as any });
}

