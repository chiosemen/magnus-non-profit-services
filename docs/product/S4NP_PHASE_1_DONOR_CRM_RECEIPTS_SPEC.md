# Phase 1: Donor CRM + Receipts Specification

## 1. Product Objective
The S4NP Donor CRM + Receipts module introduces a secure, audit-compliant contact directory and donation ledger for nonprofit organizations. It serves as the foundation for recording donor relationships, logging historical check/wire contributions, and automatically generating immutable, tax-exempt receipt records.

---

## 2. User Stories
*   **As a Staff Member**, I want to view a list of all donor profiles in my organization so that I can manage donor relationships and search for contact information.
*   **As a Staff Member**, I want to manually record off-platform checks, wire transfers, and cash gifts into the ledger, linking them to an existing donor profile.
*   **As a Staff Member**, I want to import a CSV list of legacy donors and their corresponding contact info, with validation checks to catch formatting errors or duplicates.
*   **As a Staff Member**, I want to trigger the creation of a tax receipt for a recorded donation so that we remain compliant with IRS tax deduction requirements.
*   **As an Organization Auditor**, I want to see an audit trail of all generated receipts, ensuring receipt numbers are sequential, non-repeatable, and cannot be deleted from the database.

---

## 3. Non-Goals
*   No live card processing, payment gateways, or Stripe Connect setups in this phase.
*   No donor-facing portal or public checkout pages.
*   No advanced accounting ledgers, double-entry bookkeeping, or restricted fund allocation logic.
*   No automated marketing emails, newsletters, or donor messaging channels.

---

