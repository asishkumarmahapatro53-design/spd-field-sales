# SPD Two-PDF Implementation Plan

Date: 2026-05-16

Source documents:

- `SPD_Accounts_Sales_Department_Workflow_Loopholes_Fixes_Automation_Reviewed_PDF_View.pdf`
- `SPD_Workflow_Modification_Living_Document_v3_1.pdf`

Planning rule:

- Implement first what can be safely done inside the current application without external service dependency.
- Keep Accounts Dashboard -> Sales Department scope separate from full Production, Dispatch, statutory invoice generation, batching, and truck-return implementation.
- Preserve every safeguard as data, status, audit trail, permission gate, or blocking rule. Nothing should rely only on visual UI labels.

---

## 1. Scope Boundary

### 1.1 Accounts Sales PDF Scope

This plan treats the Accounts Sales PDF as limited to:

1. Sales Reimbursements.
2. Create New Ledger.
3. Create Sales Order.
4. Sales Order Pipeline visibility.
5. Accounts-side automation controls.

Accounts Sales may show production, dispatch, challan, invoice, e-invoice, e-way bill, ledger debit, payment, and outstanding statuses. It should not implement the full production dispatch engine, batching engine, truck return handling, or statutory IRN/e-way generation in this phase.

### 1.2 Living Document Scope

The Living Document v3.1 covers the wider application workflow from agent odometer proof, visits, leads, sites, stakeholders, quotations, final approvals, sales order requests, finance handoff, and map visibility.

The important v3.1 correction is that GST/PAN must not be forced during first site visit creation. GST/PAN belongs later in stakeholder, billing, quotation, final approval, finance, or Accounts ledger flows.

---

## 2. Phase Order Summary

### Phase 0 - Foundation And Traceability

Goal: Add shared status enums, audit models, checklist storage patterns, attachment versioning patterns, and migration safety before changing business behavior.

Key references:

- Accounts Sales PDF: consolidated workflow, implementation checklist, automation controls.
- Living Document: MOD-003, MOD-004, MOD-005, MOD-008, MOD-010, MOD-012, MOD-023, MOD-024, MOD-026, MOD-027, MOD-028, MOD-029.

Immediate deliverables:

1. Add centralized workflow status constants.
2. Add reusable audit table/helper for who changed what, when, old value, new value, reason, and linked entity.
3. Add reusable attachment metadata model: file type, upload time, uploaded by, source module, version, superseded flag, verification status.
4. Add checklist storage pattern using boolean fields plus remarks plus verified by plus verified at.
5. Add permission gates for Accountant, Manager, Sales, Agent, Admin, and Finance reviewer where applicable.
6. Add database migrations with backward-compatible defaults.

Safeguards:

1. Never overwrite proof files or approval records.
2. Every correction or exception must have reason, actor, timestamp, and prior value.
3. Business-blocking statuses must be enforced by backend APIs, not only frontend buttons.
4. Attachments must remain visible even when superseded.

---

## 3. Phase 1 - Accounts Sales P1 Immediate Implementation

This is the first business implementation phase because it matches the Accounts Sales PDF scope and can be implemented mostly without external integrations.

### 3.1 Sales Reimbursement Control Chain

References:

- Accounts Sales PDF: reimbursement loopholes, approved fixes, final improved reimbursement workflow.
- Living Document: MOD-008, MOD-009, MOD-010, MOD-011, MOD-012 where odometer, claimed-day locks, reopen/correction, missing proof, and continuity affect reimbursement correctness.

Implement:

1. Reimbursement status chain:
   `CLAIM_REQUESTED -> MANAGER_VERIFIED -> ACCOUNTS_PAYMENT_PENDING -> CASH_VOUCHER_CREATED -> OTP_SENT -> AGENT_RECEIPT_CONFIRMED -> PAID`
2. Payment result statuses:
   `FULL_PAYMENT`, `PARTIAL_PAYMENT`, `BALANCE_OUTSTANDING`, `PAYMENT_HOLD`, `PAYMENT_REJECTED`
3. Cash voucher must be created before OTP is sent.
4. OTP must confirm agent receipt, not manager approval.
5. Accountant remarks mandatory for full, partial, hold, and reject actions.
6. Partial reimbursement must keep paid amount, balance amount, outstanding amount, previous payment history, and claim not fully closed.
7. Reimbursement cannot be edited after full payment except through a controlled correction/reopen flow.

Data fields:

