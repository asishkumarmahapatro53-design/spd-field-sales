# Sales Agent Workflow: Current UI And Interaction Detail

Last updated: 2026-05-09

This document describes only the Sales Agent dashboard and sales-agent-facing workflows. It is written as a detailed UI inventory for redesign work.

## Sales Agent Dashboard Route

Route: `/agent`

Required role: `SALES_AGENT`

Main page title: `Sales Agent Dashboard`

Main page subtitle: `Capture readings, track site leads, request approvals, and keep the reimbursement record complete.`

Dashboard status:

| Condition | Status Label |
|---|---|
| Active workday session exists | `WORKDAY_OPEN` |
| No active workday session | `READY` |

Auto refresh:

| Role | Current refresh interval |
|---|---:|
| Sales Agent | 30 seconds |

## Top Shell And Header

The Sales Agent dashboard uses the shared `AppShell`.

### Header / Hero Box

Visible items:

| UI Element | Current Text / Data | Notes |
|---|---|---|
| Role label | `SALES AGENT` | Derived from user role. |
| Main heading | `Sales Agent Dashboard` | Page title. |
| Subtitle | `Capture readings, track site leads, request approvals, and keep the reimbursement record complete.` | Page description. |
| Status badge | `WORKDAY_OPEN` or `READY` | Based on active workday session. |
| User badge | Sales agent name | Example: `Ravi Sharma`. |
| Employee badge | `Employee ID {employeeId}` | Example: `Employee ID SA1001`. |
| Current time badge | India time label | Rendered on server load. |
| Auto-sync badge | `Auto sync HH:MM` or `Syncing...` | Refreshes dashboard automatically. |
| Logout / switch control | Depends on login mode | Uses logout normally, switcher if login is disabled for testing. |

### Metric Cards

Four compact metric cards appear below the header.

| Card | Value | Note |
|---|---|---|
| `Office in` | Active session login time, or `Not started` | `Login becomes the office in time.` |
| `Today's pipeline` | `{pipelineQuantity} CUM` | `Open opportunity volume` |
| `Approved quantity` | `{approvedQuantity} CUM` | `Manager-approved quantity` |
| `Target achievement` | Percentage of approved quantity over current target | Shows `Target {quantity} CUM` or `Waiting for target`. |

## Main Layout

The Sales Agent dashboard has three main body areas:

| Area | Component / Purpose |
|---|---|
| `Action Center` | Main accordion workflow with 8 steps. |
| `Daily Logs` | Readings, task list, site visit logs, reimbursement summaries, payment claim. |
| `Lead Focus` | Top 5 leads with next follow-up and direction link. |

There is also a floating AI assistant button at the bottom/right of the interface.

## Action Center Accordion

The Action Center is the main sales-agent workflow. It is an accordion where only the selected section opens.

Each accordion header contains:

| UI Element | Details |
|---|---|
| Step number | `01` to `08`. |
| Title | Workflow section name. |
| Meta text | Count or short status for that section. |
| Description | Short explanation under title. |
| Indicator | `+` when closed, `-` when open. |
| Trigger button | Whole header is clickable. |

Default open section: `01 Odometer Capture`

### Action Center Sections

| Step | Title | Meta | Description |
|---|---|---|---|
| `01` | `Odometer Capture` | `Start / end photo` | Upload the start or end dashboard photo and confirm the extracted reading. |
| `02` | `Site Visit Entry` | `{leadCount} tracked leads` | Save the site visit details, project notes, and next follow-up in one place. |
| `03` | `Get Instant Price` | `Quick calculator` | Use the saved grade formula to estimate an instant working price for the site. |
| `04` | `Request Informal Quotation` | `{pendingInformalCount} pending` | Prepare up to three grade-wise informal quotation lines for manager approval. |
| `05` | `Raise Approval Request` | `{pendingApprovalCount} pending` | Send negotiated price requests to the manager without leaving the dashboard. |
| `06` | `Create Sales/SLA Order` | `{pendingFinanceCount} in finance queue` | Raise a finance-ready sales order only from manager-approved commercial terms. |
| `07` | `Sales Order Status` | `{accountsOrderQueueCount} with accounts` | Track ledger-created requests while Accounts creates the final sales order. |
| `08` | `Help / Correction Request` | `Correction support` | Ask for support when a day has missing timings, readings, or visit updates. |

## Shared GPS Camera Block

Used in:

| Workflow | Label |
|---|---|
| Odometer Capture | `Take Odometer Photo` |
| Site Visit Entry | `Take Site Visit Photo` |

### Hidden Inputs

| Input | Behavior |
|---|---|
| Camera file input | Uses `accept="image/*"` and `capture="environment"` to open rear camera. |
| Gallery file input | Uses `accept="image/*"` without camera capture to upload existing file. |

### Visible Buttons Before Photo Ready

| Button | Style | Behavior |
|---|---|---|
| `Take Photo` / custom label | Primary button | Opens camera input. |
| `Upload from Gallery` | Secondary button | Opens gallery file picker. |

### Camera State Labels

| State | Button Text |
|---|---|
| `idle` | Provided label, for example `Take Odometer Photo`. |
| `acquiring-gps` | `Getting GPS...` |
| `processing` | `Watermarking...` |
| `ready` | `Photo Ready` |
| `error` | `Retry` |

### Photo Processing Rules

| Source | GPS Behavior | Watermark Behavior |
|---|---|---|
| Camera | Gets live GPS before processing. | Adds watermark with agent, employee ID, date, site, address, coordinates. |
| Gallery | Does not use current live GPS. | Does not add new live watermark; later workflow reads existing photo/watermark if available. |

### Preview Box

Shown after processing succeeds.

Visible items:

