# SPD Field Sales App Status

Last updated: 2026-04-22

## Current state

- Project type: `Next.js + TypeScript` internal web app
- Data mode: `Firebase Firestore` enabled
- Upload mode: `local file storage` enabled
- OCR mode: `Gemini API` enabled
- Auth mode for local testing: `login disabled` with dashboard role switcher
- Prisma schema exists, but runtime is currently using the repository layer instead of Prisma

## Working setup

- Firestore project: `spd-appilation`
- Firestore database id: `spddata`
- Firebase service account is configured through `.env.local`
- Local uploads are saved under `public/uploads`
- Gemini API key is present in `.env.local`
- `DISABLE_LOGIN="true"` is enabled in `.env.local`

## Implemented features

- Role-based dashboards:
  - Sales Agent
  - Manager
  - Accounting
- Login/logout flow with workday session start and end
- Odometer upload with required `START` / `END` type
- OCR extraction workflow with status handling:
  - `AWAITING_CONFIRMATION`
  - `MANUAL_REVIEW_REQUIRED`
  - `CONFIRMED`
  - `MANUAL_VERIFIED`
- Persistent confirmation UI from the reading log
- Site visit entry and lead tracking
- Approval request workflow
- Help/correction request workflow
- Manager verification queue
- Manager approval summary popup
- Accounting reimbursement ledger and export
- Small header dashboard switcher for Agent / Manager / Accounting during local testing

## OCR behavior now

- OCR provider: Gemini image understanding via API key
- Rules currently tuned for:
  - digital `ODO`
  - digital `TOTAL`
  - `TRIP`
  - analog/mechanical odometer images
- `TRIP` readings are allowed and are not auto-rejected
- OCR ignores:
  - speed values
  - time/clock
  - GPS watermark text
  - dial scale numbers
- If OCR is uncertain, the reading falls back to manual review

## Firebase/storage decision

- Firestore is real and active
- Firebase Storage is not being used right now
- Reason: project Storage requires upgrade from Spark plan
- Chosen workaround: keep real Firestore, store uploaded files locally

## Latest verified app state

- Production build passes
- App is running locally on `http://localhost:3005`
- Gemini OCR smoke tests succeeded on sample dashboard images
- Persistent confirmation buttons were added to `Daily Logs`
- Login is bypassed for testing and dashboards can be switched from the header
- Manager approval popup now opens as a page-level portal instead of inside the card layout
- Latest manager popup issue fixed:
  - overlap with lower cards
  - dashboard freeze when opening

## Current dev server

- Current local app URL:
  - `http://localhost:3005`
- Server mode:
  - production build via `next build` + `next start`
- Reason:
  - this was more stable than the earlier dev servers that kept dying or hitting stale cache issues

## Important files

- App status snapshot: `PROJECT_STATUS.md`
- Auth logic and test-mode switch: `src/lib/auth.ts`
- Dashboard switcher: `src/components/DashboardSwitcher.tsx`
- Main agent page: `app/agent/page.tsx`
- Agent actions: `src/components/agent/AgentActions.tsx`
- Persistent reading log UI: `src/components/agent/ReadingLogList.tsx`
- Manager workflow UI: `src/components/manager/ManagerActions.tsx`
- OCR logic: `src/lib/ocr.ts`
- Firebase setup: `src/lib/firebase-admin.ts`
- Data layer: `src/lib/db.ts`
- Storage layer: `src/lib/storage.ts`
- Business logic: `src/lib/repository.ts`
- Environment config: `.env.local`

## Known limitations

- Local app still depends on a restarted local server when the machine/session changes
- Firebase Storage is not active yet
- Prisma is not yet the live runtime persistence layer
- OCR confirmation flow is now persistent, but broader notification UX can still be improved later
- One older TypeScript test issue remains in `tests/repository.test.ts` around a missing `mimeType` in test input
- The user-provided popup reference video path existed but the file was `0 bytes`, so that visual reference could not be used

## Good next discussion topics

- better confirmation/notification UX
- richer manager review tools
- polish the manager approval popup further if needed
- cleaner mobile workflow
- stronger OCR validation rules
- Firestore data normalization
- production auth and user management
