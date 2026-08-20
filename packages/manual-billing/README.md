# Operator manual billing (PayPal / Stripe Payment Link)

D1–D4 launch path: operator creates PENDING orgs, verifies payment, then activates
with an append-only hash-chained audit row in the same transaction.

## Commands

```bash
# Create PENDING org (no entitlement)
pnpm --filter @magnus/manual-billing exec node ./bin/create-org.mjs \
  --name "Helping Hands NPO" --ein "12-3456789" --tier STARTER

# Activate after cleared PayPal / Stripe Payment Link payment
pnpm --filter @magnus/manual-billing exec node ./bin/activate-org.mjs \
  --orgId <uuid> --tier STARTER --dealId MA-2026-001 \
  --amountMinor 250000 --currency USD \
  --paymentMethod paypal --paymentReference PAYPAL-TXN \
  --operator you@example.com
```

`DATABASE_URL` must be exported in the operator shell. Never pass secrets on argv.

## Holds

- `--tier GROWTH` is refused until `docs/releases/p0-staging-verified.md` exists (D2).
- `zelle` is not an allowed `paymentMethod` (D3).

## Tests

```bash
pnpm --filter @magnus/manual-billing test
```