1. Claim amount.
2. Approved amount.
3. Paid amount.
4. Balance amount.
5. Outstanding amount.
6. Payment mode.
7. Cash voucher number.
8. Accountant remarks.
9. Manager verified by and at.
10. Accountant action by and at.
11. OTP sent at.
12. OTP verified at.
13. Agent receipt confirmed at.
14. Payment history entries.

Backend safeguards:

1. Block OTP sending until cash voucher exists.
2. Block PAID status until agent receipt OTP is confirmed.
3. Block claim closure when balance amount is greater than zero.
4. Require manager verification before Accounts payment action.
5. Store each payment as a separate immutable payment history row.

UI deliverables:

1. Reimbursement queue under Accounts Dashboard -> Sales Department.
2. Status timeline.
3. Cash voucher creation panel.
4. OTP send/verify panel.
5. Full, partial, hold, reject actions with mandatory remarks.
6. Outstanding balance view for partial payments.

Tests:

1. Cannot send OTP before voucher.
2. Cannot mark paid before OTP confirmation.
3. Partial payment keeps claim open.
4. Rejection and hold require remarks.
5. Previous payment history remains visible after second payment.

### 3.2 Finance Verification Checklist Before Create Ledger

References:

- Accounts Sales PDF: Create New Ledger loopholes, approved fixes, final improved ledger workflow, implementation checklist.
- Living Document: MOD-023 stakeholder verification, MOD-024 quotation pre-eligibility, MOD-026 final approval finance checks, MOD-027 finance handoff.

Implement stored checklist:

1. GST checked.
2. GST certificate checked.
3. Legal name checked.
4. Billing address checked.
5. PO checked.
6. PDC checked.
7. Payment proof checked.
8. Amount received checked.
9. Outstanding checked.
10. Overdue checked.
11. Credit limit checked.
12. Accountant remarks.
13. Verified by.
14. Verified at.

Backend safeguards:

1. Ledger approval cannot complete until required checklist items are saved.
2. Checklist must be versioned or audit logged if edited after first verification.
3. Accountant remarks are mandatory for approval, rejection, and exception forwarding.
4. Manager exception must be recorded when required documents are missing.

UI deliverables:

1. Finance checklist panel in Create New Ledger flow.
2. Read-only checklist summary after approval.
3. Missing document warning badges.
4. Manager exception request button when PO/PDC or proof is missing.

Tests:

1. Cannot approve ledger without checklist.
2. Checklist saves verified by and verified at.
3. Checklist edits create audit trail.
4. Missing PO/PDC requires manager exception before proceeding.

### 3.3 Manual Payment Verification Panel

References:

- Accounts Sales PDF: Create New Ledger payment verification and automation controls.
- Living Document: MOD-026 finance/credit approval, MOD-027 finance handoff.

Implement immediately without bank API:

1. Amount received.
2. Payment mode.
3. UTR number.
4. Cheque number.
5. Cash voucher number.
6. Payment date.
7. Payment proof upload.
8. Bank/cash account.
9. Verified by accountant.
10. Difference from required amount.

Backend safeguards:

1. Amount received must be numeric and cannot be negative.
2. Difference from required amount must be calculated by backend.
3. UTR, cheque, or voucher field must match selected payment mode rules.
4. Payment proof upload required unless manager exception allows otherwise.
5. Verification status must be stored separately from raw payment entry.

UI deliverables:

1. Payment verification panel before ledger approval.
2. Proof upload and preview.
3. Required amount vs received amount comparison.
4. Difference warning.
5. Accountant verify action.

Integration boundary:

Bank auto-UTR verification is future integration. Current phase only stores manual proof and accountant verification.

### 3.4 GST Verification And GST/Non-GST Ledger Decision

References:

- Accounts Sales PDF: GST duplicate matching, ledger decision workflow, Odoo/GST ledger vs internal ledger split.
- Living Document: MOD-023 stakeholder/billing party, MOD-024 quotation pre-eligibility, MOD-026 final approval, MOD-027 Odoo Sales Order Request handoff.

Implement:

1. GST verification fields:
   - GSTIN.
   - PAN derived from GSTIN.
   - GST certificate.
   - GST legal name.
   - Billing address.
   - Existing Odoo GST ledger check.
2. Ledger decision statuses:
   - `GST_CLIENT_ODOO_LEDGER`
   - `NON_GST_INTERNAL_LEDGER`
   - `GST_MATCH_FOUND`
   - `GST_NO_MATCH`
   - `LINK_EXISTING_LEDGER`
   - `CREATE_NEW_SITE`
   - `CREATE_NEW_LEDGER`
