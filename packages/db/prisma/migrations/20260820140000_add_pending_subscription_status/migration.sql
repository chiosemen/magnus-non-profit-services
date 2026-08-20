-- P0-7 (step 1 of 2): add the PENDING enum value.
--
-- This MUST be its own migration. PostgreSQL refuses to use a newly added enum
-- value inside the same transaction that added it ("unsafe use of new value of
-- enum type"), and Prisma runs each migration in a transaction. Step 2 sets the
-- column default to PENDING in a later, separate transaction.
--
-- Additive only: this statement creates, it does not remove or rename.
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'PENDING';
