# Next Chat Start

Use this note to begin the next chat cleanly.

## Current baseline

- codebase is intact
- runtime upload/test data has been cleared
- login is enabled
- Firestore app-state is active
- uploads are local
- OCR is Gemini-only
- a saved planning note exists for the next agent-workflow expansion:
  - `handoff/project-handoff-2026-04-23/AGENT_WORKFLOW_IMPROVEMENT_PLAN_2026-04-25.md`
- a saved completion checkpoint exists for the finished first implementation pass:
  - `handoff/project-handoff-2026-04-23/PHASE_1_CHECKPOINT_2026-04-25.md`
- a saved completion checkpoint exists for the finished second implementation pass:
  - `handoff/project-handoff-2026-04-23/PHASE_2_CHECKPOINT_2026-04-25.md`

## Good first context to tell the next chat

You can paste something like this:

`We are continuing the SPD Field Sales app. Please read handoff/project-handoff-2026-04-23/PROJECT_SUMMARY.md and CURRENT_LOGIC.md first, then continue from there. Do not change the current baseline without checking the live logic first.`

## What the next chat should know

- the project has already gone through many UI and OCR experiments
- the user prefers clean, focused pages instead of long cluttered dashboards
- popups/expansions should not freeze, overlap, or open awkwardly inside narrow cards
- event-based tracking is accepted for now
- OCR works, but still needs more training/tuning
- code changes should be deliberate because the user has been sensitive to repeated OCR/provider changes

## Best next topics

- improve Gemini odometer extraction accuracy further
- refine timestamp extraction from watermark/dashboard
- improve the site visit "existing lead" workflow so repeated fields feel even lighter
- polish manager tracking and accounting flows further
- build the informal quotation workflow next
- normalize Firestore app-state into proper collections later if needed

## Important cautions

- do not reintroduce disabled OCR providers without a clear reason
- do not break the current login-enabled baseline
- do not assume continuous live GPS exists
- do not remove the extra sales-agent test users unless explicitly asked