3. GST client must follow Odoo/GST ledger path.
4. Non-GST client must follow internal app ledger path.
5. Existing ledger / create new site / create new ledger decision UI.

Backend safeguards:

1. GSTIN format validation when GST path is selected.
2. PAN from GSTIN must be stored or calculated consistently.
3. Duplicate matching must consider GSTIN, PAN, legal name, billing address, phone, and existing ledger references.
4. Linking an existing ledger must require accountant confirmation.
5. Creating a new ledger when match exists must require manager override and reason.
6. Non-GST internal ledger must not trigger statutory GST ledger assumptions.

UI deliverables:

1. GST vs Non-GST decision card.
2. Duplicate match results.
3. Link existing ledger button.
4. Create new site button.
5. Create new ledger button.
6. Verification summary with match outcome.

Future integration:

GST API verification is not part of immediate implementation. Immediate version is manual verification plus duplicate matching against app/Odoo-known data.

### 3.5 Credit Limit And Overdue Block

References:

- Accounts Sales PDF: manager credit-limit assignment, over-limit/overdue hard block, ledger approval workflow.
- Living Document: MOD-026 credit/finance approval, MOD-027 finance handoff.

Implement credit-limit section:

1. Customer / GST ledger / internal ledger selector.
2. Credit limit amount.
3. Credit period.
4. Risk category: Low, Medium, High, Blocked.
5. Reason / remarks.
6. Approval history.
7. Temporary exception approval.

Implement credit exposure view:

1. Existing outstanding.
2. Overdue amount.
3. Last payment date.
4. Credit limit.
5. Active order exposure.
6. Available credit.
7. PO/PDC status.
8. Higher approval required flag.

Backend formula:

`Available Credit = Credit Limit - Current Outstanding - Active Order Exposure`

Backend safeguards:

1. Block sales order creation if over credit limit and no manager override exists.
2. Block sales order creation if overdue and no higher approval exists.
3. Block if customer risk category is Blocked unless admin-level unblock exists.
4. Store every credit-limit change in approval history.
5. Temporary exceptions must have expiry date, amount limit, approver, and reason.

UI deliverables:

1. Credit-control panel.
2. Available credit calculation.
3. Overdue and over-limit warning.
4. Manager override request flow.
5. Approval history timeline.

### 3.6 PO/PDC Exception Approval

References:

- Accounts Sales PDF: PO/PDC missing manager exception approval.
- Living Document: MOD-024 quotation eligibility, MOD-026 final approval, MOD-027 finance handoff.

Implement:

1. PO upload status.
2. PDC upload/status.
3. Manual verify action.
4. Accountant remarks.
5. Manager exception request when PO/PDC missing.
6. Manager approve/reject exception.

Backend safeguards:

1. Missing PO/PDC blocks ledger approval or sales order creation unless manager exception exists.
2. Exception must include reason, approver, timestamp, and scope.
3. Exception must be linked to the customer/order/ledger it applies to.
4. Exception should not become a permanent bypass for future orders unless explicitly marked reusable.

Future integration:

PO/PDC OCR and authenticity checks are future. Immediate version is upload, view, manual verify, remarks, and manager exception.

### 3.7 Final Sales Order Checklist

References:

- Accounts Sales PDF: Create Sales Order loopholes, approved fixes, final improved Create Sales Order workflow.
- Living Document: MOD-026 final approval, MOD-027 Sales Order Request, MOD-028 Sales Order Management.

Implement checklist before Accounts clicks Create Sales Order:

1. Grade confirmed.
2. Quantity confirmed.
3. Rate confirmed.
4. Payment terms confirmed.
5. Required date/time confirmed.
6. Casting type confirmed.
7. Pump/dump requirement confirmed.
8. Receiver confirmed.
9. Phone confirmed.
10. Delivery address confirmed.
11. Plant confirmed.
12. Tax/challan mode confirmed.

Backend safeguards:

1. Create Sales Order API must reject incomplete checklist.
2. Checklist must be stored with verified by and verified at.
3. Any changed order-critical field after checklist completion must invalidate checklist.
4. Accountant remarks must be mandatory before final create.

UI deliverables:

1. Final checklist panel.
2. Clear blocked/ready state.
3. Accountant remarks field.
4. Field-change warning after checklist completion.

### 3.8 Mix-Design Readiness Panel

References:

- Accounts Sales PDF: mix-design readiness before Accounts creates sales order.
- Living Document: MOD-027 preliminary mix design, MOD-028 order management.

Implement:

1. Grade selected.
2. Mix design available status.
3. Plant compatibility status.
4. Pump/dump applicability.
5. Technical readiness status.
6. Pending reason if not ready.

