# Magnus Accord — RevOps Integration & Business Launch Plan

**Date:** 2026-08-20  
**Source brief:** `MAGNUS_ACCORD_RevOps` (complementary services + platform pricing)  
**Payment preference for launch:** **PayPal and/or Zelle manual transactions** (not Stripe Checkout for platform seats)  
**Goal:** Sell and deliver revenue **now**, convert clients onto Magnus Accord, keep product promises truthful

This plan integrates the RevOps services into Accord’s existing commercial model (`STARTER` / `GROWTH` / `ENTERPRISE` + Autonomous Ops packages) without blocking launch on automated billing.

---

## 1. Launch thesis

Do **not** wait for Stripe subscription automation to launch.

Launch as a **two-product business**:

1. **Fixed-scope professional services** (cash in 2–6 weeks) — primary launch revenue  
2. **Platform subscription** (monthly/annual) — activated **manually** after PayPal/Zelle clears

Services are the gateway; the platform is the retention and expansion engine. Every engagement must leave **structured org context** that Accord agents and surfaces can consume.

**Boundary rule (non-negotiable):** agents draft/monitor/flag/prepare; humans approve irreversible or external actions. Services reinforce that story; they never sell autonomous filing, grant submission, or money movement.

---

## 2. What the RevOps brief defines (inventory)

### 2.1 Professional services (productized)

| SKU code | Offer | Launch price (use mid/high of brief) | Duration | Role |
|----------|--------|--------------------------------------|----------|------|
| `SVC-CLARITY` | Funding & Ecosystem Clarity Package | **$2,200–$2,800** | 2.5–4 weeks | **Lead diagnostic / gateway** |
| `SVC-DAF` | DAF Readiness + Candid Seal Sprint | **$1,600–$2,200** | 2–3 weeks | Fast-win add-on |
| `SVC-BOARD` | Board Intelligence & Packet Setup | **$2,800–$3,800** | 3–5 weeks | Platform showcase (ORACLE) |
| `SVC-COMPLY` | Compliance Watchdog Configuration | **$1,900–$2,600** | 2–3.5 weeks | Trust / STEWARD |
| `SVC-MIGRATE` | Data Migration + AI Concierge Onboarding | **$3,500–$5,500+** | 3–6 weeks | Adoption critical path |
| `SVC-GRANT` | Grant Lifecycle & Intelligence Prep | **$2,200–$3,200** | 2.5–4 weeks | GROWTH→ENTERPRISE expansion |
| `SVC-RISK` | Sustainability & Concentration Risk Diagnostic | Price as mini-Clarity / board workshop | ~1–2 weeks | Board entry wedge |

**Launch catalog (keep small):** sell **Clarity** as the default entry; attach **DAF** as the most common add-on; hold Board/Compliance/Migrate/Grant for post-diagnostic proposals.

### 2.2 Platform tiers (from RevOps pricing language)

| Tier | List price (commercial intent) | Entitlements (must match code gates) |
|------|--------------------------------|--------------------------------------|
| `STARTER` | **$150/mo** (prefer annual: **$1,800/yr**) | `donor_crm`, `campaigns`, `compliance_calendar` — **no scheduled agents** |
| `GROWTH` | **$400/mo** (or **$4,800/yr**) | + Connect campaigns, fund accounting lite, AI Concierge, Assisted Ops agents (`ComplianceWatchdog`, `BoardIntelligenceOracle`) |
| `ENTERPRISE` | **Custom from $1,500/mo** | + FinancialSentinel, GrantLifecycleManager, GrantIntelligenceHerald; Claude Partner; higher allowances; Plaid/Candid as premium config |

Code source of truth for feature keys: `packages/subscription/src/policy.ts` and `autonomousOpsPolicy.ts`.

### 2.3 Explicitly defer for launch

- Stripe Checkout / `apps/billing` webhook sync for **platform seats** (keep for later automation)  
- Public MCP / worker-financial as sellable products  
- Plaid as a STARTER/GROWTH native entitlement (ENTERPRISE-only when ready)  
- SOLARIS, autonomous submission, money movement claims  

Stripe Connect for **donor campaigns** remains a product capability for GROWTH tenants; that is **client fundraising**, not Magnus collecting subscription revenue.

---

## 3. How services map into Accord (integration model)

Each service has three outputs: **client deliverable**, **platform seed data**, **upsell trigger**.