| Element | Details |
|---|---|
| Image preview | Shows processed/watermarked file. |
| GPS label | Shows `GPS: lat, lng` when coordinates exist. |
| Gallery label | Shows `Gallery upload - GPS will be read from the photo watermark if available` when gallery file has no live coordinates. |
| GPS warning | Shows `GPS unavailable - location not embedded` if no coordinates. |
| `Retake` button | Clears preview and reopens camera input. |
| `Use This Photo` button | Sends processed file and GPS/source back to parent workflow. |

### Error Text

If photo processing fails:

`Failed to process photo. Please try again.`

## Step 01: Odometer Capture

Purpose: capture start/end odometer reading photo, run OCR, and confirm or send for review.

### Main Form Fields

| Field | Type | Required | Options / Behavior |
|---|---|---|---|
| `Reading type` | Select | Yes | Empty disabled option, `Start reading`, `End reading`. |
| `Odometer Photo` | GPS camera block | Yes | Uses `Take Odometer Photo` and `Upload from Gallery`. |

### Photo Hint

Before photo:

`The app will open your rear camera, capture GPS, and watermark the photo automatically.`

After photo:

`Photo ready: {fileName} ({sizeKb} KB)`

### Upload Size Rules

| Rule | Value |
|---|---:|
| Target compressed size | 450 KB |
| Hard max upload size | 2 MB |
| Max dimension | 1600 px |
| Min dimension | 1000 px |
| Initial quality | 0.72 |
| Minimum quality | 0.38 |

If file remains above hard limit, user sees:

`This photo is still {size} KB after compression. Retake it closer to the odometer so the upload stays under the mobile limit.`

### Main Submit Button

| Button | State |
|---|---|
| `Upload Reading` | Normal submit. |
| `Uploading...` | While uploading. |
| `Refreshing...` | While dashboard refresh is pending. |

Disabled when:

| Condition |
|---|
| Upload is busy. |
| Page refresh is pending. |
| No captured photo exists. |

### API Flow

On submit:

| Step | Details |
|---|---|
| Direct upload | Photo uploads to S3 through `/api/uploads/presign` with purpose `odometer`. |
| Create reading | App posts to `/api/odometer-readings`. |
| Payload includes | Type, S3 key, photo name, MIME type, size, latitude, longitude. |

### OCR Confirmation Box

Shown when reading status is `AWAITING_CONFIRMATION`.

Visible text:

`Extracted value: {ocrValue or Not found}.`

Optional note:

`{verificationNote}`

Buttons:

| Button | Style | API | Result |
|---|---|---|---|
| `Yes, confirm` | Primary | `POST /api/odometer-readings/{id}/confirm` | Moves reading to history as confirmed. |
| `No, send for review` | Danger | `POST /api/odometer-readings/{id}/reject` | Sends reading to manager/manual review. |

Button loading text:

| Button | Loading Text |
|---|---|
| Confirm | `Saving...` |
| Reject | `Saving...` |

### Success Messages

| Condition | Message |
|---|---|
| OCR awaiting confirmation | OCR message or `OCR finished. Confirm the extracted value before it moves into today's log.` |
| OCR still pending | `Upload received. OCR is still processing and will appear in Needs Action soon.` |
| Low confidence/manual review | AI/manual review message or `AI confidence is low or data was missing...` |
| Confirmed | `Reading confirmed and moved to Reading History.` |
| Rejected | `Reading sent to the manager for manual verification.` |

### Validation Errors

| Condition | Error |
|---|---|
| No reading type | `Select whether this is a start or end reading.` |
| No photo | `Please take an odometer photo first.` |
| Upload failure | Actual upload/API error text. |

## Step 02: Site Visit Entry

Purpose: record a site visit, update/create lead and site records, capture stakeholders, photo evidence, GPS, remarks, voice transcript, follow-up, and lead score.

### Visit Flow Box

Fields:

| Field | Type | Options |
|---|---|---|
| `Visit flow` | Select | `Create new lead`, `Existing lead` |
| `Lead` | Select | Visible only when `Existing lead`; shows saved leads by site name. |

Default:

| Condition | Default |
|---|---|
| Leads exist | `Existing lead` |
| No leads exist | `Create new lead` |

### Existing Lead Site Mode Box

Visible only when visit flow is `Existing lead`.

Choice cards:

| Choice | Input Type | Text | Details |
|---|---|---|---|
| `Use existing site` | Radio | `Reuse saved address, location, and stakeholders.` | Disabled if no sites exist under lead. |
| `Create new site` | Radio | `Add another site under the same lead.` | Adds a new site under selected lead. |

### Existing Site Summary Card

Visible when using an existing site.

Visible items:

| Element | Details |
|---|---|
| Site name heading | Saved site name. |
| Site address | Saved site address. |
| Badge | `Saved site` |
| Meta | Supplier, score, last visit date. |
| Site select | Visible if lead has more than one saved site. |

Site select:

| Field | Type | Options |
|---|---|---|
| `Site` | Select | Saved sites under selected lead. |

### New Site Fields

Visible when creating a new lead or new site.

| Field | Type | Required | Behavior |
|---|---|---|---|
| `Site name` | Text input | Yes | Manual entry. |
| `Site address` | Text input | Yes | Auto-filled from GPS/watermark when possible; user can edit. |

Hint:

`This is auto-filled from the site visit photo watermark and can be corrected if needed.`

### Arrival Photo Box

Field:

| Field | Type | Required |
|---|---|---|
| `Arrival photo` | GPS camera block | Yes |

Buttons inside camera:

| Button | Behavior |
|---|---|
| `Take Site Visit Photo` | Captures live photo, live GPS, watermark. |
| `Upload from Gallery` | Uploads past photo and expects readable watermark metadata. |
| `Retake` | Clears and reopens camera. |
| `Use This Photo` | Confirms selected photo. |

Hint before photo:

`Use the in-app GPS camera so the photo carries address, date, and coordinates for extraction.`

Hint after photo:

`Photo ready: {fileName} ({sizeKb} KB)`

### Site Photo Analysis Box

After photo upload/analysis starts:

`Reading the GPS watermark from the uploaded site photo...`

Analysis summary card fields:

| Summary Cell | Value |
|---|---|
| `Watermark address` | Parsed address or `Not found`. |
| `Watermark coordinates` | Parsed lat/lng or `Not found`. |
| `Captured time` | Parsed capture timestamp or `Not found`. |

Also shows:

| Element | Details |
|---|---|
| Analysis note | Text from site visit analysis API. |
| Verification box | Success or warning depending on saved-site coordinate match. |

Verification messages:

| Status | Message |
|---|---|
| `MATCHED` | `Photo coordinates match the saved site within {meters} m.` |
| `OUT_OF_RANGE` | `Photo coordinates are {meters} m away from the saved site, so this visit should be reviewed carefully.` |
| `PHOTO_COORDS_MISSING` | `Coordinates were not found in the uploaded photo watermark.` |
| `SAVED_COORDS_MISSING` | `This site does not have a saved location yet, so verification cannot run.` |

Important gallery rule:

| Source | Rule |
|---|---|
| Gallery upload | Must contain readable GPS watermark address and coordinates, or submit is blocked. |

Error if missing:

`Uploaded past site visit photos must have a readable GPS watermark address and coordinates.`

### Stakeholder Details Box

Heading:

`Stakeholder details`

Description:

`Choose the person you talked to and add new contacts only if they were not already saved.`

#### Saved Stakeholder Selector

Visible for existing site when saved stakeholders exist.

If more than one saved stakeholder:

| UI | Text / Behavior |
|---|---|
| Collapsible summary | `Choose stakeholder ({count})` |
| Right summary text | `{selectedCount} selected` |
| Inside panel | Chip grid with checkbox chips. |

If one saved stakeholder:

| UI | Behavior |
|---|---|
| Chip grid | Shows one checkbox chip directly without collapse. |

Stakeholder chip content:

| Element | Details |
|---|---|
| Checkbox | Selects stakeholder. Disabled if `Found no one` is checked. |
| Strong text | Stakeholder name or label. |
| Small text | Phone or label. |

Auto-selection:

| Trigger | Behavior |
|---|---|
| Remarks/transcript contains words like talked, spoke, met, meeting, discussed and a saved stakeholder name | App auto-selects the mentioned stakeholder. |

Auto-selection note:

`Auto-selected stakeholder(s) mentioned in remarks/transcript.`

#### Found No One Choice Card

| UI | Details |
|---|---|
| Checkbox | `Found no one` |
| Main text | `Found no one` |
| Description | `Use this when no decision-maker or site contact was available.` |

Behavior:

| Checked | Result |
|---|---|
| Yes | Clears selected saved stakeholders and removes new stakeholder rows. |
| No | Restores one empty new stakeholder row if none exist. |

#### New Stakeholder Rows

Visible only when `Found no one` is not checked.

Each new stakeholder row has:

| Field | Type | Options / Notes |
|---|---|---|
| `Role` | Select | Site supervisor, Site engineer, Contractor, Owner / builder, Project manager, Purchase head, Others. |
| `Name` | Text input | Optional in UI, but row is ignored if name is blank. |
| `Contact number` | Text input | Saved if name is provided. |

Button:

| Button | Behavior |
|---|---|
| `Add new stakeholder` | Adds another stakeholder row. |

### Current Supplier Box

Visible only when not using an existing site.

Heading:

`Current supplier`

Description:

`Choose manual mix or add one or more existing suppliers.`

Choice cards:

| Choice | Input Type | Text | Behavior |
|---|---|---|---|
| `Manual mix` | Radio | `No ready-mix supplier is currently serving the site.` | Saves current supplier as `Manual mix`. |
| `Add current supplier` | Radio | `Capture one or more competitors already supplying the site.` | Shows supplier input list. |

Supplier input list:

| Field | Type |
|---|---|
| `Supplier {number}` | Text input |

Button:

| Button | Behavior |
|---|---|
| `Add another supplier` | Adds another supplier text field. |

Validation:

| Condition | Error |
|---|---|
| Add supplier selected but all supplier names blank | `Add at least one current supplier or choose manual mix.` |

### Site Visit Commercial/Project Details

Three-grid field group:

| Field | Type | Required | Default / Options |
|---|---|---|---|
| `Expected supply` | Select | Yes | Within 7 days, Within 15 days, Within 30 days, More than 30 days. |
| `Concrete grade` | Text input | Yes | Existing site grade or `M25`. |
| `Quantity (CUM)` | Number input | Yes | Existing site quantity if available. |

Second three-grid field group:

| Field | Type | Required | Details |
|---|---|---|---|
| `Stage of work` | Text input | Yes | Placeholder: `Foundation / Slab / Column`. |
| `Lead stage` | Select | Yes | Talks, Negotiating, Finalized, Missed. |
| `Next follow-up` | Datetime-local | Yes | Auto-suggested from expected supply/capture time. |

Lead stage hint:

`Suggested stage: {suggestedLeadStage}`

### Future Scope Box

| Field | Type | Required |
|---|---|---|
| `Future scope / update` | Textarea | Yes |

### Remarks Box

| Field | Type | Required | Placeholder |
|---|---|---|---|
| `Remarks` | Textarea | No | `Type remarks here or attach a voice note below.` |

### Voice Note Box

| Field | Type | Required | Accept |
|---|---|---|---|
| `Voice note (optional)` | File input | No | `audio/*` |

Hint:

`Voice note is transcribed before submit so you can edit transcript text.`

Loading note:

`Transcribing voice note...`

Error box:

Shows transcription/upload error.

Transcript field:

| Field | Type | Behavior |
|---|---|---|
| `Transcript (editable)` | Textarea | Populated from voice transcription and can be edited before submit. |

Transcript hint:

`Confidence {percent}%. {note}`

### Suggested Lead Score Box

Text:

`Suggested lead score for this visit: {score}/10`

Score logic considers:

| Factor | Effect |
|---|---|
| Expected supply within 7 days | Higher score. |
| Expected supply within 15 days | Medium increase. |
| Any real stakeholder found | Increases score. |
| Manual mix supplier | Increases score. |
| Found no one | Lower score than meaningful contact. |

### Site Visit Submit Button

| Button | State |
|---|---|
| `Save site visit` | Normal submit. |
| `Saving...` | While submit is active. |
| `Refreshing...` | While dashboard refresh is pending. |

Disabled when:

| Condition |
|---|
| Busy. |
| Dashboard refresh pending. |
| Photo analysis is busy. |

### Site Visit Submit Validation

| Condition | Error |
|---|---|
| No stakeholder and not found no one | `Select the stakeholder you met or choose 'Found no one'.` |
| No arrival photo | `Please capture the site visit photo first.` |
| Gallery photo missing readable watermark address or coordinates | `Uploaded past site visit photos must have a readable GPS watermark address and coordinates.` |
| New site without site name | `Site name is required.` |
| Add supplier selected but no supplier entered | `Add at least one current supplier or choose manual mix.` |

### Site Visit Submit Data

The submit payload includes:

| Data Group | Fields |
|---|---|
| Photo | S3 key, original name, MIME type, size. |
| Voice note | S3 key, original name, MIME type, size if present. |
| Location | Lat/lng from gallery watermark, camera GPS, analysis, or current geolocation fallback. |
| Lead/site | Lead ID, site ID, site name, resolved site address. |
| Stakeholders | JSON payload of selected saved contacts, new contacts, or found no one. |
| Project | Concrete grade, quantity, stage of work, future scope. |
| Remarks | Typed remarks and edited transcript text. |
| Supplier | Saved supplier/manual mix. |
| Follow-up | Expected supply, lead stage, next follow-up. |
| Score | Suggested score. |
| Watermark metadata | Photo address, photo captured time, detected lat/lng. |

Success message:

`Site visit recorded and lead/site summary updated.`

## Step 03: Get Instant Price

Purpose: quick estimate calculator only; it does not submit data.

### Form Fields

| Field | Type | Default | Rules |
|---|---|---|---|
| `Distance from plant (km)` | Number | `12` | Min 0, step 0.1. |
| `Quantity (CUM)` | Number | `30` | Min 0, step 0.01. |
| `Number of traffic` | Number | `1` | Min 0. |
| `Concrete grade` | Select | `M25` | Grade list from price table. |

Grade price table:

| Grade | Base Price |
|---|---:|
| M10 | 3500 |
| M15 | 3750 |
| M20 | 3900 |
| M25 | 4047 |
| M30 | 4227 |
| M35 | 4467 |
| M40 | 4667 |

### Calculation Rules

| Calculation | Formula |
|---|---|
| Distance charge | `max(distance - 12, 0) * 13` |
| Traffic charge | `trafficCount * 15` |
| Approx rate / CUM | `basePrice + distanceCharge + trafficCharge` |
| Estimated order value | `approxRate * quantity` |

### Approximate Pricing Summary Card

Heading:

`Approximate pricing`

Description:

`Base price + traffic charge + extra distance charge over 12 km.`

Summary cells:

| Cell |
|---|
| `Base price` |
| `Traffic charge` |
| `Distance charge` |
| `Approx rate / CUM` |

Note box:

| Condition | Text |
|---|---|
| Quantity valid | `Estimated order value for {quantity} CUM: {value}` |
| Quantity missing/invalid | `Enter a quantity to see the estimated order value.` |

## Step 04: Request Informal Quotation

Purpose: sales agent requests an informal quotation for manager approval. Agent cannot download or send quotation directly.

### Lock Notice

Note box:

`The sales agent can only request this quotation. Manager approval is required before any quotation format is released.`

### Lead/Site/Stakeholder Fields

| Field | Type | Required | Options / Behavior |
|---|---|---|---|
| `Existing lead` | Select | Yes | Shows saved leads. If none, shows `No leads available`. |
| `Existing site` | Select | Yes | Shows saved sites for selected lead. If none, shows `No saved sites available`. |
| `Stakeholder` | Select | Yes | Shows saved non-found-no-one stakeholders for selected site. |

Stakeholder option format:

`{name} - {roleLabel} ({phone})`

If no stakeholder:

`No stakeholder saved for this site`

### Selected Site Summary Card

Visible when site exists.

| Element | Details |
|---|---|
| Heading | Site name. |
| Description | Site address. |
| Label | Selected lead stage or `Lead`. |
| Meta | Current supplier, last grade, saved stakeholder count. |

### Contact And Delivery Fields

| Field | Type | Required | Behavior |
|---|---|---|---|
| `Stakeholder email` | Email input | Yes | Mandatory. Placeholder: `client@example.com`. |
| `Billing address` | Select | Yes | `Same as site address`, `Enter another billing address`. |
| `WhatsApp number` | Select | Yes | `Same as stakeholder mobile`, `Enter another WhatsApp number`. |
| `Billing address for quotation` | Textarea | Yes | Disabled when same as site address. |
| `Client WhatsApp number` | Input | Yes | Disabled when same as stakeholder mobile. Placeholder: `+919876543210`. |

### Price And Payment Fields

| Field | Type | Options | Behavior |
|---|---|---|---|
| `Price type` | Select | `GST inclusive`, `Non-GST` | Controls credit availability. |
| `Payment type` | Select | `Advance payment`, `Credit payment` | Credit visible only for GST-inclusive price. Disabled for non-GST. |
| `Credit period required by client (days)` | Number | Min 1 | Visible and required only when payment type is credit. |

