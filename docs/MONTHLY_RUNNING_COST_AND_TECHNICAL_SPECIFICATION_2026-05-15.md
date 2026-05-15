# Monthly Running Cost and Technical Specification

Prepared for: SPD Field Sales / RMC Operations Application  
Prepared on: 15 May 2026  
Currency used: INR  
Conversion used for estimates: 1 USD = INR 96, rounded from the live USD/INR rate checked on 15 May 2026.  

## 1. Executive Summary

The application is currently a small-to-medium internal business workflow system. It is not expected to be expensive to run at the present scale.

Recommended monthly budget for the current production app:

| Usage stage | Practical monthly budget | Expected actual cloud bill | Notes |
|---|---:|---:|---|
| Pilot / early production | INR 1,500 per month | INR 0 to INR 800 | Most usage should remain inside free or very low-cost tiers. |
| Normal internal production | INR 5,000 per month | INR 1,500 to INR 5,000 | Good working budget for 20 to 60 active users, document uploads, AI assistant/OCR, and safe storage. |
| Heavy production | INR 10,000 to INR 20,000 per month | INR 7,000 to INR 20,000 | Applies if traffic, document/photo storage, SSR compute, or AI usage grows sharply. |
| With Odoo/GSP legal invoicing engine | Separate quote required | Not included in base | Current code does not yet generate legal e-invoice/e-way bill through Odoo/GSP. |

Best planning answer:

Keep INR 5,000 per month as the first safe operating budget for the current app, excluding Odoo/GSP legal e-invoice and e-way bill vendor charges.

If the app is used by a small internal team and kept under free-tier limits, the actual bill can be close to zero or only a few hundred rupees. The reason I still recommend budgeting INR 5,000 is that production systems should include margin for file storage, data transfer, AI usage, billing taxes, exchange-rate movement, and accidental overages.

## 2. What Is Included in This Estimate

This estimate includes the current application stack:

| Layer | Current technology |
|---|---|
| Frontend and server runtime | Next.js 15, React 19, AWS Amplify Hosting |
| Database | Firebase Firestore through Firebase Admin SDK |
| Upload/document storage | S3 preferred in production, with Supabase Storage or Firebase Storage as alternatives |
| AI assistant and OCR | Google Gemini API |
| Quotation email | Gmail SMTP using app password |
| GST lookup | GSTVerify API integration when configured |
| Odoo | Environment configuration and health check only at present |
| Legal e-invoice/e-way bill | Not fully implemented in the current app flow |

This estimate excludes:

| Excluded item | Why excluded |
|---|---|
| Odoo subscription / Odoo implementation | Odoo is not currently the active invoice generation engine in the code. |
| GSP/e-invoice/e-way bill API vendor fee | Vendor and volume pricing must be selected separately. |
| Accountant/legal/statutory compliance fees | This is a professional service cost, not application hosting cost. |
| WhatsApp paid API | WhatsApp sending is marked as pending configuration in the app. |
| SMS OTP cost | Current reimbursement OTP is shown in-app, not sent by paid SMS. |
| Custom development/maintenance retainer | This document is only monthly infrastructure/runtime cost. |

## 3. Recommended Monthly Budget

For the present app, I recommend this budget:

| Cost head | Recommended budget |
|---|---:|
| AWS Amplify hosting and SSR runtime | INR 1,500 |
| Firebase Firestore database | INR 500 |
| Durable file storage, preferably S3 | INR 500 |
| Gemini AI/OCR usage | INR 500 |
| GST verification / email / minor external usage buffer | INR 500 |
| Safety buffer for tax, FX, overage, logs, rebuilds | INR 1,500 |
| Total recommended budget | INR 5,000 per month |

This is not saying the app will definitely spend INR 5,000 every month. It means INR 5,000 is a sensible operating budget that avoids surprise discussions for normal internal use.

## 4. Current Technical Architecture

### 4.1 Application Runtime

The application is a Next.js web application with server-side routes and server-rendered pages.

Key packages:

| Package | Purpose |
|---|---|
| next | Web framework and server routes |
| react / react-dom | UI |
| firebase-admin | Server-side Firestore access |
| @aws-sdk/client-s3 | S3 uploads and generated file storage |
| xlsx | Export support |
| vitest | Test runner |

Deployment:

