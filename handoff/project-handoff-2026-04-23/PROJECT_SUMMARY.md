# Project Summary

## Product goal

Build an internal mobile-first web app for SPD field operations with three roles:

- `Sales Agent`
- `Manager`
- `Accounting`

The app tracks field activity, odometer readings, site visits, leads, approvals, sales/SLA requests, and reimbursement claims.

## Current technical stack

- Frontend/server: `Next.js App Router + TypeScript`
- State/persistence: `Firestore app-state document`
- Local upload storage: `public/uploads`
- OCR: `Gemini API`
- Exports: `CSV + XLSX`
- Tests: `Vitest`

## Current project structure

- `app/`
  Routes, dashboards, and API endpoints
- `src/components/`
  Agent, manager, accounting, and shared UI components
- `src/lib/`
  Auth, OCR, repository logic, database adapter, storage, and types
- `data/`
  Local fallback mock database
- `tests/`
  Unit tests

## Implemented user-facing areas

### 1. Sales Agent dashboard

Implemented:

- login-based workday flow
- workday session start/end
- odometer start/end upload
- OCR result handling
- manager fallback when OCR confidence is low
- compact daily logs section
- reimbursement summary section
- claim request section
- site visit entry
- lead follow-up view
- approval request flow
- sales/SLA order request flow
- help/correction request flow

Important behavior:

- reimbursement labels were cleaned up so the summary reads more like verified/awaiting verification rather than raw open-state wording
- the daily logs area was made more compact
- existing leads can be reused during site visit entry instead of forcing a new lead every time

### 2. Manager dashboard

The manager dashboard was reworked away from one long cluttered page and into focused workspaces/pages.

Implemented:

- overview dashboard with summary metrics
- plant switcher and plant performance snapshot
- live sales agent tracking workspace
- pending approvals workspace
- sales/SLA orders workspace
- manual verification workspace
- correction requests workspace
- target-setting workspace
- task assignment workspace
- live profitability index / site-wise profitability section

Important behavior:

- manager review details were moved away from awkward vertical inline expansion and toward cleaner focused workspaces
- sales agent tracking is event-based and date-based, not continuous GPS

### 3. Accounting dashboard

Accounting was expanded beyond a plain ledger table.

Implemented:

- department-based workspace sections
- sales reimbursement handling
- pending reimbursement claims
- OTP send/verify flow for agent payout confirmation
- reimbursement ledger view
- outstanding amount calculation
- export support

Departments discussed and represented in the accounting UI:

- `Sales`
- `Production`
- `HR`
- `Labor`

The strongest implemented logic is currently around the sales reimbursement workflow.

## Authentication and users

Current auth mode:

- login is enabled because `DISABLE_LOGIN="false"` in `.env.local`

Known active test users in live app-state:

- `SA1001` - Ravi Sharma - Sales Agent
- `SA1002` - Prasana Dash - Sales Agent
- `SA1003` - Amit Parida - Sales Agent
- `MG2001` - Anita Verma - Manager
- `AC3001` - Karan Gupta - Accounting

## Persistence and runtime mode

Current mode:

- Firestore is active for app-state
- Firebase Storage is not active
- uploads are stored locally because Spark-plan storage limitations blocked the full Firebase Storage path

This means:

- structured app data is real and persistent in Firestore
- uploaded images are local to the machine running the app

## Current OCR decision

The OCR path has been tested with multiple providers during development, but the current live code is:

- `Gemini-only OCR`

Reason:

- earlier Google Vision attempts hit `403` due to provider setup
- OpenAI/other fallback experiments were unstable or intentionally removed
- the current working baseline is Gemini plus local filename timestamp fallback

## Current status after cleanup

As of 2026-04-23:

- uploaded runtime test photos have been deleted
- runtime test records have been cleared from the live Firestore app-state
- code and logic were left intact

The project is now in a clean state for fresh testing and further logic improvements.