Backend safeguards:

1. Sales order creation should warn or block based on configured readiness rule.
2. If manager override allows creation without readiness, reason and approver must be stored.
3. Accounts should see readiness; actual production mix-design implementation belongs outside Accounts Sales.

### 3.9 Sales Order Preview And Downloadable Copy

References:

- Accounts Sales PDF: sales-order preview and downloadable copy before final create.
- Living Document: MOD-027 and MOD-028.

Implement:

1. Preview all order-critical fields before final create.
2. Generate downloadable copy after final confirmation.
3. Store created-by, created-at, preview-confirmed-by, preview-confirmed-at.
4. Prevent silent changes between preview and final create.

Backend safeguards:

1. Recalculate totals and credit status on final submit.
2. Reject final submit if preview hash does not match current data.
3. Store immutable copy/version after creation.

### 3.10 Expanded Accounts Sales Order Pipeline Visibility

References:

- Accounts Sales PDF: Sales Order Pipeline visibility, consolidated Accounts Sales workflow.
- Living Document: MOD-028 Sales Order Management.

Implement visibility columns:

1. Production status.
2. Dispatched quantity.
3. Remaining quantity.
4. Challan status.
5. Invoice/e-invoice status.
6. E-way bill status.
7. Ledger debit status.
8. Payment received.
9. Outstanding balance.

Backend safeguards:

1. Treat these as read-only Accounts visibility unless Accounts owns a specific field.
2. Do not implement production dispatch, batching, truck return, IRN generation, or e-way bill generation here.
3. Show integration statuses as status fields only:
   - `IRN_PENDING`
   - `IRN_GENERATED`
   - `EWAY_BILL_PENDING`
   - `EWAY_BILL_GENERATED`

UI deliverables:

1. Pipeline table with Accounts-specific filters.
2. Status chips.
3. Outstanding and payment summary.
4. Links to ledger/order detail pages.

---

## 4. Phase 2 - Odometer, Travel Proof, And Reimbursement Integrity

This phase hardens the input data that reimbursement depends on.

### MOD-001 - Odometer Upload Manual Reading, OCR Compare, Discard Flow

Implement:

1. Manual reading required with odometer upload.
2. OCR reading stored separately if available.
3. Difference flag when manual and OCR differ beyond tolerance.
4. Discarded upload history retained.
5. Replacement upload linked to discarded proof.

Safeguards:

1. Never delete discarded proof.
2. Reimbursement uses verified/accepted reading only.
3. Large OCR/manual mismatch requires manager review.

### MOD-002 - Preserve GPS Coordinates On Odometer Upload

Implement:

1. Store latitude, longitude, accuracy, captured time, and upload source.
2. Show captured GPS in review screens.
3. Keep original GPS even if user later edits related visit details.

Safeguards:

1. GPS is proof metadata, not editable business data.
2. Missing GPS should create warning, not silently pass.

### MOD-003 - Odometer Metadata And Audit

Implement:

1. Capture uploaded by, upload time, device/source metadata where available.
2. Track every review, correction, discard, and replacement.
3. Store reviewer remarks.

Safeguards:

1. Metadata must survive file replacement.
2. Audit trail must be read-only to normal users.

### MOD-004 - Duplicate Odometer Image Hash

Implement:

1. Calculate file hash on upload.
2. Detect duplicate image reuse.
3. Show duplicate warning with prior usage context.

Safeguards:

1. Duplicate proof cannot be accepted silently.
2. Manager override requires reason.

### MOD-005 - Start/End Odometer Uniqueness

Implement:

1. One START and one END odometer proof per agent per day.
2. Replacement allowed only through controlled correction.
3. Prevent multiple accepted START/END proofs.

Safeguards:

1. Claimed days are locked from normal edits.
2. Replacement retains old proof history.

### MOD-006 - Batch Upload Past Odometer Images

Implement:

1. Allow authorized upload for past missing days.
2. Require date selection and reason.
3. Mark as late/manual upload.

Safeguards:

1. Late uploads require manager/accountant visibility.
2. Reimbursement should flag late proof.

### MOD-007 - Incomplete Day Detection

Implement:

1. Detect missing START or END.
2. Detect impossible/negative travel distance.
3. Mark day as incomplete until corrected or approved by exception.

Safeguards:

1. Incomplete day cannot auto-flow to reimbursement without exception.
2. Exception must include reason and approver.

### MOD-008 - Claimed Day Lock

Implement:

1. Lock odometer proofs after reimbursement claim generation.
2. Allow reopen only through controlled correction.