Hints:

| Condition | Hint |
|---|---|
| GST inclusive | `Credit can be requested only for GST-inclusive prices.` |
| Non-GST | `Non-GST informal quotations are advance payment only.` |
| Payment type non-GST | `Credit is blocked for non-GST quotations.` |
| Payment type GST | `Credit requires manager approval.` |

### Grade Line Items

Section label:

`Concrete grades, quantities, mix design, and price`

Maximum items: 3

Each grade card contains:

| Element | Details |
|---|---|
| Heading | `Grade {number}` |
| Remove button | Visible only when more than one item exists. |

Fields per grade:

| Field | Type | Required | Behavior |
|---|---|---|---|
| `Grade` | Text input | Yes | Converts to uppercase. Placeholder: `M25`. |
| `Quantity (CUM)` | Number | Yes | Min 0.01, step 0.01. |
| `Price per CUM` | Number | Yes | Min 0.01, step 0.01. |
| `Mix design` | Select | Yes | `Nominal mix`, `Specific mix design`. |
| `Specific client requirement` | Text input | Required only for specific mix design | Placeholder: `Example: low heat, pumpable, special slump requirement`. |

If nominal mix:

`Nominal mix selected for this grade.`

Buttons:

| Button | Behavior |
|---|---|
| `Remove` | Removes that grade card. |
| `Add another grade` | Adds a grade card until count reaches 3. |

### Distance And Traffic Fields

| Field | Type | Required |
|---|---|---|
| `One-way distance from plant (km)` | Number, min 0, step 0.1 | Yes |
| `Traffic posts on one-way distance` | Number, min 0, step 1 | Yes |

### Submit Button

| Button | State |
|---|---|
| `Request informal quotation` | Normal. |
| `Submitting...` | Busy. |
| `Refreshing...` | Refresh pending. |

Disabled when:

| Condition |
|---|
| Busy. |
| Refresh pending. |
| No leads. |
| No selected site. |
| No selected stakeholder. |

### Submit API

Posts JSON to:

`POST /api/informal-quotations`

Payload includes:

| Data |
|---|
| Lead ID, site ID, stakeholder role/name/phone/email. |
| Billing address and WhatsApp number. |
| Price type, payment type, credit days. |
| One-way distance and traffic post count. |
| Up to 3 grade line items with grade, quantity, mix design, requirement, and price. |

Success message:

`Informal quotation request submitted for manager approval.`

### Recent Informal Quotation List

Shows latest 5 quotations.

Each row displays:

| Element | Details |
|---|---|
| Header | Customer name and site name. |
| Status badge | Request status. |
| Item summary | `{grade}: {quantity} CUM @ {price}` joined by pipe. |
| Meta | Stakeholder name, price type, payment type, PDF status, email status, WhatsApp status, created time. |
| Note box | `View-only request. Download and forwarding stay locked until manager approval and final quotation format are configured.` |

Empty state:

`No informal quotation requests yet. Pending count will show here after submission.`

Pending hint:

`{count} informal quotation request(s) waiting for manager approval.`

## Step 05: Raise Approval Request

Purpose: create final commercial approval request for manager approval.

### Lead/Site/Customer Fields

| Field | Type | Required | Behavior |
|---|---|---|---|
| `Lead` | Select | Yes | Saved leads. |
| `Site` | Select | Yes | Saved sites for selected lead. |
| `Client / customer name` | Text input | Yes | Defaults from lead/site when available. |

### Selected Site Summary Card

Visible when selected site exists.

| Element | Details |
|---|---|
| Heading | Site name. |
| Description | Site address. |
| Label | Supplier or `Supplier pending`. |
| Meta | Last grade, current quantity, lead score. |

### Approved Grades And Prices

Section label:

`Approved grades and prices`

Maximum items: 3

Each row:

| Field/Button | Type | Required |
|---|---|---|
| `Grade {number}` | Text input | Required for first row. |
| `Price` | Number input | Required for first row. |
| `Remove` | Button | Visible if more than one row. |

Button:

| Button | Behavior |
|---|---|
| `Add another grade` | Adds another grade/price row until 3 rows. |

### Project Details

| Field | Type | Required | Details |
|---|---|---|---|
| `Project quantity (CUM)` | Number | Yes | Min 0, step 0.01. |
| `Required date` | Date | Yes | Desired supply date. |
| `One-way distance from plant (km)` | Number | Yes | Min 0, step 0.1. |
| `Number of traffic` | Number | Yes | Min 0. |
| `Casting type` | Select | No explicit required | `Pump`, `Dump`, `Manual`. Default `Pump`. |
| `Mix design type` | Select | No explicit required | `Design mix`, `Nominal mix`. Default `DESIGN_MIX`. |

### Payment Details

| Field | Type | Options | Behavior |
|---|---|---|---|
| `Payment type` | Select | `Normal`, `Credit` | Normal forces advance terms. |
| `Payment terms` | Select | `Advance`, `PO`, `PDC`, `PO + PDC` | Disabled when payment type is normal. |

Hint:

| Condition | Hint |
|---|---|
| Normal | `Normal payment always uses advance terms.` |
| Credit | `Credit orders can require PO, PDC, or both.` |

### Submit Button

| Button | State |
|---|---|
| `Submit final approval` | Normal. |
| `Submitting...` | Busy. |
| `Refreshing...` | Refresh pending. |

Disabled when:

| Condition |
|---|
| Busy. |
| Refresh pending. |
| No leads. |

Success:

`Final approval request submitted.`

### Recent Approval List

Shows latest 3 approvals.

Each row:

| Element | Details |
|---|---|
| Header | Customer name and status badge. |
| Items | Grade and price summary. |
| Meta | Site name, quantity CUM, payment type/payment terms. |

## Step 06: Create Sales/SLA Order

Purpose: after manager final approval, sales agent creates a finance-ready sales order request.

### Approved Approval Selection

| Field | Type | Required | Options |
|---|---|---|---|
| `Approved final approval` | Select | Yes | Only manager-approved approval requests. |
| `Approved grade` | Select | Yes | Approved grade lines from selected approval. |
| `Priority` | Select | No | `Normal`, `Urgent`. |

If no approved approvals:

`No approved approvals available`

### Customer Legal Details Card

Heading:

`Customer legal details`

Description:

`GSTIN enables invoice mode later. If it is absent, batcher dispatch will stay challan-only.`

Status badge:

| Condition | Badge |
|---|---|
| Valid GSTIN format | `GSTIN format ok` |
| No/invalid GSTIN | `Challan fallback` |

Fields:

| Field | Type | Required | Behavior |
|---|---|---|---|
| `GSTIN` | Text input | No | Max 15 chars, uppercases input. |
| `Legal business name` | Text input | Required if GSTIN exists | Manual or auto-filled. |
| `GST certificate fallback` | File input | No | Accepts PDF/JPG/JPEG/PNG. |
| `Billing address` | Textarea | Required if GSTIN exists | Manual or auto-filled. |

GSTIN hint:

| Condition | Hint |
|---|---|
| Valid GSTIN with PAN | `PAN auto-detected: {PAN}` |
| No GSTIN | `Leave blank only when this dispatch must remain challan-only.` |

Button:

| Button | State | Behavior |
|---|---|---|
| `Fetch GST details` | Enabled only when GSTIN format is valid | Calls GSTVerify backend route. |
| `Fetching...` | While GST lookup is active | Button disabled. |

GST lookup:

| API | Payload |
|---|---|
| `POST /api/gst/verify` | `{ gstin }` |

Success message:

`Fetched GST details ({registrationStatus}). Please confirm before submitting.`

Error message:

`Could not reach GSTVerify right now. Please try again.`

Confirmation checkbox:

| Checkbox | Visible When | Required |
|---|---|---|
| `I verified the GST legal name and billing address before submitting` | GSTIN exists | Yes |

Important behavior:

| User Action | Result |
|---|---|
| Changing GSTIN | Clears GST lookup messages and unchecks confirmation. |
| Changing legal name | Unchecks confirmation. |
| Changing billing address | Unchecks confirmation. |
| Leaving GSTIN blank | Order remains challan-only later. |

### Selected Approval Summary Card

Visible when an approved approval is selected.

| Element | Details |
|---|---|
| Heading | Customer name. |
| Description | Site address. |
| Label | Site name. |
| Meta | One-way distance, traffic count, payment type/terms, mix design type. |

### Sales Order Fields

| Field | Type | Required | Details |
|---|---|---|---|
| `Quantity (CUM)` | Number | Yes | Min 0.01, step 0.01. Defaults to approval quantity. |
| `Required slump` | Text input | Yes | Placeholder `100 mm`. |
| `Required date` | Date | Yes | Defaults from selected approval required date. |
| `Receiver name` | Text input | Yes | Site receiver. |
| `Receiver phone` | Text input | Yes | Site receiver phone. |
| `Planned pump` | Read-only checkbox | No | Mirrors planned casting type. |
| `Planned casting type` | Select | Yes | `Pump` or `Dump`. |
| `Notes` | Textarea | No | Placeholder: dispatch instructions, site gate notes, commercial remarks. |

Planned casting hint:

`Final challan/invoice casting will follow production manager pump dispatch confirmation.`

### Conditional Document Fields

Shown based on approved payment terms.

| Condition | Field |
|---|---|
| PO required | `PO document` file input, required. |
| PDC required | `PDC document` file input, required. |
| Advance payment receipt required | Checkbox: `Full payment received and confirmed for this advance order`, required. |

File accept list:

`.pdf,.jpg,.jpeg,.png,.doc,.docx`

### Amount Preview Card

Visible when selected grade and quantity are valid.

Heading:

`Amount preview`

Description:

`Quantity x approved price, with Rs 8000 pump charge added when quantity is below 30 CUM.`

Value:

`Rs {amount}`

Amount formula:

| Calculation | Formula |
|---|---|
| Base amount | `quantity * approvedPrice` |
| Pump charge | `Rs 8000` only when pump required and quantity below 30 CUM |
| Total | Base amount + pump charge |

### Submit Button

| Button | State |
|---|---|
| `Create sales order request` | Normal. |
| `Submitting...` | Busy. |
| `Refreshing...` | Refresh pending. |

Disabled when:

| Condition |
|---|
| Busy. |
| Refresh pending. |
| No selected approved approval. |
| No selected grade item. |

Submit endpoint:

`POST /api/sales-order-requests`

Success:

`Sales/SLA order request created and moved to finance review.`

### Sales Order Request List

Shows latest 4 requests.

Each row:

| Element | Details |
|---|---|
| Header | Customer name and status badge. |
| Summary | Grade, quantity, amount. |
| Meta | Site name, payment type/payment terms. |

## Step 07: Sales Order Status

Purpose: read-only tracking after sales order request submission.

### Intro Note Box

Heading:

`Accounts now creates the sales order.`

Text:

`After ledger creation, the request appears in Accounts under Create Sales Order. Once Accounts creates it, it moves to the Production Manager dashboard for schedule approval and pump/dump decision.`

### Ledger Created Orders List

Filters requests where status is `FINANCE_VERIFIED`.

If records exist, shows up to 4 rows:

| Element | Details |
|---|---|
| Header | Customer name. |
| Badge | `Waiting for accounts sales order`. |
| Summary | Grade, quantity, amount. |
| Meta | Site name, `Ledger created`. |

