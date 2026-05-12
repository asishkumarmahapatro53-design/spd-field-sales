# SPD Application: Full Workflow, Safeguards, Purpose, and Feature Scope Report

Date: 2026-05-12  
Prepared from codebase state at commit: `87aebea`  
Repository root: `C:\Users\USER\Desktop\SPD-current-application-2026-05-10`

---

## 1. Executive Summary

This application is an internal, multi-role operational workflow system for SPD Concrete. It is not only a CRM. It connects field sales, managerial approvals, accounting controls, production scheduling, QC mix design, and batch dispatch operations in one role-based app.

The implemented system currently supports:

1. Sales-agent daily operational capture (session, odometer, site visits, lead/site/stakeholder updates).
2. Commercial progression (informal quotation request -> manager decision -> final approval -> sales order request).
3. Finance and legal gating (accounts review, GST validation workflow, document requirements for payment terms).
4. Production handoff (schedule approval + pump/dump actualization).
5. Batching and dispatch execution (truck allocation, quantity decrement, challan/invoice mode gating, site acceptance/rejection handling, return-load support API).
6. Reimbursement claim lifecycle (claim creation, OTP verification, paid status).
7. Printability for challan and invoice documents from dispatch records.

Critical readiness conclusion:

1. The dispatch + print workflow is implemented and usable for operational testing.
2. Odoo is only connected as a health-check integration today; it is not yet the active engine for e-invoice/e-way bill generation.
3. Legal-grade e-invoice/e-way bill posting and statutory integration are not fully implemented end-to-end in current code.

---

## 2. Product Purpose and Boundaries

### 2.1 Purpose

The app’s primary business purpose is controlled operational execution across the full RMC sales-to-dispatch chain:

1. Capture field evidence and lead progression.
2. Enforce approval and finance gates before order fulfillment.
3. Prevent unauthorized dispatch behavior.
4. Maintain traceable logs for operational and accounting accountability.

### 2.2 What it is not (current state)

1. Not a complete statutory invoicing stack with final e-invoice IRN and e-way bill generation via a production tax/GSP pipeline.
2. Not yet an Odoo-driven transactional ERP integration for posting all dispatch invoice events.
3. Not a replacement for external statutory filing systems in its current integration state.

---

## 3. Architecture Overview

### 3.1 Stack

1. Next.js App Router + TypeScript.
2. Server routes under `app/api/**`.
3. Business logic concentrated in `src/lib/repository.ts`.
4. Persistence abstraction in `src/lib/db.ts`.
5. Core domain typing in `src/lib/types.ts`.
6. Optional durable backing via Firebase Firestore; optional object storage via S3/Supabase/Firebase Storage.

### 3.2 Layering

1. UI/Page layer:
   - Role-specific dashboards and workflows (`app/**`, `src/components/**`).
2. API layer:
   - Route handlers perform auth/role checks and input coercion (`app/api/**/route.ts`).
3. Domain/service layer:
   - Workflow logic, validation, state transitions, audit logging (`src/lib/repository.ts`).
4. Persistence/storage layer:
   - Collection reads/writes with Firebase-first strategy and local fallback controls (`src/lib/db.ts`, `src/lib/storage.ts`).

### 3.3 Persistence strategy

1. Firestore collection model is primary when credentials exist.
2. Legacy doc migration path exists (`app_state/main` -> collections).
3. Production can block disposable local persistence unless explicitly allowed by `ALLOW_EPHEMERAL_PERSISTENCE`.
4. Update operations are diff-based in `updateDatabase` to reduce write contention and support concurrent users.

---

## 4. Role Model and Access Control

### 4.1 Roles in system

1. `SALES_AGENT`
2. `MANAGER`
3. `ACCOUNTING`
4. `BATCHER`
5. `MIX_DESIGN`
6. `PRODUCTION_MANAGER`

### 4.2 Access enforcement

1. Web page gating:
   - `requireUser(role)` in page entrypoints.
2. API gating:
   - `requireApiUser([roles...])` in route handlers.