| Service | Platform touchpoints to seed | Target tier after delivery | Upsell trigger |
|---------|------------------------------|----------------------------|----------------|
| Clarity | Org context files (mission, funding narrative, concentration notes); curated memory; executive “what matters” inputs | STARTER or GROWTH | “Monitor this quarterly inside Accord” |
| DAF Sprint | Donor CRM readiness notes; website/Candid checklist stored as org context; optional donor tags | STARTER+ | Ongoing DAF tracking + campaigns |
| Board Setup | BoardIntelligenceOracle schedule + packet structure; first packets as internal artifacts | **GROWTH** (requires agents) | Retain GROWTH subscription |
| Compliance Config | Compliance calendar rows; alert thresholds; first Watchdog run reviewed | **GROWTH** | Retain GROWTH |
| Migration + Concierge | Donors/donations import; Concierge proposal queue training | **GROWTH** | Concierge monthly allowance |
| Grant Prep | Grant calendar; funder research workflow; Herald/Lifecycle readiness | **ENTERPRISE** | HQ Expansion |

**Tier alignment from the brief (keep):**

- STARTER path → Clarity + DAF  
- GROWTH path → Board + Compliance + Concierge onboarding  
- ENTERPRISE path → custom + grant intelligence depth  

---

## 4. Preferred payment: PayPal / Zelle manual (operating system)

### 4.1 Principle

**Payment confirmation is human; entitlement activation is operator-controlled in the database/admin path.** Do not invent fake “paid” status in the product without an auditable receipt.

### 4.2 Commercial objects (launch ops — spreadsheet or Notion first)

Track one row per deal:

| Field | Example |
|-------|---------|
| `deal_id` | `2026-08-MA-014` |
| `org_legal_name` / EIN | … |
| `sku(s)` | `SVC-CLARITY` + `PLAT-GROWTH-ANNUAL` |
| `amount_due` / `amount_received` | $2,500 / $2,500 |
| `payment_rail` | `PayPal` \| `Zelle` |
| `payer_ref` | PayPal txn id / Zelle confirmation + last4 |
| `received_at` | ISO date |
| `activation` | `orgId`, tier, status `ACTIVE`, seats note |
| `term_start` / `term_end` | for platform |
| `operator` | who verified funds |

Optional later: Prisma `ServiceEngagement` + `ManualPayment` tables. **Not required to take first money.**

### 4.3 Payment rails

| Rail | Use for | Ops notes |
|------|---------|-----------|
| **Zelle** | Domestic NPOs, invoices ≤ bank limits | Send to business Zelle handle; require memo `deal_id`; screenshot + bank credit before activation |
| **PayPal** | Cards, remote payers, invoicing | Prefer **PayPal Invoice** (Goods/Services) for paper trail; Friends & Family discouraged (no protection / messy books) |
| **Wire / ACH** | ENTERPRISE annual | Acceptable; same manual verification |

**Do not** promise instant self-serve provisioning after PayPal click. SLA: **activate within 1 business day of cleared funds**.

### 4.4 Quote → cash → access flow

```text
Discovery call
    → SOW / one-pager (SKU, price, timeline, exclusions)
    → Invoice (PayPal Invoice preferred; PDF + Zelle instructions alternate)
    → Client pays (PayPal or Zelle)
    → Operator verifies settlement
    → Create/find Organization in Accord
    → Set subscriptionTier + status=ACTIVE (and term dates in ops sheet)
    → Provision users / seed org context templates
    → Kickoff delivery
    → Closeout + conversion offer (platform renewal or upsell SKU)
```

### 4.5 Platform activation (technical truth)

Entitlement already hinges on:

- `Organization.subscriptionStatus === 'ACTIVE'`
- `Organization.subscriptionTier ∈ {STARTER, GROWTH, ENTERPRISE}`

**Launch activation method (v0):** operator runs a controlled script or Prisma Studio / SQL update after payment verification. Log the change in the deal sheet (`activated_by`, `activated_at`, `evidence_link`).

**v1 (soon after first paid deals):** add an **internal operator-only** admin route or CLI:

- `magnus-ops activate-org --orgId … --tier GROWTH --termDays 365 --paymentRef …`  
- writes tier/status + append-only `ManualBillingEvent` (optional table)

**Do not** wire PayPal IPN/webhooks for launch unless needed; manual verification is the safety feature.

### 4.6 Refunds, chargebacks, and suspensions

| Event | Action |
|-------|--------|
| Refund before delivery start | Full refund; do not activate / deactivate if activated |
| Mid-engagement cancel | Partial per SOW; leave org at STARTER or suspend |
| Platform non-payment at renewal | Set `subscriptionStatus` to `PAST_DUE` or `SUSPENDED` (use existing enum values); agents stop via policy |
| Disputed PayPal | Freeze entitlement until resolved |

Confirm exact `SubscriptionStatus` enum values in Prisma before documenting customer-facing status names.

