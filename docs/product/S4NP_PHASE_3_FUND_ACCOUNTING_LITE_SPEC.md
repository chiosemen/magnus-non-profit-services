# S4NP Phase 3: Fund Accounting Lite Specification

## 1. Product Objective
The objective of Fund Accounting Lite in Magnus Accord is to translate general contributions and restricted donations into trackable funds. By segregating balances into distinct restricted and unrestricted designations, nonprofits can satisfy legal compliance requirements, demonstrate programmatic accountability to major donors, and generate board-ready reports.

Fund Accounting Lite is not a complete ERP replacement; rather, it bridges the gap between payment processing (CRM/Stripe) and internal accountability.

---

## 2. Accounting Model
Magnus Accord employs a simplified double-entry bookkeeping model for fund accounting. Transactions represent transfer allocations and expenditures, recorded as balanced ledger debits and credits across assets, revenues, and expenses.

```
       [ Donation Received ]
                 │
                 ▼
       ┌───────────────────┐
       │   Asset Account   │ (Debit Increase)
       └───────────────────┘
                 │
                 ▼
     ┌───────────────────────┐
     │ Fund Allocation rules │ (Credit Revenue)
     └───────────────────────┘
        /                 \
       ▼                   ▼
┌──────────────┐     ┌──────────────┐
│ Restricted   │     │ Unrestricted │
│ Fund Ledger  │     │ Fund Ledger  │
└──────────────┘     └──────────────┘
```

---

## 3. Domain Models

### Fund
Represents a financial bucket with a specific purpose.
*   `id`: UUID
*   `orgId`: UUID (isolated per tenant)
*   `name`: String (e.g. "Disaster Relief 2026", "General Unrestricted Fund")
*   `code`: String (unique identifier per organization, e.g. "FD-101")
*   `description`: Text
*   `isRestricted`: Boolean (restricted gifts must remain restricted)
*   `createdAt` / `updatedAt`: DateTime

### Account (Chart of Accounts)
Represents the financial classifications.
*   `id`: UUID
*   `orgId`: UUID
*   `name`: String (e.g. "Cash", "Individual Donations", "Program Expenses")
*   `code`: String (unique identifier per organization, e.g. "1000", "4000", "5000")
*   `type`: Enum (`ASSET`, `REVENUE`, `EXPENSE`, `LIABILITY`, `EQUITY`)
*   `createdAt` / `updatedAt`: DateTime

### LedgerTransaction
Represents the transactional boundary.
*   `id`: UUID
*   `orgId`: UUID
*   `date`: DateTime (effective posting date)
*   `description`: String
*   `postedBy`: String (worker ID or "SYSTEM")
*   `approvedBy`: String? (worker ID, required for manual postings)
*   `createdAt`: DateTime

### LedgerEntry (Double-entry line item splits)
*   `id`: UUID
*   `transactionId`: UUID (belongs to `LedgerTransaction`)
*   `accountId`: UUID (belongs to `Account`)
*   `fundId`: UUID (belongs to `Fund`)
*   `debit`: Decimal (positive value representing debited amount)
*   `credit`: Decimal (positive value representing credited amount)
*   `createdAt`: DateTime

---

## 4. Posting Rules
1.  **Debit/Credit Parity**: Every posted ledger transaction must satisfy the formula:
    $$\sum \text{Debits} = \sum \text{Credits}$$
2.  **No Direct Deletions**: Once a ledger transaction is posted, it cannot be deleted or mutated. Corrections must be applied via reversing adjustment entries with explicit descriptions.
3.  **Account Type Behavior**:
    *   `ASSET` increases with Debits, decreases with Credits.
    *   `REVENUE` increases with Credits, decreases with Debits.
    *   `EXPENSE` increases with Debits, decreases with Credits.

---

## 5. Donation Allocation Flow
When a donation is received (manual or Stripe checkout):
1.  **Fund Mapping**: The donation creation event queries the mapped `Fund` based on the campaign settings.
2.  **Double-Entry Generation**:
    *   **Debit**: `ASSET` account (e.g., "Cash at Bank", code `1000`) for the gross amount, mapped to the campaign's `Fund`.
    *   **Credit**: `REVENUE` account (e.g., "Donations Revenue", code `4000`) for the net amount, mapped to the campaign's `Fund`.
    *   **Credit/Debit (if fees covered)**: If fees were charged, a separate entry registers the fee expense (Debit to `EXPENSE` "Merchant Fees", Credit to `ASSET`).
3.  **Approval State**: System-generated allocations from successful Stripe webhooks are posted automatically. Manual offline entries default to `PENDING_APPROVAL` and require dashboard approval.

---

## 6. Report Definitions

### Income & Expense Report (Statement of Activities)
Calculates revenues and expenses during a date range.
*   **Formula**:
    $$\text{Net Income} = \sum \text{Credits (Revenue)} - \sum \text{Debits (Expense)}$$
*   **Grouping**: Grouped by Fund code and Account type.

### Fund Balance Report
Calculates cumulative assets and equity balances.
*   **Formula**:
    $$\text{Fund Balance} = \sum \text{Debits} - \sum \text{Credits} \quad (\text{For Asset accounts belonging to the Fund})$$

---

## 7. Board Financial Summary Payload
A deterministic JSON format queryable by AI summaries or board packets:
```json
{
  "fiscalYear": 2026,
  "startDate": "2026-01-01T00:00:00Z",
  "endDate": "2026-05-31T23:59:59Z",
  "summary": {
    "totalRevenue": "125000.00",
    "totalExpense": "34200.00",
    "netOperatingSurplus": "90800.00"
  },
  "funds": [
    {
      "fundCode": "FD-101",
      "fundName": "Disaster Relief 2026",
      "isRestricted": true,
      "openingBalance": "15000.00",
      "revenue": "50000.00",
      "expense": "12000.00",
      "closingBalance": "53000.00"
    }
  ]
}
```

---

## 8. Human Approval Rules
*   **AI Exclusions**: Artificial intelligence or autonomous agents can propose ledger entries, but they *cannot* post them directly.
*   **Validation Check**: Proposing updates creates a `PENDING` transaction. A licensed human worker must execute the `POST /api/org/accounting/transactions/:id/approve` action.

---

## 9. Security Risks
1.  **Cross-Tenant Leakage**: Multiple organizations must never see or post to other organizations' ledger lists. Every query must enforce `where: { orgId }`.
2.  **Imbalance Postings**: API endpoints must validate that debits equal credits before writing transaction blocks to the DB.

---

## 10. Test Plan
*   **Unit Tests**: Verify that debit/credit balance checks correctly throw validation errors for mismatched splits.
*   **Integration Tests**: Verify that posting a donation correctly increments the cash asset and donation revenue balances.
*   **Isolation Tests**: Ensure Org A cannot view Org B's ledger details.

---

## 11. Definition of Done
*   Prisma schema definitions for `Fund`, `Account`, `LedgerTransaction`, and `LedgerEntry` are generated.
*   Deterministic reporting utility methods are written and verified by unit tests.
*   REST endpoints for chart of accounts, manual transactions, and approvals are isolated under `jwtAuth`.
*   Monorepo builds and tests execute with 100% success.

---

## 12. Known Limitations
*   No multi-currency conversions (all amounts default to base currency, i.e., USD).
*   Does not interface directly with external bank reconciliation software.