3. Active-user enforcement:
   - `getCurrentUser()` resolves only users with `status === "ACTIVE"`.
4. Session auth:
   - Cookie token (`spd_auth_token`) with 12-hour TTL.
5. Demo mode:
   - Role switching allowed only when `DISABLE_LOGIN="true"`.

### 4.3 Route-to-role highlights

1. Sales agent APIs: odometer, site visits, approvals create, informal quotation create, sales order request create, help create.
2. Manager APIs: approval decisions, informal quotation decisions, manual odometer verification resolution, targets, task assignment, help resolution.
3. Accounting APIs: reimbursement OTP lifecycle, finance review, create sales order from ledger, commission, tally export.
4. Production manager APIs: schedule decision and pump dispatch decision.
5. Batcher APIs: dispatch create, site status updates, return-load processing.

---

## 5. Core Data Model and State Machines

### 5.1 Major entities

1. `WorkdaySession`
2. `OdometerReading`
3. `Lead` + `LeadSite` + `SiteVisit`
4. `ApprovalRequest`
5. `InformalQuotationRequest`
6. `SalesOrderRequest`
7. `MixDesign`
8. `DispatchRecord`
9. `ReimbursementClaim`
10. `Task`, `HelpRequest`, `Target`
11. `AuditLogEntry`

### 5.2 Key statuses

1. Odometer: `OCR_PENDING`, `AWAITING_CONFIRMATION`, `CONFIRMED`, `MANUAL_REVIEW_REQUIRED`, `MANUAL_VERIFIED`.
2. Approval: `PENDING`, `APPROVED`, `REJECTED`.
3. Informal quotation: `PENDING`, `APPROVED`, `REJECTED`.
4. Sales order request:
   - `PENDING_FINANCE`
   - `FINANCE_VERIFIED`
   - `FINANCE_REJECTED`
   - `SCHEDULE_PENDING`
   - `SCHEDULE_APPROVED`
   - `SCHEDULE_REJECTED`
5. Dispatch: `DISPATCHED`, `RETURNED`, `SITE_ACCEPTED`, `SITE_REJECTED`.
6. GST verification: `NOT_PROVIDED`, `PENDING_ACCOUNTS`, `VERIFIED`, `REJECTED`.
7. Pump dispatch: `NOT_DISPATCHED`, `DISPATCHED`.
8. Reimbursement claim: `REQUESTED`, `OTP_SENT`, `PAID`, `REJECTED`.

### 5.3 Dispatch document modes

1. `CHALLAN_ONLY`
2. `CHALLAN_AND_INVOICE`
3. `CHALLAN_AND_GST_E_INVOICE`

Invoice modes are programmatically locked unless GST conditions are satisfied.

---

## 6. End-to-End Workflow Logic

## 6.1 Authentication and session entry

1. Login endpoint: `POST /api/auth/login`
   - Rate-limited.
   - Password checked via `scrypt` hash verification.
2. Session end: `POST /api/auth/logout`.
3. Dashboard redirect by role via `/dashboard`.

## 6.2 Workday start/end

1. `POST /api/sessions/start`:
   - Sales-agent role required for real session start.
   - Creates or reuses open workday session for date.
2. `POST /api/sessions/end`:
   - Closes open workday session.
   - Stores logout timestamp and location.

## 6.3 Odometer capture workflow

1. Input path:
   - Multipart file upload or JSON payload with validated S3 object key.
2. OCR extraction:
   - Gemini OCR + fallback parsing logic.
3. Timestamp safeguards:
   - Reject future-dated photo timestamps.
4. Claim-period safeguards:
   - Blocks reading insertion for dates already paid or already in pending claim ranges.
5. Session alignment:
   - Auto-creates historical session from extracted timestamp when needed.
6. Status logic:
   - High-confidence accepted meter kind -> `AWAITING_CONFIRMATION`.
   - Low confidence or unknown -> `MANUAL_REVIEW_REQUIRED`.
