# PayPal invoice copy — Funding & Ecosystem Clarity Package

**Use with:** `docs/commercial/CLARITY_SOW.md`  
**Payment rails (D3):** PayPal Invoice primary · Stripe Payment Link backup · **no Zelle**  
**Canonical Clarity price:** **USD $2,500.00**  
**Bundle (Clarity + DAF):** **USD $4,000.00**

Replace every `[BRACKET]` before sending. Deal ID format: `MA-2026-001`.

---

## 1. PayPal Invoice — field checklist

Create in PayPal Business → **Invoices** → Create invoice (**Goods and Services**, not Friends & Family).

| PayPal field | Value |
|--------------|--------|
| **Customer name** | `[CLIENT LEGAL NAME]` |
| **Customer email** | `[billing@client.org]` |
| **Invoice number** | `[MA-2026-001]` *(same as Deal ID)* |
| **Invoice date** | `[YYYY-MM-DD]` |
| **Due date** | **Due upon receipt** (or same calendar day) |
| **Currency** | USD |
| **Item 1 — name** | Magnus Accord — Funding & Ecosystem Clarity Package (`SVC-CLARITY`) |
| **Item 1 — description** | Fixed-scope diagnostic: funding map, concentration risk, ecosystem landscape, DAF readiness snapshot, prioritized 6–12 month recommendations, and synthesis call. See SOW Deal ID `[MA-2026-001]`. Not a software subscription. |
| **Item 1 — quantity** | 1 |
| **Item 1 — amount** | `2500.00` |
| **Item 2 (optional bundle)** | Magnus Accord — DAF Readiness + Candid Seal Sprint (`SVC-DAF`) |
| **Item 2 — description** | Add-on sprint: EIN/name consistency, Candid optimization guidance, website DAF language, baseline metrics, advisor outreach language. Bundle with Clarity. |
| **Item 2 — amount** | `1500.00` *(omit this line for Clarity-only)* |
| **Subtotal** | `2500.00` or `4000.00` |
| **Tax** | Usually none for professional services to a nonprofit—confirm with your CPA; default **$0.00** |
| **Shipping** | None |
| **Invoice memo / note to customer** | *(paste §3 below)* |
| **Terms and conditions** | *(paste §4 below, or “Per SOW `[MA-2026-001]`” if SOW attached)* |
| **Attachment** | PDF of signed/unsigned SOW (preferred) |

**Allow partial payments:** Off  
**Tips:** Off  
**Request tax IDs:** Optional  

---

## 2. Invoice line-item copy (Clarity only)

**Name**  
`Magnus Accord — Funding & Ecosystem Clarity Package (SVC-CLARITY)`

**Description**  
```
Fixed-fee professional services under Deal ID [MA-2026-001].

Includes: funding map + concentration risk analysis; ecosystem/funder landscape map;
DAF readiness snapshot + key metrics; prioritized 6–12 month recommendations;
kickoff + synthesis call; one revision cycle.

Does not include: Magnus Accord software subscription, autonomous filings/submissions,
money movement, Candid seal sprint (unless separately listed), or guaranteed funding outcomes.

Timeline: typically 2.5–4 weeks after complete intake materials are received.
Payment due upon receipt. Work begins after funds clear.
```

**Amount:** `2,500.00 USD`

---

## 3. Invoice memo / “Note to customer” (paste into PayPal)

```
Thank you for engaging Magnus Non Profit Services.

Deal ID: [MA-2026-001]
SOW: Funding & Ecosystem Clarity Package

Please pay this PayPal Invoice (Goods and Services). Do not send Friends & Family payments.
If you cannot use PayPal, reply to this email and we will issue a Stripe Payment Link instead.
Zelle is not accepted.

Payment clears → we confirm receipt → kickoff is scheduled.
This invoice is for professional services only; it does not activate software entitlements
unless a separate platform line item appears above.

Questions: [YOUR EMAIL]
```

---

## 4. Short terms blurb (PayPal “Terms and conditions” box)

```
Fees are fixed as stated. 100% due upon receipt. Kickoff and delivery follow the Statement
of Work for Deal ID [MA-2026-001]. Cancel before kickoff: full refund. Cancel after kickoff
and before draft: 50% refund. After draft delivery: non-refundable; Magnus completes remaining
in-scope delivery if Client remains responsive. One revision cycle included. Advisory
deliverables only—not legal, tax, audit, or fundraising guarantees. Confidential Client
materials used solely to perform the SOW.
```

---

## 5. Email to Client — send with invoice

**Subject**  
`Invoice [MA-2026-001] — Funding & Ecosystem Clarity Package ($2,500)`

**Body**

```
Hi [FIRST NAME],

Attached / linked is PayPal Invoice [MA-2026-001] for the Magnus Accord
Funding & Ecosystem Clarity Package.

Amount due: $2,500.00 USD (due upon receipt)
What you get: funding map + concentration risk, ecosystem landscape,
DAF readiness snapshot, prioritized recommendations, and a synthesis walkthrough.
Typical timeline: 2.5–4 weeks after we receive complete intake materials.

Please pay via the PayPal Invoice (Goods and Services).
If PayPal is blocked for your organization, reply here and I’ll send a Stripe Payment Link.
We do not accept Zelle.

The Statement of Work for this engagement is attached. Payment constitutes authorization
to proceed under that SOW if a wet signature is still outstanding.

Once payment clears, I’ll send the intake questionnaire and kickoff options.

Thanks,
[YOUR NAME]
Magnus Non Profit Services
[YOUR EMAIL] · [YOUR PHONE]
```

**Bundle subject variant**  
`Invoice [MA-2026-001] — Clarity + DAF Bundle ($4,000)`

**Bundle amount line**  
`Amount due: $4,000.00 USD (Clarity $2,500 + DAF Sprint $1,500)`

---

## 6. Stripe Payment Link backup — copy

Use only if Client cannot complete PayPal.

**Payment Link product name**  
`Magnus Accord — Clarity Package [MA-2026-001]`

**Description**  
```
Funding & Ecosystem Clarity Package (SVC-CLARITY). Deal ID [MA-2026-001].
Fixed fee professional services per SOW. Not a software subscription.
```

**Amount:** `$2,500.00` (or `$4,000.00` for bundle — use a separate link; do not let Client choose arbitrary amounts)

**After payment email to Client**

```
Payment received for Deal ID [MA-2026-001] via Stripe Payment Link.
Next step: intake questionnaire + kickoff scheduling (same SOW).
```

**Operator note:** Record `paymentMethod: stripe_payment_link` and the Stripe payment intent / link reference in the deal tracker before any platform activation. Clarity services do not require org activation; if a platform SKU is sold later, activation requires cleared funds + audit log (D4).

---

## 7. Internal operator checklist (after send)

- [ ] Deal ID assigned and matches PayPal invoice number  
- [ ] SOW PDF attached or linked  
- [ ] PayPal invoice is **Goods and Services**  
- [ ] Amount is exactly `$2,500.00` or bundle `$4,000.00`  
- [ ] Memo forbids Zelle / Friends & Family  
- [ ] Deal tracker row created (`amount_due`, `payment_rail: paypal`, status `invoiced`)  
- [ ] On clearance: save PayPal transaction ID → `payment_reference`; mark `received_at`  
- [ ] Send intake questionnaire within 1 business day of clearance  

---

## 8. Optional one-liner for invoice title field

`Clarity Package — Deal [MA-2026-001] — Due on receipt`
