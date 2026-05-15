# Firestore Hotfix: `documentTemplates`

Date: 2026-05-15

This release adds a new `documentTemplates` collection for uploaded quotation, challan, and invoice templates.

If production Firestore rules use a strict collection allow-list, add `documentTemplates` to the allowed collections before testing template uploads.

## Collection

`documentTemplates`

## Stored Fields

- `type`: `QUOTATION`, `CHALLAN`, or `INVOICE`
- `name`: user-facing template name
- `fileUrl`: uploaded file URL
- `fileMimeType`: PDF/JPG/PNG/WebP MIME type
- `originalFileName`: uploaded filename
- `status`: `ACTIVE` or `INACTIVE`
- `uploadedBy`: user id
- `uploadedAt`: ISO timestamp

## Recommended Rules Pattern

If the app data is stored under `/app_state/collections/{collectionName}/{docId}`, prefer a collection-tree rule so future app collections do not break production:

```rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /app_state/collections/{collectionName}/{docId} {
      allow read, write: if request.auth != null;
    }
  }
}
```

If writes are only server-side through Firebase Admin SDK, client access can remain locked:

```rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```
