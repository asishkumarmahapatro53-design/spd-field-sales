# SPD Project Handoff

Created: 2026-04-23

This folder is the handoff pack for the current SPD Field Sales web app. It is meant to let a new chat continue the project without reconstructing the full history from old messages.

## What is in this folder

- `PROJECT_SUMMARY.md`
  High-level product and implementation summary.
- `MASTER_SUMMARY.md`
  One-file executive summary of the whole project state.
- `CURRENT_LOGIC.md`
  The current workflows, business rules, and technical logic that are active in code now.
- `IMPLEMENTATION_TIMELINE.md`
  The major changes requested and implemented so far.
- `NEXT_CHAT_START.md`
  A clean starting brief for the next chat.
- `SOURCE_TREE.txt`
  Current source file index.
- `spd-field-sales-source-snapshot-2026-04-23.zip`
  Clean source snapshot of the current project, excluding runtime caches and local secrets.

## Current live state

- App stack: `Next.js 15 + TypeScript`
- Runtime persistence: `Firebase Firestore app-state document`
- File uploads: `local public/uploads`
- OCR mode: `Gemini-only`
- Login mode: `enabled`
- Current local URL: `http://localhost:3005`

## Important note

On 2026-04-23, all uploaded runtime data was cleared:

- uploaded photos deleted from `public/uploads`
- live test records removed from Firestore runtime collections

Code was not changed during that cleanup.

## Best way to use this handoff

Start the next chat with:

1. `PROJECT_SUMMARY.md`
2. `CURRENT_LOGIC.md`
3. `NEXT_CHAT_START.md`

That is enough context to resume work quickly.
