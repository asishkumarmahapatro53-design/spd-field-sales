# Current Logic

This file describes the logic that is active in the codebase now.

## 1. Authentication logic

Main file:

- `src/lib/auth.ts`

Current behavior:

- if `DISABLE_LOGIN="true"`, the app uses demo-role switching with cookies
- if `DISABLE_LOGIN="false"`, the app uses employee ID + password login
- successful login creates an auth session token stored in Firestore app-state
- logout deletes the token and related cookies

Current live mode:

- login enabled

## 2. Data persistence logic

Main files:

- `src/lib/db.ts`
- `src/lib/firebase-admin.ts`

Current behavior:

- if Firebase is configured, app-state is stored in one Firestore document
- collection and document are driven by env vars:
  - `FIREBASE_APP_STATE_COLLECTION`
  - `FIREBASE_APP_STATE_DOC`
- if Firebase is not configured, the app falls back to `data/mock-db.json`

Normalization behavior in `src/lib/db.ts`:

- ensures default plants exist
- ensures plant IDs exist on sessions/leads/tasks/requests
- ensures reimbursement claim OTP-related fields exist
- keeps seeded operational structures ready even if data is partially missing

## 3. Upload and storage logic

Main file:

- `src/lib/storage.ts`

Current behavior:

- local uploads are stored under `public/uploads`
- Firebase Storage exists in code, but is not active now because `FIREBASE_USE_STORAGE="false"`
- local upload URLs are served through the app under `/uploads/...`

## 4. Odometer OCR logic

Main file:

- `src/lib/ocr.ts`

Current live OCR path:

- `Gemini OCR`
- then local filename/timestamp fallback only
- then manager review if needed

### What Gemini is asked to extract

- `reading_kind`: `ODO | TOTAL | TRIP | UNKNOWN`
- `reading_value`
- `captured_at_ist`
- `confidence`
- `note`

### OCR rules currently encoded

- `ODO`, `TOTAL`, and `TRIP` are all accepted as valid reading kinds
- range values such as `27 km`, `63 km`, or `97 km` must not be mistaken for odometer values
- `0 km/h` speed should be ignored
- GPS watermark text, coordinates, and place names should be ignored as meter readings
- analog dashboards should use the rolling odometer, not the speed dial
- GPS Map Camera watermark date/time should be used when visible
- India watermark dates like `06/04/2026` are treated as `DD/MM/YYYY`

### Filename fallback behavior

If Gemini is unavailable or incomplete:

- filename parser tries to recover capture timestamp from names like `20260120_104425AMByGPSMapCamera.jpg`
- filename parser can also recover meter values only if they exist in the filename text

### Current OCR acceptance behavior

In `src/lib/repository.ts`:

- accepted reading kinds: `ODO`, `TOTAL`, `TRIP`
- confidence threshold: `0.55`

If OCR finds a valid meter value and confidence is at least `0.55`:

- reading is created with status `AWAITING_CONFIRMATION`
- `finalValue` is filled

If OCR finds no valid meter value or confidence is low:

- reading is created with status `MANUAL_REVIEW_REQUIRED`
- `finalValue` stays `null`
- it remains visible in agent history and also goes to manager review

## 5. Timestamp and past-date upload logic

Main file:

- `src/lib/repository.ts`

This was a major logic improvement.

Current behavior:

- the app tries to use the dashboard watermark timestamp instead of blindly treating every upload as "today"
- if the extracted capture time is invalid, upload fails
- if the extracted capture time is more than 10 minutes in the future, upload fails

Past-date logic:

- if the reading belongs to an earlier date, the app can create or reuse a session for that historical date
- if the reading is for today and there is no extracted timestamp, the agent must already have started the workday

This prevents false reimbursement dates and supports uploading older dashboard photos after the fact.

## 6. Workday session logic

Main repository behavior:

- login or explicit start opens a `WorkdaySession`
- logout or end reading can close/update the session
- office in = `loginAt`
- office out = `logoutAt`

Location capture is event-based only:

- login location
- odometer reading location
- site visit location
- logout location

There is no continuous background tracking in the web app.

## 7. Site visit and lead logic

Main file:

- `src/lib/repository.ts`

Current behavior:

- site visit creation requires an open session
- visit photo is uploaded
- if `leadId` exists, the visit updates that lead
- if `leadId` does not exist, a new lead is created

Lead fields updated from a visit include:

- site name
- site address
- score
- stage
- next follow-up
- supplier
- price expectation
- future scope
- current grade
- current quantity
- stakeholder-derived contractor/builder/supervisor information

This supports the requested "reuse old lead data, only update what changed" workflow.

## 8. Reimbursement summary logic

Main file:

- `src/lib/repository.ts`

Computed rules:

- `totalDistance = endReading - startReading`
- negative values are clamped to `0`
- `lunchAmount = 150`
- `fuelAmount = totalDistance * 4.5`
- `totalAmount = fuelAmount + lunchAmount`
- `totalSiteVisits = number of site visits in that session`

Summary status logic:

- `CONFIRMED`
- `PENDING`
- `MANUAL_VERIFIED`
- `OPEN`

Agent UI wording was adjusted so the summary reads more naturally, for example:

- `Verified by agent`
- `Awaiting verification`
- `Manager verified`

## 9. Reimbursement claim logic

Main file:

- `src/lib/repository.ts`

Current behavior:

- only verified and unpaid summaries can be claimed
- already-paid dates are excluded using the last paid-through date
- one active open claim per agent is enforced

Claim records contain:

- line items by day
- total distance
- fuel amount
- lunch amount
- total amount

## 10. OTP payout verification logic

Main file:

- `src/lib/repository.ts`

Current behavior:

- accountant sends OTP for a reimbursement claim
- claim status becomes `OTP_SENT`
- OTP TTL is `10 minutes`
- claim is marked `PAID` only after correct OTP verification

This matches the requested "payment confirmation before future claims are accepted" flow.

## 11. Manager tracking logic

Main file:

- `src/components/manager/ManagerTrackingWorkspace.tsx`

Current behavior:

- manager selects a plant
- manager selects a date
- manager selects one agent from roster
- app shows that agent's day summary in a focused page

Displayed tracking details include:

- latest captured location
- login time
- first site visit time
- number of sites visited
- last site visit time
- start reading
- end reading
- total distance
- office out time
- ordered event timeline

Important rule:

- this is based on captured events only
- it is not continuous live GPS tracking

## 12. Manager profitability logic

Main files:

- `src/components/manager/ManagerProfitabilityIndex.tsx`
- `app/manager/page.tsx`

Current behavior:

- overview page includes plant-wise and site-wise profitability display
- it uses plants, leads, approvals, site visits, material cost snapshots, and price benchmarks
- this is the current implementation of the requested live profitability section

## 13. Accounting workspace logic

Main files:

- `app/accounting/page.tsx`
- `src/components/accounting/AccountingWorkspace.tsx`

Current behavior:

- department-based view
- pending claims section
- sales ledger access
- OTP send/verify actions
- outstanding amount summary
- reimbursement table per agent/day

The sales reimbursement logic is the most complete operational accounting flow right now.

## 14. Current important limitations

- OCR is working, but still needs more tuning on difficult dashboards
- current OCR provider chain is intentionally simplified to Gemini-only
- app-state is stored in one Firestore document, which is fine for testing but not ideal for larger production scale
- local uploads mean files stay on the local machine instead of durable cloud storage
- continuous live GPS tracking is not implemented
- Prisma schema exists, but runtime is still using the repository/app-state layer rather than Prisma as the live persistence path
