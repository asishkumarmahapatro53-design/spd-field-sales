# Agent Workflow Improvement Plan

Saved: 2026-04-25

This note captures the planned improvements discussed from:

- `C:\Users\USER\Downloads\spd product photo\impv  in agents dashbord.pdf`

No implementation has been done from this plan yet. This is a saved planning document only.

## Planning status

- Current app behavior remains unchanged.
- No code was modified as part of this planning discussion.
- Work is intentionally on hold until the user gives explicit approval to implement.

## Scope rule

Only the workflows mentioned in the improvement document should be changed.

Related dashboards may be updated only where they are directly required by those workflows:

- Agent dashboard
- Manager / sales manager approval flow
- Accounts / finance verification flow
- Production manager schedule-approval flow

Do not change unrelated OCR, reimbursement, login, attendance, tracking, or dashboard sections unless one of the approved workflow changes depends on it.

## Main architectural conclusion

The current app treats a lead and a site almost like the same record. The requested flow needs a cleaner structure:

- one lead can have multiple sites
- an existing lead can open:
  - a new site
  - an existing site
- site-specific location verification and visit history must be preserved

Because of that, the implementation should start with a small data-model upgrade before changing the agent forms.

## Planned sections

### 1. Foundation

- add a cleaner lead-to-site structure
- preserve existing lead follow-up, score, and stage behavior
- add workflow states needed for quotation, approval, sales order, and schedule requests

### 2. Agent Dashboard: Site Visit flow

- refactor the site visit form into:
  - new lead
  - existing lead
- for existing lead:
  - create new site
  - choose existing site
- capture agent location automatically
- extract site address from the GPS watermark on the site visit photo
- add location verification for existing sites using extracted coordinates and a 100m radius rule
- replace the free-text stakeholder block with structured stakeholder selection
- allow adding new stakeholders to an existing site
- support typed remarks or voice-note remarks
- transcribe voice notes in Indian languages into English text after submit
- auto-suggest lead stage and next follow-up, while allowing agent override
- add a `Get direction` action in Lead Focus for saved sites

### 3. Agent Dashboard: Instant Price

- add a dedicated instant-price button/calculator
- inputs:
  - distance from plant
  - quantity in CUM
  - concrete grade
  - number of traffic
- output formula:
  - base price of selected grade
  - `+ (15 * number of traffic)`
  - `+ ((distance from plant - 12) * 13)`
- base prices:
  - `M10 = 3500`
  - `M15 = 3750`
  - `M20 = 3900`
  - `M25 = 4047`
  - `M30 = 4227`
  - `M35 = 4467`
  - `M40 = 4667`

### 4. Agent Dashboard: Informal quotation

- add a `Create informal quotation` action
- choose lead and site
- add up to 3 grades with prices
- add company name, person name, email, and one-way distance
- generate quotation in DOCX format
- send the quotation first for manager approval
- after approval, allow:
  - share by email
  - download
- if rejected, allow edit and resubmit

### 5. Agent Dashboard: Final approval request upgrade

- select lead and site
- auto-fetch site address
- support up to 3 concrete grades and prices
- include mix design type
- include client name
- include one-way distance from plant
- include casting type
- include payment terms
- include payment type
- rule:
  - if payment type is `normal`, payment terms must always be `advance`

### 6. Agent Dashboard: Sales order request upgrade

- select only approved final approvals
- choose priority:
  - urgent
  - normal
- auto-fetch from approval:
  - customer name
  - site address
  - distance
  - number of traffic
  - payment type
  - payment terms
  - mix design type
- choose approved grade and auto-fetch its approved price
- add receiver name and phone number
- upload PO and PDC where required
- add quantity
- add required slump
- confirm full payment receipt where required
- amount rule:
  - `quantity * approved price`
  - plus `8000` pump charge if quantity is below `30 CUM`

### 7. Accounts / finance workflow tied to the sales order request

- after agent submit, request goes to the accounts/finance verification stage
- verify:
  - PO
  - PDC
  - payment received
- after verification, forward to the accountant/accounts dashboard for ledger and sales-order handling

This section should only include the minimum dashboard/workflow additions required to support the document.

### 8. Production schedule workflow

- add a `Create request to add in schedule` action
- select an approved sales order
- add date, time, receiver name, and phone number
- send to production manager for approval
- if approved, continue to the accountant/accounts flow
- if rejected, agent may edit or delete the request

## Recommended implementation order

1. Foundation
2. Site Visit flow
3. Instant Price
4. Final approval request upgrade
5. Sales order request upgrade
6. Production schedule request
7. Informal quotation workflow

## Why this order

- Foundation is required so the lead/site logic does not become brittle.
- Site Visit must be upgraded before downstream lead/site-specific actions.
- Instant Price is isolated and low risk.
- Final approval and sales order flows depend on clean lead/site selection.
- Quotation is last because it introduces the most new moving parts:
  - DOCX generation
  - manager approval
  - email/download behavior

## Allowed related dashboard changes

The user later clarified that related sections may also be updated, but only in the contexts directly connected to the planned workflows above:

- manager / sales manager approval views
- accounts / finance verification views
- production manager schedule approval views

This does not authorize unrelated HR, finance, manager, or accounting redesign work outside those flows.

## Guardrails for future implementation

- do not touch unrelated sections
- do not redesign unrelated dashboards
- do not change working OCR behavior unless one of the approved workflow sections directly requires it
- do not modify reimbursement, login, attendance, or tracking flows as part of this work
- take an incremental approach and review each phase before widening scope

## Best restart point later

When this work resumes, start from:

1. this file
2. `CURRENT_LOGIC.md`
3. the current live code in:
   - `src/components/agent/AgentActions.tsx`
   - `app/api/site-visits/route.ts`
   - `app/api/approval-requests/route.ts`
   - `app/api/sales-order-requests/route.ts`
   - `src/lib/repository.ts`
   - `src/lib/types.ts`

## Final note

This plan has been saved, but implementation is intentionally paused until the user explicitly asks to continue.
