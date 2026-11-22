# Debug log

## 2026-11-22 - Preview failures and shortcuts after exporting

Symptom:
- PDF, Mermaid, code highlighting and export tests failed against the reused Vite server.
- The Todo connection test could not select and copy cards immediately after exporting a backup.

Root cause:
- The reused server answered lazy module requests with `504 Outdated Optimize Dep`.
- Native popover closure precedes React's `toggle` update. The generic dialog check still saw the hidden settings panel.

Fix:
- Playwright starts its own Vite server on port 4175 with an isolated optimizer cache. Origin-sensitive fixtures derive their URLs from the test session.
- Canvas shortcuts use the native popover state for Settings and retain the dialog guard for other dialogs.

Files changed:
- `playwright.config.ts`, `vite.config.ts`, `tests/cloud.spec.ts`, `tests/export-selection.spec.ts`, `src/main.tsx`

Validation:
- `npm test -- --last-failed --last-failed-file=<previous-run.json>` passed all 19 original failures.
- `npm run build` passed.