| Item | Specification |
|---|---|
| Hosting provider | AWS Amplify Hosting |
| Build command | npm run build |
| Install command | npm ci |
| Runtime style | Next.js app with dynamic pages and API routes |
| Domain | Production origin appears configured as https://spdautomation.civilsai.in |
| SSL | Amplify provides public SSL certificates at no extra Amplify charge |

### 4.2 Database

The production database is Firebase Firestore.

The code uses collection-based storage under:

```text
FIREBASE_APP_STATE_COLLECTION / collections / {collectionName} / {documentId}
```

If `FIREBASE_APP_STATE_COLLECTION` is not provided, the default collection root is:

```text
app_state
```

Important collections:

| Collection | Purpose |
|---|---|
| users | Employee login, role, status, home plant |
| authSessions | Server login sessions |
| plants | Plant master data |
| workdaySessions | Sales agent workday login/logout |
| odometerReadings | Start/end odometer photos and readings |
| siteVisits | Site visit records |
| leads | Customer/site lead records |
| leadSites | Multiple sites under a lead |
| approvalRequests | Manager commercial approval requests |
| informalQuotationRequests | Informal quotation requests and PDF/email status |
| salesOrderRequests | Accounts-created sales order workflow |
| reimbursementClaims | Reimbursement claim and OTP payment verification |
| fleetVehicles | Truck master and status |
| materialCostSnapshots | Plant material cost inputs |
| priceBenchmarks | Grade-wise price benchmark |
| customerAccounts | Customer account/credit profile |
| customerInvoices | Customer invoice summary records |
| documentTemplates | Quotation/challan/invoice template metadata |
| mixDesigns | Concrete mix recipes |
| dispatchRecords | Truck dispatch, challan, invoice status, e-way fields |
| commissionVouchers | Manual commission vouchers |
| customerLedgerEntries | Customer debit/credit ledger entries |
| auditLogs | Activity history |

Production warning:

The app must not use local `/tmp` or mock JSON as the production database. The code intentionally blocks production local persistence unless explicitly allowed. Firestore must be configured correctly for production.

### 4.3 File Storage

The app supports multiple storage approaches.

Recommended production choice:

| Storage option | Recommendation |
|---|---|
| AWS S3 | Best current fit because the app is already hosted on AWS Amplify and the code supports S3 presigned uploads. |
| Supabase Storage | Acceptable alternative if the business prefers Supabase storage billing. |
| Firebase Storage | Possible, but the existing project note says Firebase Storage required upgrade from Spark in earlier testing. |
| Local runtime storage | Not recommended for production because runtime files can disappear. |

Storage is used for:

| File type | Example |
|---|---|
| Odometer photos | Sales agent start/end readings |
| Site visit photos | Watermarked site visit images |
| GST certificate uploads | Customer GST documents |
| PO/PDC uploads | Accounts verification documents |
| Generated quotation PDFs | Approved informal quotations |
| Document templates | Quotation/challan/invoice template files |

### 4.4 AI and OCR

The app uses Gemini for:

| Use case | Current behavior |
|---|---|
| Odometer OCR | Reads odometer images where configured |
| AI assistant | Helps sales agents with leads, tasks, and order guidance |
| Context scope | AI assistant loads only the specific agent's context, not every lead in the database |

Default model in code:

```text
gemini-2.5-flash-lite
```

This is a cost-efficient model and is appropriate for the current field-assistant/OCR workload.

### 4.5 Email

Quotation email is sent through Gmail SMTP when configured.

Environment variables:

```text
GMAIL_SMTP_USER
GMAIL_APP_PASSWORD
```

There is no direct cloud-hosting charge from the app for Gmail SMTP. Any cost depends on the Google Workspace/Gmail account already used by the company.

### 4.6 GST Verification

The app has a GSTVerify integration.

Environment variables:

```text
GSTVERIFY_API_KEY
GSTVERIFY_API_URL
GSTVERIFY_TIMEOUT_MS
```

The monthly cost depends on the GSTVerify provider plan and lookup volume. This document treats GST verification as a vendor cost, not core cloud infrastructure.

### 4.7 Odoo and Statutory Invoicing

The code includes Odoo environment variables and a health-check route.

Environment variables:

```text
ODOO_URL
ODOO_DB
ODOO_USERNAME
ODOO_API_KEY
ODOO_TIMEOUT_MS
```

Current status:

| Area | Current state |
|---|---|
| Odoo connection | Health/configuration layer exists |
| Dispatch invoice fields | App has invoice number/status fields |
| E-invoice IRN | Field exists, but generation is not fully wired |
| E-way bill | Field exists, but generation is not fully wired |
| Legal invoice engine | Not yet completed |

Cost treatment:

Odoo and GSP/e-invoice/e-way bill costs must be estimated separately after deciding the statutory provider and flow.

## 5. Monthly Cost Breakdown

### 5.1 AWS Amplify Hosting

AWS Amplify cost components:

| Item | Free/paid basis |
|---|---|
| Build minutes | Free up to 1,000 standard build minutes per month, then USD 0.01/minute |
| CDN storage | Free up to 5 GB stored per month, then USD 0.023/GB/month |
| Data transfer out | Free up to 15 GB/month, then USD 0.15/GB served |
| SSR request count | Free up to 500,000 requests/month, then USD 0.30 per 1 million requests |
| SSR request duration | Free up to 100 GB-hours/month, then USD 0.20 per GB-hour |
| WAF | Optional, USD 15/month per Amplify app plus WAF usage costs |

Planning formulas in INR:

```text
Build cost = max(buildMinutes - 1000, 0) * 0.01 * 96
CDN storage cost = max(cdnStorageGb - 5, 0) * 0.023 * 96
CDN transfer cost = max(cdnTransferGb - 15, 0) * 0.15 * 96
SSR request cost = max(ssrRequests - 500000, 0) / 1000000 * 0.30 * 96
SSR duration cost = max(ssrGbHours - 100, 0) * 0.20 * 96
WAF base cost, if enabled = 15 * 96 = INR 1,440/month before WAF usage
```

Expected cost for this app:

| Scenario | Amplify estimate |
|---|---:|
| Pilot | INR 0 to INR 500 |
| Normal internal production | INR 0 to INR 2,500 |
| Heavy usage with WAF/SSR overage | INR 3,000 to INR 10,000+ |

The biggest unknown in Amplify is SSR duration. If dynamic pages and API routes are called heavily, SSR compute can become the main Amplify cost.

### 5.2 Firebase Firestore

Firestore cost components:

| Item | Free quota / pricing basis |
|---|---|
| Stored data | 1 GiB free |
| Reads | 50,000 document reads per day free |
| Writes | 20,000 document writes per day free |
| Deletes | 20,000 document deletes per day free |
| Outbound data transfer | 10 GiB/month free |
| Extra reads | About USD 0.03 per 100,000 documents |
| Extra writes | About USD 0.09 per 100,000 documents |
| Extra deletes | About USD 0.01 per 100,000 documents |
| Extra storage | About USD 0.15 per GiB-month based on the published hourly storage rate |

Planning formulas in INR:

```text
Read cost = billableReads / 100000 * 0.03 * 96
Write cost = billableWrites / 100000 * 0.09 * 96
Delete cost = billableDeletes / 100000 * 0.01 * 96
Storage cost = billableStorageGiB * 0.15 * 96
```

Expected cost for this app:

| Scenario | Firestore estimate |
|---|---:|
| Pilot | INR 0 |
| Normal internal production | INR 0 to INR 500 |
| Heavy usage | INR 500 to INR 3,000 |

Important Firestore note:

The app should keep using scoped collection reads. Full database reads on every dashboard refresh can increase reads and cost. The current code already includes scoped read helpers and read caching, which is good for cost control.

### 5.3 Durable Document and Photo Storage

The app should use durable storage for uploads in production.

Preferred option: AWS S3.

Typical S3 cost planning:

| Item | Planning rate |
|---|---:|
| S3 Standard storage | Around USD 0.023 to USD 0.0265 per GB-month depending on region |
| PUT/COPY/POST/LIST requests | Usually low for this app |
| GET requests | Usually low unless many documents/photos are downloaded repeatedly |
| Data transfer out | Can matter if many large photos/PDFs are downloaded |

Planning formula in INR:

```text
S3 storage cost = storedGb * 0.025 * 96
```

Examples:

| Stored documents/photos | Estimated storage cost |
|---:|---:|
| 5 GB | About INR 12/month |
| 25 GB | About INR 60/month |
| 100 GB | About INR 240/month |
| 250 GB | About INR 600/month |

The storage cost itself is small. Request and download charges can add some cost, but for an internal RMC workflow app, S3 should normally remain under INR 1,000/month unless photo/PDF volume becomes high.

Alternative: Supabase Storage.

