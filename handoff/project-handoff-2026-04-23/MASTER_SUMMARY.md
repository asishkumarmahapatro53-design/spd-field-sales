# Master Summary

This project is a mobile-first internal SPD Field Sales web app built in `Next.js + TypeScript` with three working role areas:

- `Sales Agent`
- `Manager`
- `Accounting`

The current live persistence mode is:

- `Firestore app-state document` for structured data
- `local uploads` for photos
- `Gemini-only OCR` for odometer reading extraction

## What has been built

### Sales Agent

- login/workday session flow
- start/end odometer capture
- OCR-driven reading extraction
- agent confirmation and manager review path
- site visit capture
- lead tracking and follow-up flow
- approval request flow
- sales/SLA order request flow
- help/correction request flow
- reimbursement summary view
- reimbursement claim request flow

### Manager

- overview command center
- plant switcher
- clean section-based workspace design instead of one long cluttered dashboard
- dedicated pages for approvals, orders, verifications, corrections, targets, tasks, and tracking
- event-based sales-agent day tracking with date selector
- profitability index / plant and site-wise performance view

### Accounting

- improved dashboard layout
- department-style workspace sections
- reimbursement ledger flow
- pending claim handling
- OTP-based payout confirmation for reimbursement claims
- outstanding amount calculation
- export support

## Most important logic decisions

- login can be toggled, but current live mode has login enabled
- reimbursement uses:
  - `fuel = distance * 4.5`
  - `lunch = 150`
  - `total = fuel + lunch`
- OCR accepts `ODO`, `TOTAL`, and `TRIP`
- OCR ignores speed/range/GPS overlay text
- low-confidence OCR goes to manager review
- photo timestamp is taken from GPS/dashboard timestamp when possible
- historical uploads are allowed and can create/use older sessions
- future-dated dashboard photos are rejected
- manager tracking is based on event captures, not continuous background GPS
- accountant payout verification uses OTP before marking claims as paid

## Current active testing baseline

- local URL: `http://localhost:3005`
- login enabled
- users kept for testing:
  - Ravi Sharma
  - Prasana Dash
  - Amit Parida
  - Anita Verma
  - Karan Gupta

## Current cleanup status

The uploaded runtime data has already been cleared:

- uploaded photos removed
- runtime workday/readings/site-visit/claim/audit test data removed
- code left unchanged

## Where to continue next

The best next focus is OCR improvement, especially:

- better meter reading extraction
- stronger timestamp extraction
- more reliable handling of difficult dashboard photos

Read these next if a new chat continues the work:

- `PROJECT_SUMMARY.md`
- `CURRENT_LOGIC.md`
- `NEXT_CHAT_START.md`
