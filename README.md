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

You can also use `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY` instead of a JSON file, but the file path is easier on Windows.

When Firebase is configured:

- app data is stored in a Firestore document
- uploaded photos go to Firebase Storage
- the existing employee ID/password login flow continues to work, now backed by Firebase-stored data

If you want to test with Firestore but keep uploads on the local machine, set:

```env
FIREBASE_USE_STORAGE="false"
```

This Firebase adapter is designed for real workflow testing. It stores the current app state in one Firestore document for simplicity, which is fine for pilot testing but should be normalized into collections for production scale.

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
FIREBASE_FIRESTORE_DATABASE_ID="spddata"
FIREBASE_USE_STORAGE="false"
FIREBASE_APP_STATE_COLLECTION="app_state"
FIREBASE_APP_STATE_DOC="main"
GEMINI_API_KEY="your-gemini-api-key"
GEMINI_CHAT_MODEL="gemini-2.5-flash-lite"
GEMINI_OCR_MODEL="gemini-2.5-flash-lite"
```

For S3-backed uploads, this app accepts either naming style:

```env
S3_BUCKET_NAME="your-bucket"
S3_REGION="your-region"
S3_ACCESS_KEY_ID="your-access-key"
S3_SECRET_ACCESS_KEY="your-secret"
```

or:

```env
AWS_S3_BUCKET_NAME="your-bucket"
AWS_REGION="your-region"
AWS_ACCESS_KEY_ID="your-access-key"
AWS_SECRET_ACCESS_KEY="your-secret"
```

For direct mobile odometer uploads, the S3 bucket must allow browser PUT requests from the production domain. Example S3 CORS:

```json
[
  {
    "AllowedHeaders": ["content-type"],
    "AllowedMethods": ["PUT"],
    "AllowedOrigins": ["https://spdautomation.civilsai.in"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 300
  }
]
```

Supabase bucket setup for this app:

- Create a bucket such as `spd-uploads`
- Mark it as `public`
- Keep the `service role key` server-side only; never expose it in browser code
- If a Gemini model returns quota errors, switch `GEMINI_CHAT_MODEL` to a model your project can call instead of relying on the default

Render deployment notes:

- Build command: `npm install && npm run build`
- Start command: `npm run start -- -p $PORT`
- Render free instances lose local filesystem changes, so do not use local uploads there

This free path is good for demos and small pilot testing. For larger multi-user pilots, move app data out of the single Firestore document shape and keep using durable object storage.

## Notes

- The OCR service is intentionally abstracted and currently uses a mock filename-based extractor.
- The repository layer is file-backed today, while `prisma/schema.prisma` is ready for PostgreSQL migration work.
- The default build does not run `prisma generate` yet because the MVP is not importing Prisma client in runtime code.
- Accounting export supports both CSV and XLSX endpoints.

## Tests

- `npm test` runs the reimbursement and OCR unit tests with Vitest.