## 4. Data Model Proposal
The following models will be appended to [`packages/db/prisma/schema.prisma`](file:///Users/chinyeosemene/Code/magnus-local/packages/db/prisma/schema.prisma):

```prisma
model DonorProfile {
  id          String     @id @default(uuid()) @db.Uuid
  orgId       String     @db.Uuid
  firstName   String     @db.VarChar(128)
  lastName    String     @db.VarChar(128)
  email       String     @db.VarChar(256)
  phone       String?    @db.VarChar(64)
  addressJson String?    @db.Text // Encrypted PII JSON (street, city, state, zip, country)
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
  donations   Donation[]

  organization Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)

  @@unique([orgId, email])
  @@index([orgId])
}

model Donation {
  id              String        @id @default(uuid()) @db.Uuid
  orgId           String        @db.Uuid
  donorId         String        @db.Uuid
  amount          Decimal       @db.Decimal(12, 2)
  currency        String        @default("USD") @db.VarChar(8)
  receivedAt      DateTime
  paymentMethod   String        @db.VarChar(64) // MANUAL_CHECK, WIRE_TRANSFER, CASH, OTHER
  referenceNumber String?       @db.VarChar(128) // e.g. check or transaction ID
  notes           String?       @db.Text
  status          String        @default("COMPLETED") @db.VarChar(32) // COMPLETED, VOIDED
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  donorProfile    DonorProfile  @relation(fields: [donorId], references: [id])
  receipt         Receipt?

  @@index([orgId, receivedAt])
  @@index([donorId])
}

model Receipt {
  id             String    @id @default(uuid()) @db.Uuid
  donationId     String    @unique @db.Uuid
  receiptNumber  String    @unique @db.VarChar(64) // Structured format: REC-YYYYMMDD-XXXX
  generatedAt    DateTime  @default(now())
  emailedAt      DateTime?
  pdfStoragePath String?   @db.VarChar(1024)
  createdAt      DateTime  @default(now())

  donation       Donation  @relation(fields: [donationId], references: [id], onDelete: Restrict) // Deny deletion of donation if receipt exists
}
```

---

## 5. API Endpoints Proposal
All endpoints are registered on the dashboard Express service under [`apps/org-dashboard-api`](file:///Users/chinyeosemene/Code/magnus-local/apps/org-dashboard-api) and require a valid JWT token representing the context of a staff user.

*   `GET /api/org/donors`
    *   Returns paginated, tenant-restricted lists of donor profiles.
*   `POST /api/org/donors`
    *   Creates a single donor profile. Validates firstName, lastName, and email format.
*   `POST /api/org/donors/import`
    *   Uploads and parses a CSV list of donor profiles (up to 5MB, max 1000 rows).
*   `GET /api/org/donations`
    *   Lists logged donations, with filters for start/end date and donor ID.
*   `POST /api/org/donations/manual`
    *   Logs a new offline donation. Creates a ledger record.
*   `POST /api/org/donations/:id/receipt`
    *   Generates a sequential tax receipt for the donation if it does not already exist.

---

## 6. Web Route Proposal
Added under the protected app route layouts in [`apps/web/src/app/(protected)/app`](file:///Users/chinyeosemene/Code/magnus-local/apps/web/src/app/\(protected\)/app):

*   `/app/crm`
    *   A searchable datatable showing all donor profiles belonging to the logged-in organization.
    *   Buttons to add manual donors or import CSV donor registers.
*   `/app/donations`
    *   A table showing historical contributions and manual ledger receipts.
    *   A side-drawer containing fields for manual check inputs: Amount, Received Date, payment method, and Donor Association.

---

## 7. Receipt Numbering Rules
To maintain audit integrity and comply with international accounting standards, receipts must have unique, sequential, and deterministic identifier codes:
*   **Format**: `REC-YYYYMMDD-[SEQUENCE_HEX]`
    *   `REC-`: Prefix denoting a tax receipt.
    *   `YYYYMMDD`: The UTC date of generation.
    *   `[SEQUENCE_HEX]`: A 6-character uppercase hex sequence, representing a monotonic sequence incremented inside the transaction boundary or generated using atomic DB locks, e.g., `REC-20260527-0000A1`.
*   **Immutable Rule**: Once generated, a receipt cannot be edited or deleted. If a donation is voided, the receipt status is marked as `VOIDED` with an attached reason, but the receipt database row remains for audits.

---

## 8. CSV Import Flow
1.  **Selection**: The user selects a local `.csv` file in the browser.
2.  **Frontend Validation**: The web client verifies the file size is below 5MB.
3.  **Transmission**: Uploaded as a multipart form payload to `/api/org/donors/import`.
4.  **Backend Ingestion & Parsing**:
    *   Parses CSV headers, requiring: `first_name`, `last_name`, `email`, and optionally `phone`.
    *   Validates all rows up to a maximum limit of 1,000 entries.
    *   Rejects the request if formula patterns (`=`, `+`, `-`, `@`) are detected in cell values (preventing CSV injection).
5.  **Transaction Execution**: Appends rows inside a single database transaction. If any row fails validation or contains syntax errors, the entire batch aborts (fail-closed).

---

## 9. Security Risks and Mitigations
*   **Cross-Tenant Leakage**:
    *   *Mitigation*: Every query in the database layer must enforce `where: { orgId }`, extracting the ID dynamically from the validated JWT payload.
*   **PII Exposure**:
    *   *Mitigation*: Address fields inside `addressJson` must be encrypted using the security package's cipher functions before being written to Postgres.
*   **Receipt Alteration**:
    *   *Mitigation*: The `Receipt` table has a Prisma schema constraint of `onDelete: Restrict` on the relation to `Donation`. Deleting a donation that has a receipt is blocked at the database engine level.

---

## 10. Test Plan
Every component must execute and pass verification checks inside [`packages/db/src/tests`](file:///Users/chinyeosemene/Code/magnus-local/packages/db/src/tests) and [`apps/org-dashboard-api/__tests__`](file:///Users/chinyeosemene/Code/magnus-local/apps/org-dashboard-api/__tests__):

*   **Unit Tests (`node --test`)**:
    *   Confirm CSV parser functions catch malformed emails and sanitise formula characters.
    *   Assert that the receipt generator outputs valid sequential codes.
*   **Integration Tests**:
    *   Verify that executing `appendDonorEvent` or `appendManualDonation` checks JWT contexts and returns proper database records.
    *   Confirm that a user logged into Org A cannot query or fetch records belonging to Org B.

---

## 11. Definition of Done
1.  All database migrations run clean and match verify gates (`pnpm --filter @magnus/db verify:schema`).
2.  All backend services pass compilation checking (`pnpm build`).
3.  All Express endpoint tests run successfully and return status code 200/201.
4.  Documentation is updated, and formatting aligns with standard rules.

---

## 12. Rollback Plan
If production deployment encounters performance blockages or errors:
1.  **API Reversion**: Roll back `org-dashboard-api` deployment to the previous docker image.
2.  **DB Schema Reversion**: If migrations were applied, execute the corresponding Prisma down migration scripts or restore the pre-deployment database snapshot.
