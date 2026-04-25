# Phase 2 Checkpoint

Saved: 2026-04-25

This note records the current saved state after the Phase 2 commercial workflow implementation.

## Current live baseline

- app is running on `http://localhost:3005`
- login is enabled
- Firestore app-state is active
- uploads are local runtime uploads
- OCR remains Gemini-only
- unrelated OCR, reimbursement, attendance, login, and tracking logic was not intentionally changed in this phase

## Completed in Phase 1

- lead to site foundation
- upgraded site visit flow
- instant price calculator

See:

- `handoff/project-handoff-2026-04-23/PHASE_1_CHECKPOINT_2026-04-25.md`

## Completed in Phase 2

### Agent dashboard

- upgraded final approval request flow
- lead + site selection for approvals
- up to 3 grade and price rows
- mix design type
- one-way distance
- traffic count
- casting type
- payment type and payment terms
- rule enforced:
  - `NORMAL` payment type always forces `ADVANCE`

### Sales order / SLA request flow

- sales order now starts only from approved final approvals
- approved commercial fields auto-fill from the approval
- grade is selected from approved grade rows
- amount rule implemented:
  - `quantity * approved price`
  - plus `8000` pump charge when quantity is below `30 CUM`
- receiver name and phone added
- slump added
- PO and PDC uploads added where required
- payment confirmation added for advance-payment cases
- request now goes first into finance verification

### Accounting / finance flow

- added commercial order verification section inside accounting workspace
- finance can verify or reject sales order requests
- accounting dashboard now shows finance queue count

### Production schedule flow

- added `Create request to add in schedule` on the agent side
- finance-verified orders can be sent into schedule approval
- manager `orders` workspace now acts as the production schedule approval surface
- manager can approve or reject schedule requests

## Important design choice used in this phase

- a brand-new production-manager auth role was not introduced
- the existing `MANAGER` role is currently handling production schedule approval

## Not implemented yet

- informal quotation workflow
- DOCX generation
- quotation approval and email/download flow
- dedicated production-manager role
- dedicated finance-head role beyond the finance verification surface already added

## Main files changed in Phase 2

- `src/lib/types.ts`
- `src/lib/commercial.ts`
- `src/lib/db.ts`
- `src/lib/repository.ts`
- `app/api/approval-requests/route.ts`
- `app/api/sales-order-requests/route.ts`
- `app/api/sales-order-requests/[id]/route.ts`
- `app/api/sales-order-requests/[id]/finance-review/route.ts`
- `app/api/sales-order-requests/[id]/schedule/route.ts`
- `src/components/agent/CommercialRequestCards.tsx`
- `src/components/agent/AgentActions.tsx`
- `src/components/manager/ManagerActions.tsx`
- `src/components/manager/ManagerSalesOrderActions.tsx`
- `src/components/manager/ManagerSectionNav.tsx`
- `src/components/accounting/AccountingSalesOrderVerification.tsx`
- `src/components/accounting/AccountingWorkspace.tsx`
- `app/accounting/page.tsx`
- `app/manager/page.tsx`
- `app/manager/orders/page.tsx`
- `tests/commercial.test.ts`

## Verification completed

- TypeScript passed
- tests passed: `16/16`
- production build passed
- page checks passed:
  - `/agent`
  - `/accounting`
  - `/manager/orders`

## Best restart point later

If the next chat should continue from here:

1. read `handoff/project-handoff-2026-04-23/PHASE_2_CHECKPOINT_2026-04-25.md`
2. then read `handoff/project-handoff-2026-04-23/AGENT_WORKFLOW_IMPROVEMENT_PLAN_2026-04-25.md`
3. then inspect the live code in:
   - `src/lib/types.ts`
   - `src/lib/repository.ts`
   - `src/components/agent/CommercialRequestCards.tsx`
   - `src/components/accounting/AccountingSalesOrderVerification.tsx`
   - `src/components/manager/ManagerSalesOrderActions.tsx`

## Recommended next phase

- implement informal quotation workflow
- then optionally separate production approval into its own dedicated role/page if needed
