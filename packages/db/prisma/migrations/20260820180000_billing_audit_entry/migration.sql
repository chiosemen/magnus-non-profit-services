-- BillingAuditEntry: append-only entitlement audit for manual PayPal / Payment Link activation.
-- Additive only. onDelete Restrict so orgs with audit history cannot be hard-deleted casually.

CREATE TABLE "BillingAuditEntry" (
    "id" UUID NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "dealId" TEXT NOT NULL,
    "orgId" UUID NOT NULL,
    "action" VARCHAR(32) NOT NULL,
    "tier" "SubscriptionTier" NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" VARCHAR(8) NOT NULL,
    "paymentMethod" VARCHAR(64) NOT NULL,
    "paymentReference" VARCHAR(512) NOT NULL,
    "operator" VARCHAR(256) NOT NULL,
    "orgName" TEXT NOT NULL,
    "prevHash" VARCHAR(64),
    "entryHash" VARCHAR(64) NOT NULL,
    "sealed" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingAuditEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BillingAuditEntry_dealId_key" ON "BillingAuditEntry"("dealId");
CREATE INDEX "BillingAuditEntry_orgId_createdAt_idx" ON "BillingAuditEntry"("orgId", "createdAt");
CREATE INDEX "BillingAuditEntry_seq_idx" ON "BillingAuditEntry"("seq");

ALTER TABLE "BillingAuditEntry"
  ADD CONSTRAINT "BillingAuditEntry_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reject mutation of sealed audit rows (append-only).
CREATE OR REPLACE FUNCTION magnus_billing_audit_forbid_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'BillingAuditEntry is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER billing_audit_entry_no_update
  BEFORE UPDATE ON "BillingAuditEntry"
  FOR EACH ROW
  EXECUTE PROCEDURE magnus_billing_audit_forbid_mutation();

CREATE TRIGGER billing_audit_entry_no_delete
  BEFORE DELETE ON "BillingAuditEntry"
  FOR EACH ROW
  EXECUTE PROCEDURE magnus_billing_audit_forbid_mutation();