7. Agent confirmation/rejection:
   - Confirm sets `CONFIRMED`.
   - Reject sends to manager review.
8. Manager resolution:
   - Manager sets manual value -> `MANUAL_VERIFIED`.

## 6.4 Site visit and lead/site enrichment

1. Input path:
   - Multipart or pre-uploaded S3 references.
2. Metadata extraction:
   - GPS watermark OCR fallback for site address, location, capture time.
3. Validation:
   - If no existing site selection and no readable address, visit is blocked.
4. Lead/site behavior:
   - Creates lead and site when missing.
   - Updates existing site with deduped stakeholders and latest visit context.
5. Stakeholder normalization:
   - Structured roles and dedup logic.
6. Transcript behavior:
   - Voice note can be transcribed and merged with typed remarks.
7. Location verification:
   - Existing-site updates compare detected coordinates against saved coordinates and assign verification status.
8. Agent-only edit scope:
   - Sales agent can edit only own visit entries.

## 6.5 Informal quotation flow

1. Creation (`POST /api/informal-quotations`):
   - Requires saved lead + site + stakeholder match.
   - Max 3 line items, unique grades, valid quantities and prices.
   - Billing address and normalized WhatsApp required.
   - Credit days required only for credit mode.
2. Decision (`PATCH /api/informal-quotations/[id]`):
   - Manager approves/rejects only pending requests.
3. On approval:
   - Quotation reference generated by financial year sequence.
   - PDF generation attempted and status stored.
   - Email dispatch attempted (with manager/agent CC where configured).
   - WhatsApp currently marked pending configuration.

## 6.6 Final approval request flow

1. Sales agent submits final approval with commercial details and line items.
2. Mandatory checks include:
   - Valid site context.
   - Positive quantity.
   - Valid required date.
   - Distance and traffic values.
3. Manager approves/rejects via `PATCH /api/approval-requests/[id]`.

## 6.7 Sales order request creation

1. Sales agent can create sales order request only from approved final approval.
2. Grade selection derived from approved line item.
3. Financial/legal checks:
   - Payment receipt confirmation for advance flows.
   - PO/PDC document requirement based on payment terms.
   - GSTIN validation if provided.
   - GST legal name/billing confirmation required for GST requests.
4. Initial status:
   - `PENDING_FINANCE`.
5. Remaining quantity initialized to full order quantity.

## 6.8 Accounting finance review and ledger-to-order transition

1. Finance review endpoint sets:
   - `FINANCE_VERIFIED` or `FINANCE_REJECTED`.
2. GST verification fields:
   - Marked verified/rejected by accounting based on review outcome.
3. Create sales order from ledger:
   - Allowed only when status is `FINANCE_VERIFIED`.
   - Validates receiver details and date.
   - Auto-links or auto-creates mix design when missing.
   - Moves request to `SCHEDULE_PENDING`.

## 6.9 Production scheduling and pump/dump decision

1. Schedule decision:
   - Production manager approves/rejects pending schedule.
   - Status -> `SCHEDULE_APPROVED` or `SCHEDULE_REJECTED`.
2. Pump dispatch confirmation:
   - Allowed only after schedule approval.
   - Sets actual casting type:
     - Pump dispatched -> `PUMP`
     - Not dispatched -> `DUMP`

## 6.10 Batcher dispatch workflow

1. Preconditions:
   - Same-plant authorization.
   - Order must be `SCHEDULE_APPROVED`.
   - Dispatch quantity > 0 and <= remaining order quantity.
   - Vehicle must be same plant, `IDLE`, and capacity-sufficient.
   - Active/linked mix design must exist.
2. Document mode normalization:
   - Invoice modes auto-forced to `CHALLAN_ONLY` if GST verification prerequisites fail.
3. Dispatch effects (atomic in update):
   - Remaining quantity decremented.
   - Vehicle status set to `ACTIVE`.
   - Dispatch record created with challan/invoice numbers.
   - Theoretical material consumption calculated from mix design x quantity.

## 6.11 Return-load and site outcome workflow