---

## 5. Launch offer architecture (what to sell in week 1)

### Offer A — **Gateway Diagnostic** (default outbound)

- **SKU:** `SVC-CLARITY`  
- **Price:** $2,500 (fixed for launch simplicity; room $2,200–$2,800)  
- **Payment:** 100% upfront via PayPal Invoice or Zelle  
- **Optional add-on at quote:** `SVC-DAF` for +$1,800 (bundle discount: Clarity+DAF = **$4,000**)  
- **Conversion:** 30-day STARTER trial credit **or** 1 month GROWTH included if they prepay annual platform during closeout  

### Offer B — **Platform Onboarding Sprint** (for warm leads who already want software)

- Board Setup **or** Compliance Config **or** Migration (pick one primary)  
- Requires concurrent **GROWTH** platform commitment (annual preferred)  
- Payment split suggestion: **50% services + 100% annual platform upfront**, or services 50/50 with platform annual in full  

### Offer C — **Assisted Ops Pilot (software)**

- Aligns with existing package docs: Assisted Ops = GROWTH  
- Price: **$400/mo** or **$4,800/yr** (launch promo: **$3,996/yr** = one month free)  
- Payment: annual via PayPal/Zelle only for first 5–10 customers  
- Includes: web AO surfaces + ComplianceWatchdog + BoardIntelligenceOracle **when agents service is deployed**  

### Offer D — **HQ Expansion**

- ENTERPRISE custom quote (≥ $1,500/mo)  
- Only after Clarity or Grant Prep proves data readiness  
- Manual contract + invoice; no self-serve  

---

## 6. Phased build plan (product + ops)

### Phase 0 — Sell without new code (this week)

**Ship process, not features.**

1. Finalize one-page SOW templates for Clarity and DAF  
2. Open PayPal Business + Zelle receiving account; define memo format `MA-{deal_id}`  
3. Create deal tracker (Notion/Sheet) with fields in §4.2  
4. Create activation checklist: verify payment → create org → set tier/status → invite users → seed context templates  
5. Publish truthful sales language from `MAGNUS_ACCORD_PACKAGES.md` / client sales sheet (no overclaims)  
6. Decide staging vs pilot tenant hosting (Railway pilot project) and who pays Anthropic usage for GROWTH demos  

**Exit criteria:** first paid Clarity invoice issued.

### Phase 1 — Manual billing spine (minimal engineering)

Goal: make activation auditable and hard to botch.

| Work item | Why |
|-----------|-----|
| CLI or internal admin: activate/suspend org tier | Safer than raw SQL |
| `ManualBillingEvent` (or ops log file in repo-private vault) | Audit trail for payments |
| Landing/sales page section: “Services + Pilot” with PayPal invoice CTA (mailto or form) | Capture demand |
| Invoice PDF generator (optional) | Professionalism |

**Explicit non-goals:** PayPal webhook automation, Zelle API, public self-serve checkout.

### Phase 2 — Service → platform data bridge

Make services leave machine-usable residue:

| Deliverable artifact | Land in Accord as |
|----------------------|-------------------|
| Funding map / concentration metrics | Org curated memory + context file |
| DAF checklist / Candid status | Context file + readiness blockers cleared |
| Board packet outline | Oracle config + sample `AgentRun` artifacts |
| Compliance inventory | `ComplianceCalendar` rows |
| Cleaned donor CSV | Donor CRM import path |

Add a short **“Engagement Closeout”** operator checklist that requires these seeds before marking the service complete.

### Phase 3 — Recurring platform ops

1. Annual renewal calendar (30/14/7 day manual reminders)  
2. Optional Stripe billing later for card subscribers who prefer automation — **parallel** to PayPal/Zelle, not a rewrite  
3. Usage guardrails for Concierge/Claude (proposal caps already implied in RevOps GROWTH “500 proposals/month” — enforce or soft-cap in product when selling that claim)

### Phase 4 — Expansion SKUs (post 3–5 closed Clarity deals)

Turn on Board, Compliance, Migration, Grant as productized SOWs only after capacity and templates exist.

---

## 7. Revenue model for first 90 days (planning math)

Illustrative capacity for a lean operator (from RevOps hour bands):

| Mix | Deals | Revenue band |
|-----|-------|--------------|
| 3 × Clarity @ $2,500 | 3 | $7,500 |
| 2 × Clarity+DAF bundle @ $4,000 | 2 | $8,000 |
| 2 × GROWTH annual @ ~$4,000 | 2 | $8,000 |
| 1 × Board or Compliance @ ~$2,500 | 1 | $2,500 |
| **Total stretch** | | **~$26k** |

