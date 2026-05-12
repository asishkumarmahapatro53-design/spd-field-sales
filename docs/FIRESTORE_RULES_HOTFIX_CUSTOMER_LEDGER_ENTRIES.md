# Firestore Hotfix: `customerLedgerEntries` Permission Error

Date: 2026-05-12

If production started failing right after adding `customerLedgerEntries`, apply this rule update in Firebase.

## Why this happens

Some Firestore rulesets are written with strict collection allow-lists.  
If a new collection path is introduced and the rules are not updated, writes fail with `PERMISSION_DENIED`.

## Fast rule fix (allow the full app collection tree)

Use this when your app data is stored under:

`/app_state/collections/{collectionName}/{docId}`

```rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Keep auth condition strict for your environment.
    // If this app is server-only (Admin SDK), client access can be false.
    match /app_state/collections/{collectionName}/{docId} {
      allow read, write: if request.auth != null;
    }
  }
}
```

This removes the need to update rules every time a new collection (like `customerLedgerEntries`) is added.

## Safer server-only option

If your app writes only through backend Admin SDK APIs, lock client Firestore access:

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

## Important implementation note for this repository

This codebase already includes `customerLedgerEntries` in:

1. `Database` type shape.
2. Seed + normalization.
3. Firestore collection sync list (`COLLECTION_NAMES`).

So if you still see permission errors in production, the likely cause is rules or IAM configuration in Firebase project settings, not missing collection wiring in app code.
