# SPD Field Sales Web App

Mobile-first internal web application for the workflow described in `spd workflow.pdf`.

## What is implemented

- Role-based dashboards for Sales Agent, Manager, and Accounting
- Cookie-based authentication with seeded demo users
- Workday session start/end tracking
- Odometer photo upload flow with mock OCR, agent confirmation, and manager fallback
- Site visit capture, lead tracking, follow-up prioritization, and stage/status updates
- Approval requests with manager approval/rejection
- Secondary task assignment from manager/accounting to agents
- Help/correction requests for missed entries
- Computed reimbursement ledger with CSV/XLSX export
- Prisma schema matching the intended PostgreSQL production data model
- File-backed local repository so the MVP can run before PostgreSQL is wired in

## Demo users

- Sales agent: `SA1001` / `password123`
- Manager: `MG2001` / `password123`
- Accounting: `AC3001` / `password123`

## Local setup

1. Install Node.js with `npm`.
2. Run `npm install`.
3. Copy `.env.example` to `.env`.
4. Run `npm run dev`.

Uploads are stored in `public/uploads`, and local mock data is stored in `data/mock-db.json`.

## Firebase test mode

To run against your Firebase project instead of local mock storage:

1. Enable Firestore and Firebase Storage in your Firebase project.
2. Download a Firebase service account JSON file from Google Cloud / Firebase Admin settings.
3. Put the JSON file somewhere on your machine.
4. Add these values to `.env.local`:

```env
FIREBASE_SERVICE_ACCOUNT_JSON_PATH="C:/absolute/path/to/service-account.json"
FIREBASE_STORAGE_BUCKET="your-project-id.firebasestorage.app"
FIREBASE_USE_STORAGE="true"
FIREBASE_APP_STATE_COLLECTION="app_state"
FIREBASE_APP_STATE_DOC="main"
```

For hosted deployments where a JSON file path is not available, prefer `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64`. Base64-encode the full Firebase service-account JSON file and paste that single-line value into the hosting environment. The app also supports `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY`, but that split-key format is easier to break because private keys contain newline markers.

When Firebase is configured:

- app data is stored in durable Firestore collections
- uploaded photos go to Firebase Storage
- the existing employee ID/password login flow continues to work, now backed by Firebase-stored data

Production deployments require durable persistence. If Firebase is not available, the app refuses to use local `/tmp` database storage unless `ALLOW_EPHEMERAL_PERSISTENCE="true"` is explicitly set for a throwaway demo.

Before every Amplify deployment, `npm run preflight:production` now validates the production-critical services. The deployment is blocked if Firestore cannot write/read/delete, if existing app data is not visible in the configured Firestore path, if S3 upload/CORS checks fail, if Gemini cannot be called, or if disposable `/tmp` persistence is enabled.

If you want to test with Firestore but keep uploads on the local machine, set:

```env
FIREBASE_USE_STORAGE="false"
```

This Firebase adapter is designed for real workflow testing. New writes are stored in Firestore collections under `FIREBASE_APP_STATE_COLLECTION`. If older data exists in the legacy document `app_state/main`, the app reads it and copies it into the collection structure without deleting the legacy document. Do not change `FIREBASE_PROJECT_ID`, `FIREBASE_FIRESTORE_DATABASE_ID`, or `FIREBASE_APP_STATE_COLLECTION` after real users start entering data unless you are intentionally migrating the data.

## Mappls maps

Reverse geocoding runs server-side with `MAPPLS_REST_API_KEY`. The agent lead map also needs a browser-safe Mappls static key:

```env
NEXT_PUBLIC_MAPPLS_MAP_SDK_KEY="your-mappls-static-key"
```

Add this value in AWS Amplify and whitelist the production domain in Mappls. Direction buttons intentionally continue to open Google Maps.

## Render + Supabase free path

If you want the zero-card testing path:

1. Host the Next.js app on Render as a web service.
2. Keep Firebase for app data.
3. Store uploaded photos in a public Supabase Storage bucket.