Safeguards:

1. Claimed data changes must create correction version.
2. Accounts must see that claim is based on corrected data.

### MOD-009 - Claimed Day Edit/Reopen Control

Implement:

1. Reopen request with reason.
2. Manager approval before edits.
3. Reimbursement impact recalculation.

Safeguards:

1. Previous claim values remain visible.
2. Accounts must approve or reprocess affected reimbursement.

### MOD-010 - Odometer Correction Versioning

Implement:

1. Correction version number.
2. Old reading, new reading, reason, approver, timestamp.
3. Link to affected claim/order/visit where applicable.

Safeguards:

1. Reports must identify corrected values.
2. Export should not hide original values.

### MOD-011 - Missing Odometer Watermark

Implement:

1. Show missing-proof watermark/status on day records.
2. Include missing status in reimbursement review.

Safeguards:

1. Missing proof cannot be confused with zero travel.
2. Missing proof requires correction or exception.

### MOD-012 - Odometer Continuity Check

Implement:

1. Compare previous END with next START.
2. Flag gap, reversal, or suspicious continuity.
3. Require review for mismatches.

Safeguards:

1. Continuity warning should be visible before claim approval.
2. Manager override requires reason.

### MOD-013 - Agent Daily Travel Summary

Implement:

1. Daily travel summary: start, end, total km, visits, missing proofs, corrections, claim status.
2. Export for Accounts review.

Safeguards:

1. Summary must derive from accepted readings and correction versions.
2. Manual overrides must be visible.

### MOD-014 - Reimbursement Linkage To Odometer Proof

Implement:

1. Link reimbursement claim rows to odometer day records.
2. Show proof status inside claim.
3. Recalculate if approved correction changes payable amount.

Safeguards:

1. Claim cannot detach from proof.
2. Partial payment history must remain even after correction.

---

## 5. Phase 3 - Site Visit, Lead, And Site Safeguards

### MOD-015 - Captured Date Mapping

Implement:

1. Store visit captured date separately from upload/sync date.
2. Show captured date in visit lists and approvals.

Safeguards:

1. Reports should use captured date where business logic requires visit date.
2. Late sync must be visible.

### MOD-016 - GPS Review And Manager Flow

Implement:

1. Store GPS details for visits.
2. Manager review for missing/low-confidence GPS.
3. Show map preview where coordinates exist.

Safeguards:

1. GPS alone is not automatic visit proof.
2. Missing GPS needs warning or exception.

### MOD-017 - One Active Visit Per Agent

Implement:

1. Prevent agent from starting multiple active visits.
2. Require close/cancel before new visit.
3. Store cancel reason.

Safeguards:

1. Avoid overlapping active visit fraud/confusion.
2. Manager override must be audited.

### MOD-018 - Duplicate Lead/Site Check

Implement:

1. Duplicate check by customer/site name, phone, address, GPS proximity, and stakeholder.
2. Warn before creating lead/site.
3. Allow link to existing lead/site.

Safeguards:

1. Do not force duplicate check using GST/PAN at first visit.
2. New duplicate creation with strong match needs manager reason.

### MOD-019 - Editable Audio/Text With Audit

Implement:

1. Allow controlled edits to visit notes/transcription.
2. Store original and edited values.
3. Track edited by, edited at, and reason.

Safeguards:

1. Original audio/proof remains immutable.
2. Edited text must be visibly marked as edited.

### MOD-020 - Site/Lead Search Before New Entry

Implement:

1. Search existing leads/sites before create.
2. Show possible matches.
3. Provide link-existing path.

Safeguards:

1. Reduce accidental duplicate sites.
2. User can proceed only with reason when strong match exists.

### MOD-021 - Contact Verification And No-One-Found Flow

Implement:

1. Phone verification status.
2. Contact person present/not present status.
3. Found no one alert.
4. Follow-up task for unreachable contacts.

Safeguards:

1. Do not treat unverified phone as confirmed stakeholder.
2. WhatsApp/Google Contacts integration is future.

### MOD-022 - Dead/Lost Site Closure And Direction Link

Implement:

1. Dead/lost status with reason.
2. Manager approval for closure if required.
3. Get Direction link from stored GPS.
4. Hide dead/lost from active lists by default.

Safeguards:

1. Closed site should not receive new quotation/order unless reopened.
2. Reopen requires reason and audit.

---

## 6. Phase 4 - Stakeholder Master And Billing Party Controls

### MOD-023 - Stakeholder Master

Implement:

1. Reusable stakeholder record.
2. Link stakeholder to multiple sites if valid.
3. Material scope and billing-party role.
4. Phone validation and verified phone lock.
5. Duplicate same-phone rules.
6. Audit for role, phone, and billing changes.

Safeguards:

1. Billing party must be clearly selected before finance/ledger flow.
2. Verified phone should not be silently changed.
3. Same phone across different stakeholders/sites should trigger review.
4. GST/PAN can be collected here when available, but not forced during first site visit.

Future integration:

1. WhatsApp phone validation.
2. Google Contacts sync.

---

## 7. Phase 5 - Quotation And Final Approval Controls

### MOD-024 - Quotation Pre-Eligibility And Validation

Implement:

1. Quotation eligibility checklist.
2. Rate validation.
3. Duplicate quotation/revision handling.
4. Validity date.
5. Recipient details.
6. Controlled quotation terms.

Safeguards:

1. Prevent quotation without required site/stakeholder context.
2. Latest approved revision must be clear.
3. Expired quotations should not proceed silently to final approval.

### MOD-025 - Quotation Correction Flow

Implement:

1. Correction request.
2. New revision creation.
3. Old revision retained.
4. Correction reason and requester.

Safeguards:

1. Do not overwrite approved quotation.
2. Downstream approvals must link to correct/latest quotation revision.

### MOD-026 - Final Approval Workflow

Implement:

1. Final approval linked to quotation revision.
2. Credit/finance approval status.
3. Multi-channel approval audit.
4. Variation/exception site handling.
5. Material scope.
6. Distance/route review.
7. Manager approve/reject/request correction.
8. Lock after approval.
9. Revision flow after correction.

Safeguards:

1. Duplicate final approval must be blocked.
2. Approved final terms must not be silently edited.
3. Finance-sensitive changes after approval must trigger reapproval.
4. Controlled terms only; free text exceptions require reason.

---

## 8. Phase 6 - Sales Order Request, Finance Handoff, And Order Continuity

### MOD-027 - Sales Order Request And Finance Handoff

Implement:

1. Duplicate Sales Order Request prevention.
2. Structured finance rejection.
3. Correct/resubmit flow.
4. Odoo preflight status.
5. Odoo retry/manual fallback status.
6. Preliminary mix design status.
7. Post-finance lock.
8. Visible SOR number.
9. Sales order request audit timeline.

Safeguards:

1. Finance rejection must have structured reason.
2. Corrected resubmission must keep rejection history.
3. Odoo failure must not lose request data.
4. Manual fallback must be clearly marked.
5. This phase aligns with Accounts Sales Phase 1 but includes broader Sales/Finance handoff behavior.

### MOD-028 - Sales Order Management

Implement:

1. Required date validation.
2. Urgent reason.
3. Receiver phone.
4. Plant lock after confirmation.
5. Quantity initialization.
6. Attachment versioning.
7. Add Schedule vs new/revised order path.
8. Completion/fulfilled status.
9. Open-volume tracking.
10. Non-GST versioning where applicable.

Safeguards:

1. Order quantity and schedule changes need versioning.
2. Plant changes after lock require approval.
3. Add Schedule should not create accidental duplicate order.
4. Open volume should reconcile against dispatched/fulfilled quantities.

### MOD-029 - Order Continuity And Ledger Impact

Implement:

1. Sales order continuity status.
2. Ledger debit status.
3. Payment received and outstanding balance.
4. Order exposure contribution to credit calculation.

Safeguards:

1. Active order exposure must feed credit availability.
2. Ledger impact must be visible to Accounts.
3. Do not generate statutory invoices here unless integration phase is complete.

---

## 9. Phase 7 - Map View And Field Visibility

### MOD-030 - Agent Map View

Implement:

1. `/agent/map` page.
2. `/api/sites/map` endpoint.
3. Role-based access.
4. Show only valid coordinates.
5. Hide dead/lost sites by default.
6. Popup with site/lead summary.
7. Filters for status/date/agent/area where supported.
8. Directions link.

Safeguards:

1. Map visibility must obey role permissions.
2. Invalid coordinates must not render misleading pins.
3. Map pin is not proof of visit by itself.
4. Dead/lost visibility should be opt-in filter.

---

## 10. Phase 8 - Integration And Future Work

These should not block immediate application safeguards.

### Bank/UPI Reconciliation

Future:

1. Auto-match UTR.
2. Bank statement import/API.
3. Reconciliation confidence score.

Immediate replacement:

1. Manual payment proof entry.
2. Accountant verification.
3. Difference calculation.