Empty state:

`No ledger-created orders are waiting for Accounts sales order creation.`

### Production Orders List

Filters requests with:

| Status |
|---|
| `SCHEDULE_PENDING` |
| `SCHEDULE_APPROVED` |
| `SCHEDULE_REJECTED` |

Shows up to 4 rows:

| Element | Details |
|---|---|
| Header | Customer name and status badge. |
| Text | Production date or `Production date pending`, plus receiver name. |

No buttons are available here. The sales agent can only track status.

## Step 08: Help / Correction Request

Purpose: let sales agent ask manager/admin for correction when some reading or timing is missing or wrong.

### Form Fields

| Field | Type | Required | Options |
|---|---|---|---|
| `Date` | Date input | Yes | Date needing correction. |
| `Requested field` | Select | Yes | Office in time, Start reading, End reading, Site visit end time, Office out time. |
| `Explanation` | Textarea | Yes | Agent explains the issue. |

Requested field options:

| Value | Label |
|---|---|
| `OFFICE_IN_TIME` | Office in time |
| `START_READING` | Start reading |
| `END_READING` | End reading |
| `SITE_VISIT_END_TIME` | Site visit end time |
| `OFFICE_OUT_TIME` | Office out time |

Submit button:

| Button | State |
|---|---|
| `Raise request` | Normal. |
| `Submitting...` | Busy. |
| `Refreshing...` | Refresh pending. |

Submit endpoint:

`POST /api/help-requests`

Success:

`Correction request submitted.`

## Daily Logs Panel

Panel title:

`Daily Logs`

Description:

`Compact daily view of readings, tasks, and reimbursement status.`

### Summary Cells

| Cell | Value |
|---|---|
| `Pending readings` | Count of readings with status `AWAITING_CONFIRMATION`. |
| `Open tasks` | Count of open assigned tasks. |
| `Reimbursement` | Today summary status text. |

Reimbursement status text:

| Condition | Text |
|---|---|
| No summary | `No record yet` |
| Manual verified | `Manager verified` |
| Pending | `Awaiting verification` |
| Otherwise | `Verified by agent` |

## Reading Log List

### Needs Action Section

Heading:

`Needs Action`

Description:

`Only reading items that still need agent attention stay visible here.`

Badge:

`{needsActionCount} active`

If there are pending readings:

`{count} reading item(s) still need your attention.`

If none:

`No reading actions pending. Confirmed items now stay tucked inside history.`

### Reading Card

Each reading card shows:

| Element | Details |
|---|---|
| Heading | `{START/END} reading` |
| Captured text | `Captured {India time}` |
| Status badge | Reading status. |
| Extracted value | OCR value or `N/A`. |
| Final value | Final value or `Pending`. |
| Verification note | Optional. |
| OCR pending hint | `OCR is still processing this image.` |

Buttons:

| Button | Visible When | Behavior |
|---|---|---|
| `Confirm reading` | Status `AWAITING_CONFIRMATION` | Confirms reading. |
| `Send for review` | Status `AWAITING_CONFIRMATION` | Sends to manager review. |
| `View photo` | Always | Opens photo URL in new tab. |

Confirm endpoint:

`POST /api/odometer-readings/{id}/confirm`

Reject endpoint:

`POST /api/odometer-readings/{id}/reject`

### Reading History Toggle

Visible if resolved readings exist.

Summary:

| Left | Right |
|---|---|
| `Reading History ({count})` | `Show resolved items` |

Inside:

Resolved reading cards with `View photo` button only unless they still need action.

## Site Visit Logs Toggle

Summary row:

| Left | Right |
|---|---|
| `Site Visit Logs ({count})` | `Show submitted reports` |

Empty state:

`No site visits submitted yet.`

### Site Visit Log Row

Each row shows:

| Element | Details |
|---|---|
| Header | Site name. |
| Description | Site address. |
| Label | Visit time. |
| Meta | Stage, concrete grade, quantity. |
| Remarks | Remarks text or `No remarks added.` |

Button:

| Button | Behavior |
|---|---|
| `Edit report` | Opens inline edit form. |

### Site Visit Edit Form

Fields:

| Field | Type |
|---|---|
| `Stage of work` | Text input |
| `Concrete grade` | Text input |
| `Quantity (CUM)` | Number input, min 0, step 0.01 |
| `Lead stage` | Select: Talks, Negotiating, Finalized, Missed |
| `Expected supply` | Select: Not set, Within 7 days, Within 15 days, Within 30 days, More than 30 days |
| `Next follow-up` | Datetime-local |
| `Future scope / update` | Textarea |
| `Remarks (includes transcript text)` | Textarea |

Buttons:

| Button | Style | Behavior |
|---|---|---|
| `Cancel` | Secondary | Cancels edit mode. |
| `Save changes` | Primary | Saves edit. |
| `Saving...` | Primary loading | Shown while saving. |

Save endpoint:

`PATCH /api/site-visits/{visitId}`

Success:

`Site visit report updated.`

## Assigned Tasks Toggle

Summary row:

| Left | Right |
|---|---|
| `Assigned Tasks ({count})` | `Show task list` |

If tasks exist, each row shows:

| Element | Details |
|---|---|
| Heading | Task subject. |
| Body | Task explanation. |
| Meta | Deadline and status. |

Empty state:

`No secondary tasks assigned.`

## Reimbursement Summary Toggle

Default state: Open.

Summary row:

| Left | Right |
|---|---|
| `Reimbursement Summary ({count})` | `Show daily reimbursement` |

Contains:

| Component | Purpose |
|---|---|
| Payment Claim panel | Agent requests unpaid verified reimbursement claim. |
| Reimbursement summary list | Daily reimbursement rows/table. |

## Payment Claim Panel

Heading:

`Payment Claim`

