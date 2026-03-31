# Dashboard waves — scope truth (donor, volunteer, executive)

This document separates **what is implemented**, what is **partial or bounded**, what is **future-wave only**, and what remains **explicitly out of scope** for three dashboard pillars. It exists to prevent roadmap drift and product overclaim. For route and tier gating, see [ROUTE_FEATURE_MATRIX.md](./ROUTE_FEATURE_MATRIX.md).

**Naming (read this first)**

- **Donor operations** (shipped feature key `donor_operations`) is **operational, deterministic analytics** over gifts and campaigns. It is **not** donor intelligence in the CRM/prospecting sense.
- **Volunteer operations** (`volunteer_operations`) is a **light operational dashboard** (hours, roster summary, in-kind estimate, alerts). It is **not** a volunteer CRM, scheduling product, or messaging platform.
- **Executive command center** (UI label; API `GET /api/org/executive-summary`, feature `executive_rollups`) is **read-only cross-module rollups**, explicit `moduleState`, and **rule-based deterministic alerts**. It is **not** an LLM strategy engine, a black-box control tower, or a single cross-module health score.

---

## 1. Donor operations

| Category | Scope |
|----------|--------|
| **Implemented now** | Org API: donor operations summary, campaigns CRUD, gift ingest (`/api/org/donor-operations/*`). Web: donor operations dashboard. Deterministic portfolio metrics, segments, lapsed donor views, recurring trends, data-quality states (`NOT_CONFIGURED` / `INSUFFICIENT_DATA` / `OK`) with documented reasons. |
| **Partial / bounded** | Analytics quality depends on gift volume and history span; rule-based “upgrade” style signals are **not** predictions with thin-data guarantees. No wealth graph or external enrichment. |
| **Future-wave only (not in repo as product)** | Deeper prospecting workflows, unified nonprofit CRM, multi-channel engagement orchestration — **only if** separately specified and built; not implied by current routes. |
| **Explicitly forbidden / unsupported for now** | Wealth screening; **major-donor prediction on thin data**; **broad CRM** replacement; **synthetic donor intent** or opaque scoring; grantmaker-facing portals; claiming compliance-grade fundraising analytics without data backing. |

---

## 2. Volunteer management / volunteer operations

| Category | Scope |
|----------|--------|
| **Implemented now** | Org API: volunteer profiles, time entries, assignments, settings (hourly rate), summary rollup. Web: volunteer operations dashboard. Roster summary, hours by period (e.g. 30/90/365d), hours by program, in-kind estimate from documented rate + formula + **non-compliance / illustrative disclaimer**, missing-timesheet / stale-assignment alerts. |
| **Partial / bounded** | “Active volunteers” includes roster `isActive` and metrics such as volunteers with hours in rolling windows — clarified in UI/API, not a engagement score. Assignments are operational hooks, not a scheduling suite. |
| **Future-wave only (not in repo as product)** | Full volunteer CRM, community platform, matching engine, advanced scheduling — **not** shipped under `volunteer_operations`. |
| **Explicitly forbidden / unsupported for now** | **Volunteer scheduling / messaging platform** as a product; **synthetic community engagement scoring**; complex workflow automation presented as mature product; compliance-grade in-kind valuation claims when data is `INSUFFICIENT_DATA`. |

---

## 3. Executive control tower / executive rollups

| Category | Scope |
|----------|--------|
| **Implemented now** | `GET /api/org/executive-summary` (ENTERPRISE, `executive_rollups`). Deterministic composition of real modules: compliance, grants, restricted funds, governance, audit prep, state registrations, 990/funder readiness, cash flow snapshot, donor operations, volunteer operations. Per-section `moduleState` (e.g. `OK`, `WEAK_COVERAGE`, `INSUFFICIENT_DATA`, `NOT_CONFIGURED`, `UNAVAILABLE_FEATURE`, `NOT_APPLICABLE_ORG_CONTEXT`). Top-level **deterministic** `alerts` with `sourceModule`, `dashboardHref`, `evidence.path`, `confidence: deterministic`. `scopeNotes` for boundary explanations. Web: executive command center page. |
| **Partial / bounded** | **Institutional portfolio** appears as **NOT_APPLICABLE_ORG_CONTEXT** on org JWT rollup (partner APIs + session live under `/dashboard/partner/*`). Funder readiness is coupled to **990 readiness** in-product, not a separate grantmaker portal. Heuristic `ok` / `weak` on some modules is **coverage**, not audited verification. |
| **Future-wave only (not in repo as product)** | Cross-module **LLM narrative** with full evidence binding; unified “strategy copilot”; automated prioritization beyond documented rules — **not** v1 executive surface. |
| **Explicitly forbidden / unsupported for now** | **Executive AI strategy engine**; **black-box control tower**; **unsupported cross-module health scoring** (no single global health number); synthetic recommendations without evidence; implying partner or immature modules are fully “green.” |

---

## Cross-cutting exclusions (reaffirmed)

The following remain **out of scope** for Magnus Accord dashboard waves as documented here, regardless of other experimental code elsewhere:

- Wealth screening  
- Major-donor prediction with thin data  
- Broad nonprofit CRM / grantmaker portal  
- Volunteer scheduling + messaging platform  
- Synthetic donor intent  
- Executive AI strategy engine, black-box control tower, unsupported cross-module health scoring  

For release subset and security evidence, see [PRODUCTION_READINESS_REPORT.md](../PRODUCTION_READINESS_REPORT.md).
