# Firebase Production Upgrade Plan

This plan keeps the app stable for field users while moving Firebase away from full-database reads and toward scoped, indexed, production-safe access.

## Shipped Baseline

- New Firebase projects bootstrap seed collections when the first scoped `users` lookup finds an empty database.
- Dashboard reads are role-scoped instead of reading the whole database.
- Login and logout use direct `authSessions` document writes/deletes.
- Dashboard auto-refresh defaults to a slow safety sync.
- Users can manually check scoped notifications and sync the current page.
- Sales agent logs default to recent data, with a full allowed-history view on demand.

## Access Rules By Role

- Sales agents can view only their own leads, visits, readings, quotations, orders, tasks, and claims.
- Batcher users can view only their assigned plant's dispatch/order queue.
- Accounting can view finance, ledger, reimbursement, and GST/PO/PDC verification queues.
- Mix Design can view recipe and pending mix-design work only.
- Managers and production managers can view management queues within their plant scope when `homePlantId` is set.

## Default Versus Full History

- Default pages should load small, recent, fast datasets.
- Full history must always be explicit and still role-restricted.
- APIs must enforce scope on the server; the UI should never be the only protection.

## Notification Pattern

- Do not listen to large dashboard collections in real time.
- Use `/api/notifications/summary` for small, role-scoped counts.
- A user click can refresh notifications or sync only the current page.
- Real-time listeners, if added later, should listen only to tiny notification summary documents.

## Firestore Write Migration

Continue converting high-traffic writes from `updateDatabase()` to granular helpers:

- `upsertCollectionItem()`
- `patchCollectionItem()`
- `deleteCollectionItem()`

Priority order:

1. Auth sessions.
2. Odometer confirmations.
3. Site visit updates.
4. Approval decisions.
5. Sales order finance review.
6. Dispatch creation and site status.
7. Reimbursement OTP/payment actions.

Use Firestore transactions for quantity, dispatch, invoice, and payment state changes where concurrent users can touch the same order.

## Indexes

Maintain `firestore.indexes.json` as the source of truth for production query indexes. Deploy indexes before introducing new multi-field queries in production.

## Operational Safety

- Keep `PREFLIGHT_ALLOW_EMPTY_FIREBASE=false` after the first successful seed.
- Keep `DATABASE_READ_CACHE_MS=60000` or higher.
- Keep `DASHBOARD_AUTO_REFRESH_MS=300000` unless there is a paid capacity reason to lower it.
- Add daily Firestore export/backups before live business data becomes critical.
- Check `/api/system-health` after every deployment.