1. Return API (`POST /api/dispatch/[id]/return`):
   - Allows partial return from dispatched quantity.
   - Single-return enforcement.
   - Restores returned quantity to order remaining.
   - Sets dispatch record status to `RETURNED`.
   - Returns truck to `IDLE`.
2. Site status API (`PATCH /api/dispatch/[id]/site-status`):
   - Allowed from `DISPATCHED` or `RETURNED`.
   - Accept:
     - Sets `SITE_ACCEPTED`.
   - Reject:
     - Sets `SITE_REJECTED`.
     - Restores billable quantity to order remaining.
     - Sets final supplied qty to 0 and returned qty to full dispatched.
   - Returns truck to `IDLE`.

## 6.12 Reimbursement workflow

1. Claim creation:
   - Only from verified, unclaimed, unpaid eligible summaries.
   - Rejects if pending claim already exists.
2. OTP send:
   - Accounting can send OTP only for pending claims.
3. OTP verify:
   - Rate-limited endpoint.
   - Validates OTP match and expiry.
   - Marks claim `PAID`.

---

## 7. Safeguards and Control Mechanisms

## 7.1 Authentication and authorization safeguards

1. Centralized role guards in API.
2. Page-level role gating.
3. ACTIVE user enforcement.
4. Restricted demo role switching in non-login mode only.

## 7.2 Input and data integrity safeguards

1. Type/format validation for dates, quantities, coordinates, strings.
2. Strict S3 key prefix validation for uploaded object references (user-scoped prefixes).
3. File size limits by purpose:
   - Odometer: 2 MB
   - Site visit image: 5 MB
   - Voice note: 10 MB
4. Normalization of GSTIN, phone numbers, stakeholder data, payment terms.

## 7.3 Financial and legal safeguards

1. Payment-term document gating (PO/PDC).
2. Advance-payment confirmation gating.
3. GSTIN validation and accounts verification status.
4. Invoice mode lock until GST verified.
5. Financial-year sequence logic for challan/invoice refs.

## 7.4 Operational safeguards

1. Plant-scoped access checks for dispatch and related records.
2. Vehicle state gating (`IDLE` required to dispatch).
3. Quantity conservation:
   - Prevent over-dispatch.
   - Restore quantities on return/rejection.
4. Mix-design requirement before dispatch.
5. Pump actualization before dispatch context finalization.

## 7.5 Anti-tamper safeguards around reimbursement

1. Prevents adding odometer evidence for already-paid claim dates.
2. Prevents adding readings to dates already in active claims.
3. OTP workflow enforces proof-of-receipt style verification path.

## 7.6 Security hardening safeguards

1. Password hash/verify uses `scrypt` + `timingSafeEqual`.
2. Login and OTP endpoints protected by rate limiting.
3. Error response handling is structured.

## 7.7 Persistence durability safeguards

1. Production durability preference with blocking behavior when persistent DB/storage absent (unless explicitly overridden).
2. System health deep checks for Firebase/S3/Gemini and ephemeral-persistence policy.
3. Deployment preflight script blocks risky production deployments.

## 7.8 Auditability safeguards

1. Major state transitions append audit log entries with actor, action, entity, detail, timestamp.
2. Includes sensitive operational actions (dispatch, approvals, OTP verification, mix auto-create).

---

## 8. Feature Scope by Role

## 8.1 Sales Agent

1. Workday start/end.
2. Odometer upload and confirmation.
3. Site visit logging with metadata extraction.
4. Lead updates.
5. Informal quotation request creation.
6. Final approval request creation.
7. Sales order request creation from approved terms.
8. Schedule resubmission after rejection.
9. Help/correction request creation.
10. Reimbursement claim request initiation.
11. AI assistant chat for contextual guidance (agent-scoped context).

## 8.2 Manager

1. Approve/reject final approvals.
2. Approve/reject informal quotations.
3. Resolve manual odometer verification queue.
4. View tracking/activity summaries.
5. Set targets and assign tasks.
6. Resolve help/correction requests.
7. Access dispatch actions (manager role also accepted by dispatch APIs).

