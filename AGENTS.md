# AGENTS.md

This repository is a web product with a browser client and an API/backend. Keep the two deployable parts independently runnable, while treating their contract as a single product surface.

## Startup Workflow

Before editing:

1. Read this file, `feature_list.json`, `progress.md`, and relevant files in `docs/` when present.
2. Run `./init.sh` to establish the baseline. If it fails, record the failure and fix the baseline before adding scope.
3. Work on exactly one `in-progress` feature. If none is active, move one unblocked feature from `not-started` to `in-progress`.

Expected layout as the project is implemented:

- `web/` — browser UI (or `frontend/` / `client/` if selected during setup)
- `backend/` — API, business logic, database integration (or `api/` / `server/`)
- `docs/` — product, architecture, and API-contract notes

Do not create duplicate app roots. If a different layout is adopted, update this file and `init.sh` in the same change.

## Working Rules

- Preserve API compatibility unless the active feature explicitly includes a contract change. Update the client, backend, contract documentation, and tests together when it does.
- **One feature at a time**: do not begin another feature until the active one is done or explicitly marked blocked.
- Keep secrets out of source, logs, fixtures, and handoffs. Commit only `.env.example` files with safe placeholders.
- Make database changes through versioned migrations; document required seed/reset steps.
- Do not mix formatting or unrelated refactors into a feature change.
- Prefer focused tests at the boundary you changed: UI/component or end-to-end behavior for `web/`; unit/integration/API tests for `backend/`.
- Do not mark a feature `done` without command output or a concise manual-check result in its `evidence` field.

## Definition of Done

A feature is done only when:

- [ ] The stated user behavior and acceptance criteria work.
- [ ] Frontend/backend contract changes are implemented everywhere they apply.
- [ ] Relevant tests, lint/type checks, and builds have run successfully (or any unavailable check is recorded with its reason).
- [ ] Migrations, environment variables, and documentation are updated when affected.
- [ ] `feature_list.json`, `progress.md`, and `session-handoff.md` contain current evidence and next-session context.

## End of Session

1. Update the active feature's status and evidence in `feature_list.json`.
2. Append the current state, decisions, blockers, and exact verification commands to `progress.md`.
3. Refresh `session-handoff.md` whenever work is unfinished or handoff context has changed.
4. Leave the repository restartable through `./init.sh`.

## Escalate Instead of Guessing

Ask for direction before choosing a framework, authentication model, database, deployment target, payment provider, or a breaking API/data migration. Record accepted decisions in `docs/ARCHITECTURE.md` or `progress.md`.