Description:

`Claim verified unpaid reimbursement days for accounting review.`

Button:

| Button | Behavior | Disabled When |
|---|---|---|
| `Request Claim` | Creates reimbursement claim for eligible summaries. | Refresh pending, active claim exists, or no eligible summaries. |

Request endpoint:

`POST /api/reimbursement-claims`

Success:

`Claim requested. Accounting will verify payment with OTP.`

### OTP Notice

Visible when active claim status is `OTP_SENT` and OTP exists.

Shows:

| Element | Details |
|---|---|
| Label | `Accounting OTP` |
| Strong text | OTP code |
| Instruction | `Share this OTP with accounting after receiving {amount}.` |

### Payment Claim Summary Cells

| Cell | Value |
|---|---|
| `Claimable amount` | Sum of eligible unpaid summaries. |
| `Claimable days` | Count of eligible summaries. |
| `Last paid through` | Last paid claim period end, or `No payout yet`. |

### Active Claim Note

Shown if there is a requested or OTP-sent claim:

`Active claim {periodStart} to {periodEnd}, {amount}. Status: {Waiting for accounting or OTP sent at time}.`

## Reimbursement Summary List

If no summaries:

`No reimbursement summaries available yet.`

Mobile card fields:

| Field |
|---|
| Date |
| Status badge |
| Start reading |
| End reading |
| Distance |
| Visits |
| Lunch |
| Total |

Desktop table columns:

| Column |
|---|
| Date |
| Start |
| End |
| Distance |
| Visits |
| Fuel |
| Lunch |
| Total |
| Status |

Status labels:

| Status | Label |
|---|---|
| `MANUAL_VERIFIED` | `Manager verified` |
| `PENDING` | `Awaiting verification` |
| Other confirmed status | `Verified by agent` |

## Lead Focus Panel

Panel title:

`Lead Focus`

Description:

`Upcoming follow-ups and strongest opportunities stay nearby, but out of the main action flow.`

Shows latest/top 5 leads.

Each lead row displays:

| Element | Details |
|---|---|
| Header | Lead/site name. |
| Status badge | Lead stage. |
| Body | Site address. |
| Meta | Score, follow-up time, current supplier, site count. |

Conditional button:

| Button | Visible When | Behavior |
|---|---|---|
| `Get direction` | Lead has primary site coordinates | Opens Google Maps directions in new tab. |

Empty state:

`No site leads yet. Your first site visit will create one.`

## Floating AI Assistant

Floating trigger button:

| State | Button Text |
|---|---|
| Closed | Star-like symbol |
| Open | Close symbol |

Panel header:

| Element | Text |
|---|---|
| Title | `SPD Assistant` |
| Subtitle | `Powered by Gemini - EN / Hindi / Odia` |
| Close button | Close symbol |

Welcome state:

| Text |
|---|
| `Hello! I am your SPD Field Assistant.` |
| `You can ask me about your orders, leads, and tasks - in English, Hindi, or Odia.` |

Suggestion chips:

| Chip |
|---|
| `What are my open tasks?` |
| `Raise an M25 order for Skyline` |
| `Show my pending orders` |

Chat input:

| Element | Details |
|---|---|
| Textarea | Multiline input; Enter sends unless Shift+Enter. |
| Send button | Disabled while thinking or input is blank. |

AI behavior:

| Behavior | Details |
|---|---|
| Sends request | `POST /api/ai-chat` |
| Shows thinking bubbles | While API responds. |
| Can parse action intent | Currently captures order intent but guides user to complete manual form. |

## Sales Agent Critical Business Rules

These rules must not break during UI redesign.

| Rule | Reason |
|---|---|
| Sales agent cannot download or send informal quotation directly. | Manager approval is mandatory. |
| Informal quotation email is mandatory. | Client delivery requires email. |
| Informal quotation supports max 3 grades. | Business rule from quotation workflow. |
| Sales order can only be created from approved final approval. | Prevents unauthorized orders. |
| GSTIN legal name and billing address must be confirmed if GSTIN exists. | Legal/accounting continuity. |
| No GSTIN means challan-only dispatch later. | Invoice mode stays locked. |
| Accounts creates ledger first, then creates formal sales order. | Current accounting control point. |
| Production manager confirms pump dispatch. | Actual casting type depends on real pump dispatch. |
| Gallery site visit photo must have readable GPS watermark. | Past visit entry must use photo evidence, not today's location. |
| Odometer and site visit photos use S3 direct upload. | Avoids large file upload through app server. |
| Voice transcript is editable. | Agent can correct transcript before/after report submission. |
| Site visit report can be edited later in logs. | Agent can correct report details. |

## Redesign Notes For Sales Agent UI

The current workflow is functionally rich but dense. For UI upgrade, keep the same data and rules but improve layout.

Recommended redesign order:

| Priority | Area | Reason |
|---|---|---|
| 1 | Odometer + Site Visit | Most frequent mobile field use. |
| 2 | Site Visit Logs/Edit | Important trust and correction flow. |
| 3 | Informal Quotation | Long form needs stepper/wizard. |
| 4 | Final Approval + Sales Order | High business impact and legal data. |
| 5 | Daily Logs/Reimbursement | Needs cleaner finance status. |
| 6 | Lead Focus and AI Assistant | Useful secondary tools. |

Recommended UI model:

| Current | Upgrade Direction |
|---|---|
| One long accordion | Mobile-first task cards with guided stepper inside each task. |
| Dense forms | Split into sections with sticky review/submit footer. |
| Generic cards | Use field-sales visual language: route, site, customer, evidence, approval. |
| Text-heavy statuses | Use status timeline and checklist components. |
| File inputs | Replace with clearer evidence upload cards. |
| Sales order GST details | Use checklist: GSTIN format, fetched, confirmed, accounts pending. |