### GST API Verification

Future:

1. Live GSTIN lookup.
2. Legal name and address auto-verify.
3. PAN extraction and active/inactive status.

Immediate replacement:

1. Manual GST verification checklist.
2. GST certificate upload.
3. Duplicate ledger matching.

### PO/PDC OCR

Future:

1. OCR reads PO/PDC.
2. Auto-match quantity, rate, date, customer, and amount.

Immediate replacement:

1. Upload required.
2. View document.
3. Manual verify.
4. Accountant remarks.
5. Manager exception if missing.

### Odoo/Tally Two-Way Sync

Future:

1. Ledger sync.
2. Sales order sync.
3. Debit/payment sync.
4. Retry queue.

Immediate replacement:

1. Store internal statuses.
2. Store external reference fields where available.
3. Manual fallback status.

### Statutory IRN/QR/E-Way Generation

Future:

1. IRN generation.
2. QR code generation.
3. E-way bill generation.
4. Legal/GSP backend integration.

Immediate replacement in Accounts Sales:

1. Status only:
   - `IRN_PENDING`
   - `IRN_GENERATED`
   - `EWAY_BILL_PENDING`
   - `EWAY_BILL_GENERATED`

### External SMS/WhatsApp OTP

Future:

1. SMS OTP.
2. WhatsApp OTP.
3. Delivery/read status.

Immediate replacement:

1. Current in-app OTP can remain.
2. OTP audit should store sent/verified timestamps.

### Google Contacts / WhatsApp Contact Verification

Future:

1. Google Contacts lookup/sync.
2. WhatsApp existence check.

Immediate replacement:

1. Manual phone verification status.
2. Verified phone lock.
3. Duplicate phone warning.

---

## 11. Testing Plan

### Accounts Sales Tests

1. Reimbursement cannot send OTP before cash voucher.
2. Reimbursement cannot mark PAID before agent receipt confirmation.
3. Partial reimbursement keeps outstanding amount and claim open.
4. Hold/reject/full/partial require accountant remarks.
5. Finance checklist blocks ledger approval until complete.
6. Manual payment verification calculates difference.
7. GST client routes to Odoo/GST ledger path.
8. Non-GST client routes to internal ledger path.
9. Duplicate GST/ledger match requires link or override decision.
10. Missing PO/PDC blocks without manager exception.
11. Over-limit/overdue blocks without manager override.
12. Available credit uses credit limit minus outstanding minus active order exposure.
13. Final Sales Order checklist blocks create until complete.
14. Changing order-critical field invalidates completed checklist.
15. Sales Order preview hash prevents silent changes.
16. Pipeline displays statuses without enabling production/statutory generation.

### Living Document Regression Tests

1. Odometer duplicate image detection.
2. One START and one END proof per day.
3. Claimed day lock and correction versioning.
4. Continuity mismatch flag.
5. Incomplete day flag.
6. Late upload flag.
7. Site duplicate warning without forcing GST/PAN at first visit.
8. One active visit per agent.
9. Visit edit audit preserves original proof.
10. Stakeholder duplicate phone warning.
11. Quotation revision and correction history.
12. Final approval lock and reapproval trigger.
13. Sales Order Request duplicate prevention.
14. Finance rejection/correct/resubmit history.
15. Order schedule vs revised order distinction.
16. Map hides invalid/dead/lost records by default.

### Security And Permission Tests

1. Agent cannot approve own reimbursement.
2. Accountant cannot perform manager-only credit override.
3. Manager exception requires reason.
4. Read-only pipeline fields reject unauthorized updates.
5. Audit records are not editable by normal users.
6. Attachments cannot be overwritten without version history.

---

## 12. Traceability Matrix

