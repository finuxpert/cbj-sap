# Backend Safe Refactor Trigger

Temporary marker file used to trigger `zz-temp-backend-safe-refactor.yml` from GitHub-only execution.

Scope:
- Run deterministic model refactor.
- Run backend QA.
- Run deterministic storage refactor.
- Run backend QA again.
- Commit changes back to `dev` only if diff exists.

Safety:
- DEV branch only.
- No PROD touch.
- No DB schema touch.
- No nginx/cloudflare touch.
- JSON/file fallback must remain intact.

Triggered at: 2026-05-10 Asia/Jakarta.