Supabase Storage lists overage at USD 0.021/GB/month beyond plan quota. That is roughly INR 2.02 per GB/month at the conversion used here.

### 5.4 Gemini AI/OCR

Current default model:

```text
gemini-2.5-flash-lite
```

Published Gemini 2.5 Flash-Lite paid tier:

| Token type | USD price | INR equivalent |
|---|---:|---:|
| Input text/image/video tokens | USD 0.10 per 1M tokens | About INR 9.60 per 1M tokens |
| Output tokens | USD 0.40 per 1M tokens | About INR 38.40 per 1M tokens |

Example estimates:

| Usage | Approx monthly AI cost |
|---|---:|
| 1,000 small assistant/OCR calls | INR 25 to INR 150 |
| 10,000 small assistant/OCR calls | INR 250 to INR 800 |
| 50,000 calls or large image-heavy usage | INR 1,500 to INR 5,000+ |

The AI cost is likely low for the present app if usage is internal.

Cost control suggestions:

| Control | Reason |
|---|---|
| Keep `gemini-2.5-flash-lite` as the default | Best fit for cost-sensitive field assistant and OCR |
| Limit assistant context to the active agent | Reduces prompt size and protects data isolation |
| Add daily/monthly AI usage logging | Makes billing predictable |
| Add fallback when API key is missing | Prevents production failures |

### 5.5 Gmail SMTP

Current app email sending uses Gmail SMTP for quotation delivery.

Expected app infrastructure cost:

```text
INR 0 from the application side
```

Possible external cost:

| Item | Cost treatment |
|---|---|
| Gmail personal account | Usually no app-specific bill, but not ideal for business production |
| Google Workspace account | Already paid separately if company uses Workspace |
| Dedicated transactional email provider | Optional future upgrade |

### 5.6 GSTVerify API

The app has code to call GSTVerify for GSTIN lookup.

Expected monthly cost:

```text
Vendor-plan dependent
```

Budget recommendation:

| Usage | Budget |
|---|---:|
| Manual/low GST lookups | INR 0 to INR 500/month, depending on vendor plan |
| Regular GST lookup in sales workflow | INR 500 to INR 2,000/month or vendor quote |

This must be verified with the selected GST verification provider.

### 5.7 Odoo, E-Invoice, and E-Way Bill

This is not part of the base monthly app running cost yet.

Reason:

The current app has Odoo configuration and dispatch invoice/e-way fields, but it does not yet use Odoo as the active statutory engine for every invoice/e-way bill.

Future cost categories:

| Cost category | Notes |
|---|---|
| Odoo user license | Depends on Odoo plan, users, country pricing, and whether custom/API access is needed |
| Odoo implementation | One-time setup and integration cost |
| Odoo hosting | Included in Odoo Online plans, separate for self-hosting/Odoo.sh/custom hosting |
| GSP/e-invoice provider | Needed if legal e-invoice/e-way bill is generated through a GST provider/API |
| API transaction charges | Could be per e-invoice, per e-way bill, per GST lookup, or monthly slab |

Planning recommendation:

Do not mix Odoo/GSP into the INR 5,000 base app budget. Keep a separate statutory integration budget after deciding:

| Decision needed | Why |
|---|---|
| Odoo Online vs Odoo.sh vs self-hosted | Changes license/API/customization cost |
| Which GSP/e-invoice provider | Changes transaction and compliance cost |
| Direct app to GSP vs app to Odoo to GSP | Changes engineering and maintenance complexity |
| Who owns final legal posting | Affects audit and compliance responsibility |

## 6. Scenario-Based Monthly Cost Estimate

### 6.1 Scenario A: Pilot / Early Production

Assumptions:

| Metric | Assumption |
|---|---:|
| Active users | 5 to 15 |
| Daily app usage | Light |
| Firestore reads | Under 50,000/day |
| Firestore writes | Under 20,000/day |
| Uploaded files | Under 5 GB total |
| Amplify data transfer | Under 15 GB/month |
| AI/OCR calls | Under 1,000/month |
| Odoo/GSP | Not active |

Estimated monthly cost:

| Component | INR estimate |
|---|---:|
| AWS Amplify | 0 to 500 |
| Firestore | 0 |
| S3 / storage | 0 to 100 |
| Gemini | 0 to 150 |
| Gmail SMTP | 0 |
| GSTVerify | 0 to 250 |
| Safety buffer | 500 |
| Total | 0 to 1,500 |