Add these environment variables in Render:

```env
SUPABASE_USE_STORAGE="true"
SUPABASE_URL="https://your-project-ref.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="your-supabase-service-role-key"
SUPABASE_STORAGE_BUCKET="spd-uploads"

FIREBASE_PROJECT_ID="your-firebase-project-id"
FIREBASE_CLIENT_EMAIL="your-firebase-client-email"
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_SERVICE_ACCOUNT_JSON_BASE64="base64-encoded-full-service-account-json"
FIREBASE_FIRESTORE_DATABASE_ID="spddata"
FIREBASE_USE_STORAGE="false"
FIREBASE_APP_STATE_COLLECTION="app_state"
FIREBASE_APP_STATE_DOC="main"
GEMINI_API_KEY="your-gemini-api-key"
GEMINI_CHAT_MODEL="gemini-2.5-flash-lite"
GEMINI_OCR_MODEL="gemini-2.5-flash-lite"
APP_ORIGIN="https://spdautomation.civilsai.in"
SYSTEM_HEALTH_TOKEN="choose-a-long-random-token"
PREFLIGHT_ALLOW_EMPTY_FIREBASE="false"
PREFLIGHT_SKIP_GEMINI="false"
```

For S3-backed uploads on Amplify, use explicit `S3_*` variables:

```env
S3_BUCKET_NAME="your-bucket"
S3_REGION="your-region"
S3_ACCESS_KEY_ID="your-access-key"
S3_SECRET_ACCESS_KEY="your-secret"
```

For local development only, this app also accepts AWS-style aliases:

```env
AWS_S3_BUCKET_NAME="your-bucket"
AWS_REGION="your-region"
AWS_ACCESS_KEY_ID="your-access-key"
AWS_SECRET_ACCESS_KEY="your-secret"
```

Do not rely on `AWS_*` names in Amplify production. Amplify can reserve or inject AWS-prefixed variables, so the preflight requires explicit `S3_*` names unless `PREFLIGHT_ALLOW_AWS_S3_ALIASES="true"` is deliberately set.

For direct mobile odometer uploads, the S3 bucket must allow browser PUT requests from the production domain. Example S3 CORS:

```json
[
  {
    "AllowedHeaders": ["content-type", "x-amz-*"],
    "AllowedMethods": ["PUT", "HEAD"],
    "AllowedOrigins": ["https://spdautomation.civilsai.in"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 300
  }
]
```

After deployment, shallow health can be checked at `/api/system-health`. Deep checks require `SYSTEM_HEALTH_TOKEN`:

```bash
curl -H "Authorization: Bearer your-token" "https://spdautomation.civilsai.in/api/system-health?deep=1&gemini=1"
```

Supabase bucket setup for this app:

- Create a bucket such as `spd-uploads`
- Mark it as `public`
- Keep the `service role key` server-side only; never expose it in browser code
- If a Gemini model returns quota errors, switch `GEMINI_CHAT_MODEL` to a model your project can call instead of relying on the default

Render deployment notes:

- Build command: `npm install && npm run build`
- Start command: `npm run start -- -p $PORT`
- Render free instances lose local filesystem changes, so do not use local uploads there. Production now blocks local upload fallback unless `ALLOW_EPHEMERAL_PERSISTENCE="true"` is set for a disposable demo.

This free path is good for demos and small pilot testing. For larger multi-user pilots, move app data out of the single Firestore document shape and keep using durable object storage.

## Notes

- The OCR service is intentionally abstracted and currently uses a mock filename-based extractor.
- The repository layer is file-backed today, while `prisma/schema.prisma` is ready for PostgreSQL migration work.
- The default build does not run `prisma generate` yet because the MVP is not importing Prisma client in runtime code.
- Accounting export supports both CSV and XLSX endpoints.

## Tests

- `npm test` runs the reimbursement and OCR unit tests with Vitest.