## 8.3 Accounting

1. Finance review of sales order requests.
2. Create sales order from verified ledger state.
3. Reimbursement OTP send/verify.
4. Reimbursement export (CSV/XLSX).
5. Commission voucher creation and listing.
6. Tally XML export for commission vouchers.
7. Odoo health check visibility.

## 8.4 Production Manager

1. Schedule approval/rejection for production.
2. Pump dispatch confirmation and actual casting override.

## 8.5 Batcher

1. Plant-scoped dispatch queue operation.
2. Challan/invoice mode selection (with legal gating).
3. Dispatch execution.
4. Site acceptance/rejection updates.
5. Challan/invoice print access from dispatch records.

## 8.6 Mix Design

1. Maintain active mix recipes by plant and grade.
2. Enforced plant ownership for mix-design role edits.

---

## 9. Integration Landscape: Implemented vs Planned

## 9.1 Implemented and active

1. Firebase Firestore for application data (when configured).
2. S3 upload and generated file storage path (when configured).
3. Supabase storage path (optional).
4. GSTVerify API for GST identity/address verification.
5. Gemini API for OCR/metadata/transcript and AI assistant chat.
6. SMTP email delivery for approved informal quotation PDF.

## 9.2 Implemented but limited

1. Odoo:
   - Environment summary + health-check endpoint exists.
   - Authentication and execute helper functions exist.
   - No direct transactional posting for order/invoice/e-way-bill in live dispatch flow yet.

## 9.3 Partially implemented / placeholder behavior

1. E-invoice fields exist (`invoiceStatus`, `eInvoiceIrn`) but IRN generation/posting is not fully wired to statutory backend.
2. E-way bill fields exist (`ewayBillNumber`, `ewayBillGeneratedAt`) but generation flow is not wired.
3. WhatsApp quotation sending is marked `PENDING_CONFIGURATION`.

---

## 10. Printability and Document Behavior

## 10.1 Challan printing

1. Available from dispatch table (`/dispatch/[id]/challan`).
2. Includes warning banners for rejected or return-pending states.
3. Uses dispatch record as source-of-truth.

## 10.2 Invoice printing

1. Available when document mode is not `CHALLAN_ONLY` (`/dispatch/[id]/invoice`).
2. For challan-only records, page explicitly states invoice unavailable.
3. Tax computation is rendered based on GST presence and fixed GST_RATE logic.
4. Rejected dispatch shows void warning; quantity/amount impact reflected.

## 10.3 Important legal interpretation

Current print output supports operational documentation and internal process continuity.  
Final statutory/legal validity for e-invoice/e-way bill depends on actual external statutory integration and posting, which is not fully completed in current flow.

---

## 11. Known Gaps, Risks, and Ambiguities

## 11.1 Odoo as primary statutory engine: not yet complete

1. Presently only health endpoint uses Odoo integration.
2. No direct use in dispatch route for invoice/e-way bill generation.
3. If business intent is “Odoo generates e-invoice + e-way bill,” current implementation is incomplete.

## 11.2 Route semantics overlap

1. `PATCH /api/sales-order-requests/[id]` handles production schedule decision.
2. `PATCH /api/sales-order-requests/[id]/schedule` is used by agent for resubmission after rejection.
3. Naming can cause operational confusion unless documented clearly.

## 11.3 Return-load UI gap

1. Backend return API exists.
2. Main batcher UI currently surfaces accepted/rejected actions and return quantities display, but no direct “return load” action is exposed in that screen.

## 11.4 Rate-limit topology

1. Rate limiter is in-memory.
2. Effective for single-node runtime, but not a distributed guard across horizontally scaled instances.

## 11.5 Encoding quality issues

1. Some UI strings show encoding artifacts (for example rupee symbol corruption in a few components).
2. This is presentation quality debt, not core workflow logic failure.

---

## 12. Testing Coverage and Quality Posture

### 12.1 Covered by current tests