Recommended budget:

```text
INR 1,500/month
```

### 6.2 Scenario B: Normal Internal Production

Assumptions:

| Metric | Assumption |
|---|---:|
| Active users | 20 to 60 |
| Daily app/API requests | 2,000 to 5,000 |
| Firestore reads | 50,000 to 150,000/day |
| Firestore writes | 5,000 to 20,000/day |
| Uploaded files | 25 to 75 GB |
| Amplify data transfer | 15 to 50 GB/month |
| AI/OCR calls | 3,000 to 10,000/month |
| Odoo/GSP | Not active |

Estimated monthly cost:

| Component | INR estimate |
|---|---:|
| AWS Amplify | 0 to 2,500 |
| Firestore | 0 to 500 |
| S3 / storage | 100 to 700 |
| Gemini | 100 to 800 |
| Gmail SMTP | 0 |
| GSTVerify | 500 to 2,000, if paid lookup is used heavily |
| Safety buffer | 1,000 to 2,000 |
| Total | 1,500 to 5,000 |

Recommended budget:

```text
INR 5,000/month
```

### 6.3 Scenario C: Heavy Production

Assumptions:

| Metric | Assumption |
|---|---:|
| Active users | 100+ |
| Daily app/API requests | 10,000+ |
| Firestore reads | 250,000 to 500,000/day |
| Uploaded files | 100 to 250 GB |
| AI/OCR calls | 25,000+/month |
| Amplify SSR compute | Over free tier |
| WAF | Possibly enabled |
| Odoo/GSP | Still excluded from this table |

Estimated monthly cost:

| Component | INR estimate |
|---|---:|
| AWS Amplify | 3,000 to 10,000+ |
| Firestore | 500 to 3,000 |
| S3 / storage and transfer | 500 to 3,000 |
| Gemini | 1,000 to 5,000 |
| GSTVerify | 2,000+ or vendor quote |
| WAF, if enabled | 1,440+ |
| Safety buffer | 2,000 to 5,000 |
| Total | 7,000 to 20,000+ |

Recommended budget:

```text
INR 10,000 to INR 20,000/month
```

## 7. Production Cost Control Requirements

### 7.1 Billing Alerts

Required billing alerts:

| Provider | Alert |
|---|---|
| AWS | Alert at INR 1,000, INR 3,000, INR 5,000, INR 10,000 |
| Google Cloud / Firebase | Alert at INR 500, INR 2,000, INR 5,000 |
| Gemini API | Daily/monthly usage cap if available |
| GSTVerify/GSP | Vendor dashboard quota alert |

### 7.2 Firestore Cost Controls

Required:

| Control | Reason |
|---|---|
| Use scoped collection reads | Avoid full app-state reads |
| Keep `DATABASE_READ_CACHE_MS` enabled | Reduces repeated reads |
| Add indexes before new query patterns | Prevents inefficient reads/errors |
| Avoid dashboard auto-refresh below business need | Every refresh can create reads |
| Keep strict Firestore rules | Prevents unauthorized/bot usage |

Suggested production setting:

```text
DATABASE_READ_CACHE_MS=60000
DASHBOARD_AUTO_REFRESH_MS=60000 or higher
```

### 7.3 Storage Cost Controls

Required:

| Control | Reason |
|---|---|
| Use S3 instead of local runtime storage | Prevents file loss |
| Compress images before upload | Reduces storage and download cost |
| Keep templates and generated PDFs in one durable bucket | Simple backup and audit |
| Set S3 lifecycle rules after retention policy is approved | Controls long-term cost |
| Do not make private customer files public unless required | Security and billing control |

Suggested S3 retention strategy:

| File type | Suggested retention |
|---|---|
| Odometer photos | 1 to 3 years, based on company audit need |
| Site visit photos | 1 to 3 years |
| GST/PO/PDC documents | 7 to 8 years if treated as financial support records |
| Generated quotations/challans/invoices | 7 to 8 years if treated as accounting support records |
| Temporary generated previews | 30 to 90 days |

### 7.4 AI Cost Controls

Required:

| Control | Reason |
|---|---|
| Keep `gemini-2.5-flash-lite` for normal assistant/OCR | Low cost |
| Log AI usage counts by route | Helps find cost spikes |
| Limit assistant context to current agent | Saves tokens and protects data |
| Add max output token limits | Prevents long costly responses |
| Fail gracefully when AI is unavailable | Business workflow should continue |