More conservative launch target: **2 Clarity + 1 bundle + 1 GROWTH annual ≈ $12–15k** cash collected.

Margin check (RevOps internal cost ~$110–$140/hr): Clarity at 18–28 hours must price ≥ ~$2,200 to stay sane; prefer **$2,500 fixed**.

---

## 8. Delivery system (so services actually feed Accord)

### 8.1 Clarity package — operating outline

1. Intake questionnaire + kickoff  
2. Funding map + concentration risk + ecosystem map + DAF snapshot  
3. Board-ready PDF/deck  
4. Synthesis call  
5. **Closeout:** upload summary into org context files; offer STARTER/GROWTH activation invoice  

### 8.2 Platform pilot — operating outline

1. Payment cleared → activate GROWTH  
2. Seed directory templates; client edits identity files  
3. Enable agents only if `apps/agents` is deployed for that environment  
4. Run first ComplianceWatchdog + BoardIntelligenceOracle with human review of outputs  
5. Weekly check-in for 30 days; then convert to annual if monthly  

### 8.3 Staffing reality

Until volume justifies contractors, **one operator** should not sell Migration + Grant + Board in parallel. Cap WIP: **2 active Clarity/DAF**, **1 platform pilot**.

---

## 9. Legal / trust packaging for launch

Minimum set before taking payment:

1. Services SOW (scope, timeline range, client data delays, revision limits)  
2. Platform pilot terms (Tier A only; no autonomous external action; data processing)  
3. Payment terms: PayPal/Zelle instructions, refund policy, activation SLA  
4. Nonprofit data handling note (especially if donor lists are migrated)  

No need for full enterprise MSA on Offer A; use a short MSA + SOW for GROWTH/ENTERPRISE.

---

## 10. Success metrics (business launch, not vanity)

| Metric | 30-day | 90-day |
|--------|--------|--------|
| Paid service invoices | ≥ 1 | ≥ 4 |
| Cash collected | ≥ $2,500 | ≥ $12,000 |
| Platform orgs ACTIVE | ≥ 1 | ≥ 3 |
| Clarity → platform conversion | — | ≥ 40% of Clarity closes |
| Overclaim incidents / refunds from mis-sold AI | 0 | 0 |
| Time payment→activation | ≤ 1 business day | ≤ 1 business day |

---

## 11. Recommended immediate decisions

1. **Canonical launch SKU:** Clarity @ **$2,500** fixed; bundle Clarity+DAF @ **$4,000**.  
2. **Platform launch price:** GROWTH **$400/mo** or **$3,996/yr** promo; STARTER **$150/mo** / **$1,800/yr**.  
3. **Payment:** PayPal Invoice primary; Zelle alternate; no Stripe seat checkout for v0.  
4. **Activation:** manual operator update of `subscriptionTier` + `ACTIVE` with deal-sheet audit.  
5. **Do not sell** Board/Compliance agents unless agents service is actually deployed for that tenant’s environment.  
6. **Defer** Plaid packaging and ENTERPRISE custom until after first GROWTH renewals.

---

## 12. Engineering backlog (ordered, launch-shaped)

| Priority | Item | Blocks launch? |
|----------|------|----------------|
| P0 | Ops: SOW + invoice + deal tracker + activation checklist | **Yes** (process) |
| P0 | Confirm pilot environment can run web + org-dashboard-api (+ agents if selling GROWTH agents) | **Yes** |
| P1 | Operator CLI `activate-org` / `suspend-org` | No (SQL works) |
| P1 | Sales landing CTA for Clarity + PayPal invoice request | No |
| P2 | `ManualBillingEvent` table | No |
| P2 | Closeout scripts to seed org context from Clarity artifacts | No |
| P3 | Stripe subscription automation | No — post-launch |
| P3 | PayPal webhook auto-activation | No — avoid until volume hurts |

---

## 13. One-sentence operating model

**Sell Clarity for cash via PayPal/Zelle, deliver board-ready funding clarity in ~3 weeks, manually activate STARTER/GROWTH in Accord within one day of cleared funds, and only then expand into Board/Compliance/Grant services that deepen the same tenant.**

---

## Related canon

- `docs/product/MAGNUS_ACCORD_PACKAGES.md`  
- `docs/product/MAGNUS_ACCORD_CLIENT_SALES_SHEET.md`  
- `docs/product/MAGNUS_ACCORD_MATURITY_MAP.md`  
- `docs/AUTONOMOUS_OPS_ROADMAP.md`  
- `packages/subscription/src/policy.ts`  
- Source upload: RevOps brief (`MAGNUS_ACCORD_RevOps`)
