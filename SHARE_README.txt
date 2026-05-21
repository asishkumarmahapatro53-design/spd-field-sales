SPD Application Today

This is a clean source handoff folder for further development.

What is included:
- Application source code under app, src, prisma, public, scripts, tests, docs, and handoff.
- package.json and package-lock.json for dependency installation.
- .env.example for environment variable reference.
- The latest PDF implementation changes present in the working copy at package time.

What is intentionally excluded:
- node_modules
- .next build output
- .git history
- .env.local and other local secrets
- runtime uploads
- generated documents
- local mock database data
- bundled local Node tools
- old zip exports and log files

How to run:
1. Install Node.js 20 or newer.
2. Open this folder in a terminal.
3. Run: npm install
4. Copy .env.example to .env.local and fill real credentials only if needed.
5. Run: npm run dev
6. Open: http://localhost:3000

Validation run before packaging:
- TypeScript: .\node_modules\.bin\tsc.cmd --noEmit
- Tests: vitest run, 8 files and 37 tests passed

External integrations:
- Odoo, GST, bank reconciliation, WhatsApp/Contacts, PO/PDC OCR, IRN, and e-way bill integrations still require real provider credentials and a dedicated integration pass.