### 7.5 Amplify Cost Controls

Required:

| Control | Reason |
|---|---|
| Avoid unnecessary rebuilds | Build minutes can become chargeable |
| Keep static assets small | Reduces CDN storage and transfer |
| Watch SSR duration | Dynamic route compute can become the main cost |
| Review dashboard auto-refresh | More requests can increase SSR/request cost |
| Enable WAF only if needed | Adds USD 15/month plus usage |

## 8. Required Environment Variables

### 8.1 Core Production

```text
APP_ORIGIN
SYSTEM_HEALTH_TOKEN
ALLOW_EPHEMERAL_PERSISTENCE=false
DATABASE_READ_CACHE_MS
DASHBOARD_AUTO_REFRESH_MS
DASHBOARD_COLLECTION_LIMIT
```

### 8.2 Firebase

```text
FIREBASE_PROJECT_ID
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY
FIREBASE_SERVICE_ACCOUNT_JSON_BASE64
FIREBASE_FIRESTORE_DATABASE_ID
FIREBASE_APP_STATE_COLLECTION
FIREBASE_APP_STATE_DOC
```

Use either inline Firebase credentials or base64 service-account JSON. Do not expose the service account to the browser.

### 8.3 S3 Storage

```text
S3_BUCKET_NAME
S3_REGION
S3_ACCESS_KEY_ID
S3_SECRET_ACCESS_KEY
```

Important:

Use explicit `S3_*` variables in Amplify. The health check warns against using generic `AWS_*` aliases because Amplify may inject unrelated AWS credentials.

### 8.4 Gemini

```text
GEMINI_API_KEY
GEMINI_CHAT_MODEL
GEMINI_OCR_MODEL
```

Recommended model:

```text
gemini-2.5-flash-lite
```

### 8.5 Gmail SMTP

```text
GMAIL_SMTP_USER
GMAIL_APP_PASSWORD
```

### 8.6 GSTVerify

```text
GSTVERIFY_API_KEY
GSTVERIFY_API_URL
GSTVERIFY_TIMEOUT_MS
```

### 8.7 Odoo

```text
ODOO_URL
ODOO_DB
ODOO_USERNAME
ODOO_API_KEY
ODOO_TIMEOUT_MS
```

These only support current Odoo health/configuration checks unless the legal invoicing integration is completed.

## 9. Security and Safeguard Requirements

### 9.1 Role-Based Access

Current roles:

| Role | Main responsibility |
|---|---|
| SALES_AGENT | Leads, site visits, quotations, sales order requests, reimbursements |
| MANAGER | Approvals, targets, commercial review |
| ACCOUNTING | Reimbursements, ledger creation, customer ledger, payments, templates |
| BATCHER | Dispatch, challan, invoice mode selection |
| MIX_DESIGN | Mix design recipes |
| PRODUCTION_MANAGER | Schedule approval, pump/dump decision |

Production requirement:

Every API route that changes financial, dispatch, or customer data must enforce the correct role.

### 9.2 Firestore Security Rules

Because the app writes through Firebase Admin SDK on the server, the safest production posture is:

| Client access | Recommendation |
|---|---|
| Browser direct Firestore access | Block unless a specific client feature requires it |
| Server/Admin SDK access | Allow through service account |
| Collection allow-list | Must include every current collection |

Required collections in rules/allow-list must include:

```text
users
authSessions
plants
workdaySessions
odometerReadings
siteVisits
leads
leadSites
approvalRequests
informalQuotationRequests
salesOrderRequests
reimbursementClaims
tasks
helpRequests
targets
auditLogs
fleetVehicles
materialCostSnapshots
priceBenchmarks
customerAccounts
customerInvoices
documentTemplates
mixDesigns
dispatchRecords
commissionVouchers
customerLedgerEntries
```

### 9.3 Financial Safeguards

Current safeguards:

| Safeguard | Current behavior |
|---|---|
| Advance payment | Required when payment type is NORMAL because terms normalize to ADVANCE |
| Credit orders | Can use PO, PDC, or PO and PDC |
| PO/PDC verification | Upload is required based on terms, but content verification is manual by Accounts |
| Customer ledger | Created by Accounts before final sales order |
| Invoice mode | Invoice/e-invoice modes are locked unless GSTIN is present and verified |
| Challan number | Financial-year sequence format |
| Invoice number | Financial-year sequence format when invoice mode is used |
| Dispatch debit | Customer ledger debit appears after site-accepted dispatch |
| Advance credit | Advance payment credit is shown when payment receipt is confirmed |
| OTP reimbursement | In-app OTP verifies reimbursement payment |