| Reference | Phase | Implementation Area | Immediate Or Future |
| --- | --- | --- | --- |
| Accounts Sales - Reimbursements | Phase 1 | Voucher, OTP, payment states, partial outstanding | Immediate |
| Accounts Sales - Create New Ledger | Phase 1 | Finance checklist, payment verification, GST/non-GST ledger path | Immediate |
| Accounts Sales - Credit Control | Phase 1 | Credit limit, overdue block, available credit, manager override | Immediate |
| Accounts Sales - Create Sales Order | Phase 1 | Final checklist, mix-design readiness, preview/download | Immediate |
| Accounts Sales - Pipeline | Phase 1 | Accounts visibility columns only | Immediate |
| Accounts Sales - Automation | Phase 1/8 | Immediate manual controls now, external automation later | Mixed |
| MOD-001 | Phase 2 | Odometer manual reading/OCR/discard | Immediate |
| MOD-002 | Phase 2 | Odometer GPS preservation | Immediate |
| MOD-003 | Phase 2 | Odometer metadata/audit | Immediate |
| MOD-004 | Phase 2 | Duplicate odometer image hash | Immediate |
| MOD-005 | Phase 2 | START/END uniqueness | Immediate |
| MOD-006 | Phase 2 | Batch past odometer upload | Immediate |
| MOD-007 | Phase 2 | Incomplete day detection | Immediate |
| MOD-008 | Phase 2 | Claimed day lock | Immediate |
| MOD-009 | Phase 2 | Claimed day reopen/edit control | Immediate |
| MOD-010 | Phase 2 | Odometer correction versioning | Immediate |
| MOD-011 | Phase 2 | Missing odometer watermark/status | Immediate |
| MOD-012 | Phase 2 | Odometer continuity check | Immediate |
| MOD-013 | Phase 2 | Daily travel summary | Immediate |
| MOD-014 | Phase 2 | Reimbursement-proof linkage | Immediate |
| MOD-015 | Phase 3 | Captured date mapping | Immediate |
| MOD-016 | Phase 3 | GPS review/manager flow | Immediate |
| MOD-017 | Phase 3 | One active visit per agent | Immediate |
| MOD-018 | Phase 3 | Duplicate lead/site check | Immediate |
| MOD-019 | Phase 3 | Editable audio/text with audit | Immediate |
| MOD-020 | Phase 3 | Site/lead search before creation | Immediate |
| MOD-021 | Phase 3/8 | Contact verification now, WhatsApp/Contacts later | Mixed |
| MOD-022 | Phase 3 | Dead/lost closure and directions | Immediate |
| MOD-023 | Phase 4/8 | Stakeholder master now, contact integrations later | Mixed |
| MOD-024 | Phase 5 | Quotation pre-eligibility/validation | Immediate |
| MOD-025 | Phase 5 | Quotation correction/revision | Immediate |
| MOD-026 | Phase 5 | Final approval and finance-sensitive locks | Immediate |
| MOD-027 | Phase 6/8 | Sales Order Request, finance handoff, Odoo fallback | Mixed |
| MOD-028 | Phase 6 | Sales Order Management | Immediate |
| MOD-029 | Phase 6 | Order continuity and ledger impact | Immediate |
| MOD-030 | Phase 7 | Agent map view | Immediate |

---

## 13. Recommended First Build Batch

Build Batch A should focus only on Accounts Sales P1 because it is the clearest immediate business value and does not require waiting for external integrations.

Batch A order:

1. Add enums, audit helpers, checklist storage, attachment versioning basics.
2. Implement reimbursement status chain and cash voucher before OTP.
3. Implement reimbursement partial payment/outstanding history.
4. Implement finance verification checklist.
5. Implement manual payment verification panel.
6. Implement GST/non-GST ledger decision and duplicate matching UI.
7. Implement credit limit and over-limit/overdue block.
8. Implement PO/PDC exception approval.
9. Implement final Sales Order checklist.
10. Implement mix-design readiness visibility.
11. Implement Sales Order preview/download.
12. Implement expanded Accounts Sales pipeline visibility.
13. Add tests for each blocker and exception path.

Build Batch B should then harden odometer/reimbursement source data using MOD-001 through MOD-014, because it protects reimbursement correctness and reduces Accounts disputes.

Build Batch C should handle site/lead/stakeholder/quotation/final approval safeguards using MOD-015 through MOD-026.

Build Batch D should complete Sales Order Request, Sales Order Management, order continuity, and map view using MOD-027 through MOD-030.

Build Batch E should add external integrations only after internal workflow states, audits, and manual fallbacks are stable.

---

## 14. Non-Negotiable Safeguards

1. No approval without stored checklist or stored exception.
2. No exception without reason, approver, timestamp, and scope.
3. No proof overwrite without version history.
4. No reimbursement closure when balance remains outstanding.
5. No OTP before cash voucher in reimbursement.
6. No paid reimbursement before agent receipt confirmation.
7. No GST customer forced into non-GST internal ledger path.
8. No non-GST customer forced into statutory GST ledger path.
9. No sales order creation with incomplete final checklist.
10. No over-limit or overdue sales order without manager/higher approval.
11. No first site visit GST/PAN requirement.
12. No duplicate lead/site/ledger creation without warning and override reason.
13. No production/statutory implementation hidden inside Accounts Sales pipeline visibility.
14. No external integration dependency blocking immediate manual control implementation.