1. Commercial helper rules and legal mode gating.
2. Password hash verification behavior.
3. Rate-limit utility behavior.
4. GSTVerify response normalization.
5. Odoo env helper normalization.
6. OCR prompt/normalization and fallback behavior.
7. Reimbursement summary computation.

### 12.2 Under-tested zones (important)

1. Full end-to-end API state transitions across sales -> accounts -> production -> dispatch.
2. Dispatch rejection/return edge combinations with repeated operations.
3. Multi-user concurrent writes under realistic production load.
4. Invoice/e-invoice/e-way bill external integration workflows (because incomplete).

---

## 13. Operational Readiness Assessment

## 13.1 Ready for controlled internal process/UAT

1. End-to-end internal workflow traversal is available.
2. Role-based access controls are in place.
3. Dispatch and print path is implemented.
4. Audit logs exist for major actions.

## 13.2 Not yet ready for full statutory automation claims

1. “Odoo is generating all e-invoices and e-way bills in production flow” is not true in current implementation.
2. “Legally filed e-invoice workflow is fully automated end-to-end” is not true in current implementation.

---

## 14. Practical Next Steps (Priority Order)

1. Integrate real Odoo transaction posting for dispatch invoice lifecycle:
   - Create/post invoice
   - Receive legal identifiers (IRN, e-way bill references)
   - Persist external IDs and statuses in `dispatchRecords`.
2. Implement explicit e-way bill generation pipeline and failure/retry states.
3. Add batcher UI action for return-load submission to use existing backend route.
4. Add integration tests for critical status transitions:
   - finance review -> sales order creation -> schedule approval -> pump update -> dispatch -> site reject/return.
5. Replace in-memory rate limiter with centralized/distributed store for multi-instance deployments.
6. Define a legal-go-live checklist document that maps each statutory requirement to implemented technical control and evidence.

---

## 15. File-Level Evidence Map (Primary Sources)

### Core domain and persistence

1. `src/lib/types.ts`
2. `src/lib/repository.ts`
3. `src/lib/db.ts`

### Security, auth, and API helpers

1. `src/lib/auth.ts`
2. `src/lib/api.ts`
3. `src/lib/password.ts`
4. `src/lib/rate-limit.ts`

### Legal/commercial logic

1. `src/lib/legal-workflow.ts`
2. `src/lib/commercial.ts`
3. `src/lib/mix-design.ts`

### Integrations

1. `src/lib/gst-verify.ts`
2. `src/lib/odoo.ts`
3. `src/lib/storage.ts`
4. `src/lib/system-health.ts`
5. `scripts/preflight-production.mjs`

### Dispatch and document print paths

1. `app/api/dispatch/route.ts`
2. `app/api/dispatch/[id]/return/route.ts`
3. `app/api/dispatch/[id]/site-status/route.ts`
4. `app/dispatch/[id]/challan/page.tsx`
5. `app/dispatch/[id]/invoice/page.tsx`
6. `src/components/batcher/BatcherWorkspace.tsx`

### Sales/commercial APIs

1. `app/api/approval-requests/**`
2. `app/api/informal-quotations/**`
3. `app/api/sales-order-requests/**`
4. `app/api/gst/verify/route.ts`
5. `app/api/odoo/health/route.ts`

### Supporting quality evidence

1. `tests/commercial.test.ts`
2. `tests/security.test.ts`
3. `tests/repository.test.ts`
4. `tests/gst-verify.test.ts`
5. `tests/odoo.test.ts`
6. `tests/agent-dashboard.test.ts`

---

## 16. Final Opinion

The application has a strong operational workflow backbone with meaningful safeguards and a clear role-segregated process design. For internal workflow execution and UAT, it is solid and practical.

The main strategic gap is statutory/ERP completion: if the target state is Odoo-driven legal e-invoice and e-way bill generation for every dispatch, that target is not fully achieved in current code. The right next move is to keep the existing guarded workflow and complete the Odoo/GSP posting layers without weakening current controls.