Important legal note:

The current invoice/challan print documents are operational documents. Full statutory/legal e-invoice and e-way bill compliance still depends on completing the external Odoo/GSP/legal posting integration.

## 10. Backup and Recovery Requirements

Minimum production backup requirement:

| Data | Backup requirement |
|---|---|
| Firestore | Daily export or scheduled backup once business-critical data starts |
| S3 uploads | Versioning or lifecycle-backed retention policy |
| Environment variables | Secure offline record in password manager/secrets manager |
| Firestore rules | Version-controlled deployment copy |
| Template files | Durable storage plus version history |

Suggested recovery objective:

| Objective | Target |
|---|---|
| RPO | Maximum 24 hours data loss for normal production |
| RTO | Restore app within same business day |

## 11. Technical Scaling Notes

The current app should scale comfortably for internal company usage if the following remain true:

| Area | Scaling condition |
|---|---|
| Firestore | Dashboard reads remain scoped and cached |
| File uploads | S3 is used instead of runtime local storage |
| AI | Gemini context is limited to user-specific data |
| Amplify | SSR route duration stays low |
| Dispatch | Concurrent dispatch updates are tested for quantity race conditions |

Potential scaling bottlenecks:

| Bottleneck | Why it matters |
|---|---|
| Full collection reads | Can increase Firestore reads and latency |
| Large image uploads | Can increase storage and download transfer |
| High dashboard auto-refresh | Can increase Firestore and SSR requests |
| AI prompt bloat | Can increase Gemini cost |
| Legal invoice integration | Needs strong transaction/audit design before going live |

## 12. Final Recommendation

For the current app, allocate:

```text
INR 5,000/month for normal production operation
```

This should cover:

| Included | Status |
|---|---|
| Amplify app hosting | Included |
| Firestore app data | Included |
| S3 document/photo storage | Included |
| Light to moderate Gemini AI/OCR usage | Included |
| Email through Gmail SMTP | Included, assuming existing Gmail/Workspace account |
| GST lookup buffer | Partially included |
| Safety buffer | Included |

Keep separate budget for:

| Separate budget item | Reason |
|---|---|
| Odoo | Not active as legal invoice engine yet |
| GSP/e-invoice/e-way bill API | Required for statutory generation |
| Accountant/legal compliance review | Professional/legal service |
| WhatsApp API | Not configured yet |
| SMS OTP | Not used currently |

The clean business answer is:

The app can run cheaply at the current internal scale. Budget INR 5,000 per month for safe production operation now. When Odoo/e-invoice/e-way bill becomes active, prepare a separate statutory integration budget because that will be a different cost center from normal app hosting.

## 13. Sources Checked

Pricing pages checked on 15 May 2026:

| Source | URL |
|---|---|
| AWS Amplify pricing | https://aws.amazon.com/amplify/pricing/ |
| Amazon S3 pricing | https://aws.amazon.com/s3/pricing/ |
| Google Firestore pricing | https://cloud.google.com/firestore/pricing |
| Google Cloud Storage pricing | https://cloud.google.com/storage/pricing |
| Supabase Storage pricing | https://supabase.com/docs/guides/storage/pricing |
| Gemini API pricing | https://ai.google.dev/gemini-api/docs/pricing |
| USD to INR reference | https://www.exchangerates.org.uk/Dollars-to-Rupees-currency-conversion-page.html |

## 14. Pricing Caveats

This document is an estimate, not a provider invoice.

Final monthly bill can change because of:

| Factor | Impact |
|---|---|
| Actual AWS/GCP region | Some prices vary by region |
| Exchange rate | Cloud providers bill in USD or converted local currency |
| Taxes | GST or other tax may be added to invoices |
| Free-tier eligibility | New-account free tiers can expire |
| Traffic spikes | SSR, data transfer, reads, and AI calls may increase |
| Vendor contracts | GSTVerify, Odoo, GSP pricing depends on vendor plan |

Recommended finance practice:

Use INR 5,000/month as the production budget now, and review actual AWS/Firebase/Gemini bills after the first 30 days of real production usage.
