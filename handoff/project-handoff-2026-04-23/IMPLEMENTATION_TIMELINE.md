# Implementation Timeline

This is a practical summary of the major project changes requested and implemented during this build cycle.

## Phase 1 foundation

- planned the app from the SPD workflow document
- built the app as a `Next.js + TypeScript` internal web app
- created role-based dashboards for:
  - sales agent
  - manager
  - accounting
- added repository-driven business logic and API routes

## Data and infrastructure changes

- added Firestore-backed app-state
- kept local file uploads because Firebase Storage required a paid upgrade path
- preserved a local file-based fallback mode through `data/mock-db.json`
- added service-account based Firebase admin integration

## Agent dashboard changes

- added workday start/end flow
- added odometer upload with start/end type selection
- added OCR confirmation/review flow
- added compact daily logs
- improved reimbursement summary wording
- added reimbursement claim request section
- added site visit entry with support for existing leads
- added approval request workflow
- added sales/SLA order request workflow
- added help/correction request workflow

## Manager dashboard changes

- replaced one long cluttered page with focused workspace pages
- added overview cards and section navigation
- added plant switcher
- added dedicated pages for:
  - tracking
  - approvals
  - orders
  - verifications
  - corrections
  - targets
  - tasks
- added sales agent day tracking with date selector and event timeline
- restored live site-wise profitability / plant profitability section after it was temporarily lost during cleanup

## Accounting dashboard changes

- cleaned up the merged/unclear accounting layout
- added department-oriented workspace structure
- added reimbursement claim list
- added total outstanding amount display
- implemented OTP-based payment confirmation for sales agent reimbursement claims
- added export support

## Auth and testing mode changes

- temporarily disabled login during design/testing phases
- added dashboard switching for quick local UI checks
- later re-enabled login
- preserved the additional sales agents for testing:
  - Prasana Dash
  - Amit Parida

## OCR evolution

The OCR path went through several experiments:

1. basic/mock OCR stage
2. stricter OCR validation and manager fallback
3. attempts with Google Vision and other external fallbacks
4. rollback to a simpler stable baseline
5. current live mode: `Gemini-only OCR`

Key OCR logic improvements that remain:

- recognize `ODO`, `TOTAL`, and `TRIP`
- ignore speed/range/GPS overlay text
- use GPS watermark date/time when available
- support historical uploads instead of mapping everything to the current day
- send low-confidence results to manager review instead of silently accepting them

## Recent cleanup state

On 2026-04-23:

- all uploaded runtime photos were deleted
- test runtime records were deleted from Firestore app-state
- source code was not changed during the cleanup

The project is now ready for fresh testing and the next round of logic improvements.
