# Session Progress Log

## Current State

- Last updated: 2026-09-21
- Active feature: none; feat-041 thirty-day evidence retention and logo refresh completed. feat-018 remains blocked/deferred.
- Baseline: `./init.sh` installs the locked web and backend dependencies successfully.

## What's Done

- [x] Completed `feat-041`: completed evidence now expires after 30 days, record metadata remains visible as expired, provider cleanup is automatic/retryable, content access is revoked before deletion, and tapping/clicking the PackTrace logo reloads the page.
- [x] Completed `feat-027`: added Vietnamese-default application localization with English switching, browser-local preference persistence, document language updates, and localized core workspace/account/health/recorder copy while preserving API/user data.
- [x] Completed `feat-028`: added a signed-in phone-first workspace switcher for New record/Evidence archive, preserved mounted form state across sections, auto-opened history after completion, reduced signed-in technical hero content, and added mobile safe-area/touch-target styling.
- [x] Completed `feat-029`: added phone photo/video capture entry points, additive file selection, duplicate warnings and invalid-file handling while preserving valid files.
- [x] Completed `feat-030`: added full evidence viewer, uncropped previews, zoom/navigation controls, video playback and protected original downloads.
- [ ] `feat-013` foundation: added optional Google OAuth configuration validation, versioned AES-256-GCM secret helpers, safe `.env.example` placeholders, and additive migration `0006_create_google_drive_connections.sql`. OAuth routes, connection repository, Drive adapter, and live smoke remain.
- [ ] `feat-013` OAuth client/routes: added PKCE state/challenge generation, `drive.file` offline authorization URL construction, validated token-code exchange, PostgreSQL state consumption, authenticated connect/callback/status/unlink routes, and server wiring.
- [x] Follow-up to `feat-028`: tightened the phone header so the Shopping Recorder brand stays on one line, the language switcher remains visible, and the duplicate Workspace link hides below the small-screen breakpoint.
- [x] Follow-up to `feat-028`: reduced VI/EN switcher buttons to compact 32px controls and removed excess signed-in top spacing between the header and account card on phone layouts.
- [x] Follow-up to `feat-028`: moved the signed-in profile card into a header profile icon popup via a portal; the full account card remains only for signed-out access, removing the large profile block from the workspace.
- [x] Follow-up to `feat-027`: translated remaining visible workflow/history labels, statuses, pagination, selection guidance and accessibility labels that were still English.

- `feat-027` verification: `npm run test --prefix web` 18/18 passed; `npm run typecheck --prefix web` and `npm run build --prefix web` passed. `./init.sh` passed before implementation and harness validation remains 100/100. Device QA on Safari iPhone/Chrome Android was unavailable; deeper dynamic history messages and all device-specific checks remain part of the phone-first follow-up.

- `feat-028` verification: `npm run test --prefix web` 18/18 passed; `npm run typecheck --prefix web` and `npm run build --prefix web` passed. `./init.sh` baseline passed before implementation. No browser runtime was connected for Safari/Android orientation, keyboard or physical-device QA; this limitation is recorded in feature evidence and handoff.

- [x] Added a restartable agent harness for a web + backend project.
- [x] Defined the initial delivery sequence in `feature_list.json`.
- [x] Completed `feat-001`: approved and documented the product scope, stack, environment contract, and planned API surface.
- [x] Completed `feat-002`: created independently runnable `web/` and `backend/` roots with reproducible dependency installation.
- [x] Completed `feat-003`: added validated backend configuration, API health check, structured errors, CORS/logging, API documentation, and a versioned PostgreSQL migration runner.
- [x] Completed `feat-004`: added the responsive React app shell, routes, browser environment validation, health API client, and loading/error/retry UI states.
- [x] Completed `feat-005`: added the versioned shopping-record schema, validation, PostgreSQL repository, and create-record API contract/endpoint.
- [x] Completed `feat-006`: added the responsive web create-purchase form, browser validation, create-record API client integration, and saving, success, and failure feedback.
- [x] Completed `feat-007`: added paginated shopping-history API/UI, category/store/date filters, purchase/created-date sorting, and loading/empty/error/retry states.
- [x] Completed `feat-008`: added validated record updates, confirmed deletion, consistent missing-record behavior, and immediate history refresh.
- [x] Completed documentation-only `feat-009`: corrected the product target from shopping expenses to packing/unpacking image-and-video evidence recording, with S3 and linked Google Drive as storage options.
- [x] Completed documentation-only `feat-010`: approved username/password identity and recovery, persistent session lifetimes, optional Drive-only Google linking, secure credential lifecycle, storage selection, and owner-only access.
- [x] Completed `feat-011`: specified the recorder persistence model, lifecycle constraints, additive migration sequence, provider-neutral upload/retrieval contract, validation, authorization, pagination, and errors.
- [x] Completed `feat-012`: added migrations `0003`–`0005`, session-authorized recorder endpoints, provider-neutral persistence/storage boundaries, and the secure Cloudflare R2 upload/finalization/retrieval flow.
- [x] Completed `feat-014`: added the minimal application-account/session runtime, explicit completion transition, and responsive S3-backed packing/unpacking upload workflow with progress and recovery.
- [x] Completed `feat-020`: replaced Cloudflare R2-specific configuration with Backblaze B2 S3-compatible storage and pinned verified evidence retrieval/cleanup to exact B2 object versions.
- [x] Fixed the `feat-014` upload regression: B2 CORS now permits browser PUT uploads and required headers, and interrupted/rejected uploads no longer surface a misleading verification error when reconciliation fails.
- [x] Completed `feat-015`: added owner-authorized recorder history/detail APIs and a responsive review UI with filters, pagination, evidence detail, and safe image/video retrieval.
- [x] Completed `feat-016`: added audited metadata correction, unfinished-activity cancellation, confirmed completed-evidence deletion, immediate access revocation, exact-version B2 cleanup, and persistent cleanup retry tracking without automatic retention expiry.
- [x] Completed `feat-017`: activated real recorder rate limits, fail-closed unknown-field validation, stable security/cache headers, pre-provider duplicate-attempt rejection, focused abuse/outage/authorization/session/accessibility tests, production dependency audits, and a repeatable automated/manual E2E guide.
- [x] Completed `feat-021`: migrated the browser presentation layer to Tailwind CSS v4 and source-owned shadcn/ui primitives, then refreshed the full responsive recorder workspace without changing its API behavior.
- [x] Completed `feat-022`: made the Evidence files control visibly interactive with drag/drop, selected-file feedback, replace, clear, and per-file removal behavior before upload.
- [x] Completed `feat-023`: fixed the native file-input validation conflict and added local image/video previews for selected evidence.
- [x] Completed `feat-024`: reorganized New Record into a clearer three-step workspace with large review previews and useful file metadata before upload.
- [x] Completed `feat-025`: fixed StrictMode object-URL cleanup so selected images and videos render their actual local preview instead of a broken-media fallback.

## What's Next

1. Select one new unblocked feature only when requested; all product features through `feat-041` are done.
2. `feat-018` remains blocked/deferred by user direction; do not automatically reactivate production work.

## Decisions

- On 2026-09-21, evidence retention changed from indefinite to 30 days after `completed_at`. Expiry preserves activity/asset metadata and audit history, denies retrieval immediately, and deletes exact provider objects through retryable cleanup jobs. The backend sweeps on startup and hourly; provider-native lifecycle rules remain prohibited because they bypass application state/audit.
- On 2026-09-15, the user approved documenting phone-first UX, Vietnamese as the main language with English switching, and Google Drive as preferred new-record storage when connected and available. Phone work precedes Drive; detailed order is proposed in `docs/MOBILE_LOCALIZATION_DRIVE_PLAN.md`. Search, comparison and recovery remain additional backlog. This session authorizes documents and feature breakdown only, not code.

- On 2026-09-13, `feat-017` standardized authentication/recorder throttling on the existing Fastify rate-limit plugin: recorder lifecycle mutations allow 30 requests/minute per client group and upload mutations allow 60/minute; production multi-instance deployments must use a shared store in `feat-018`.

- On 2026-09-13, the user approved `feat-016`: metadata fields may be corrected with audit history; draft/uploading activities may be cancelled; completed activities may be deleted after confirmation; access is revoked before provider cleanup; cleanup failures remain retryable; and the MVP has no automatic expiry.

- On 2026-09-05, the user deferred Google Drive as an optional later storage enhancement. The first releasable recorder workflow proceeds with S3-compatible storage, and `feat-013` no longer blocks recorder quality/release work.
- On 2026-09-05, the user selected Backblaze B2 to replace Cloudflare R2 as the first-release S3-compatible provider. The public provider value remains `s3`; B2 `VersionId` is required and persisted so retrieval is pinned to the exact verified object version.

- Harness supports the conventional `web/` and `backend/` layout, while also detecting `frontend/`, `client/`, `api/`, and `server/` during verification.
- Web: React, TypeScript, and Vite; backend: Node.js, TypeScript, and Fastify; database: PostgreSQL.
- React/Vite, Fastify/Node, PostgreSQL, and Docker-compatible service packaging remain the technical baseline.
- Users may self-register and then authenticate with application-managed username/password; no administrator provisioning or approval is required for registration in the MVP. Google is optional Drive-only linking after application login and is never a login provider or ownership key.
- Email is optional account metadata. Only accounts with an email on file are eligible for self-service password reset; accounts without email have no self-service recovery path.
- Login uses a backend-managed opaque session referenced by a persistent secure cookie, so browser restarts preserve login. Sessions expire after 30 days without activity or 90 days absolutely.
- The prior JWT decision belonged to the retired shopping-record scope and is not accepted for the recorder product.
- Passwords use Argon2id; registration/login/reset are rate-limited; optional-email reset tokens are single-use and stored as digests; password reset revokes all account sessions.
- Google is optional Drive-only linking using `drive.file`, encrypted refresh tokens, explicit revocation, one linked account and app-managed folder per user, and reauthorization state after credential failure.
- One activity uses exactly one selected provider. The internal application user ID owns its records and media; access is owner-only in the MVP.
- Recorder persistence uses `app_users -> recorder_activities -> media_assets -> media_upload_attempts`; Google connections belong to users but never own recorder data.
- Public activity states are `draft`, `uploading`, `complete`, and `cancelled`; `deleted` is an internal tombstone. Asset states are `pending_upload`, `verifying`, `ready`, and `failed`. Completion requires at least one asset and all assets ready.
- Upload retries create attempts under the same asset. Provider IDs and credentials remain server-only; public retrieval uses the application asset ID and a short-lived capability or API stream.
- Applied recorder migrations are `0003_create_app_identity.sql`, `0004_create_recorder_activities.sql`, `0005_create_media_assets.sql`, and `0007_add_recorder_lifecycle_controls.sql`; `0006` remains reserved for deferred Google Drive work and existing `0001`/`0002` remain unchanged.
- Recorder endpoints use one-based pagination consistent with the legacy API, owner-filtered reads, missing/unauthorized `404` equivalence, explicit finalization verification, and stable application error codes.
- The corrected target is packing/unpacking evidence recording with image/video files stored through S3-compatible storage or a user-linked Google Drive account.

## Verification Evidence

- `feat-013` foundation (2026-09-16): `./init.sh` passed; backend `npm run test` passed 49/49 (2 opt-in PostgreSQL tests skipped), `npm run typecheck`, and `npm run build` passed. `npm run migrate` applied `0006_create_google_drive_connections.sql` to local PostgreSQL. No Google OAuth credentials are configured, so live authorization/Drive smoke was not run. Remaining work is explicitly tracked in `feature_list.json` and `session-handoff.md`.
- Local Google configuration check (2026-09-16): backend `.env` contains all four required Google variables; `loadConfig()` reports Google configured with redirect URI `http://localhost:3000/api/v1/google-drive/callback` and 600-second OAuth state TTL. Secret values were not printed.
- OAuth client checks (2026-09-16): backend `npm run test` passes 51/51 non-integration tests (2 opt-in PostgreSQL tests skipped) and `npm run typecheck` passes; live Google authorization remains pending route wiring.
- OAuth route wiring check (2026-09-16): backend typecheck and 51 non-integration tests pass after registering Google routes and repository/service wiring. Live callback was not run; Drive adapter and revocation remain.
- OAuth lifecycle hardening (2026-09-16): unlink revokes the stored Google refresh token before deleting the connection; reconnect reuses the encrypted token when Google omits `refresh_token`. Typecheck and 51 non-integration tests pass.
- Drive client foundation (2026-09-16): added server-only refresh-token exchange and Drive API helpers for activity-folder creation, metadata, download, and deletion. Backend now has 52 passing non-integration tests (2 opt-in PostgreSQL skipped).

- `feat-025` (2026-09-14): the user screenshot exposed valid JPEG previews falling back to the broken-media icon. Root cause was object URL creation in a state initializer combined with cleanup during React StrictMode effect replay. URL creation/revocation now share one file-scoped effect, which creates a fresh live URL after replay. A dedicated StrictMode regression test verifies only the stale URL is revoked. `npm run test && npm run typecheck && npm run build` in `web/` passed with 18/18 tests. Final `./init.sh` and harness validation passed. Browser connection remained unavailable for interactive QA.
- `feat-024` (2026-09-14): redesigned the full-width New Record workspace around Activity details, Add evidence, and Review & upload; added large image/video previews, full-size image links, video playback, file metadata, review guidance, and removal controls without changing the API/upload contract. `npm run test && npm run typecheck && npm run build` in `web/` passed with 17/17 tests. Final `./init.sh` and harness validation passed. Browser runtime discovery returned zero instances, so interactive visual QA was unavailable.
- `feat-023` (2026-09-14): removed conflicting native `required` validation while retaining state-backed selection validation and disabled submit behavior; selected images/videos now use revocable local object URLs for preview. Final `./init.sh` passed. `npm run test && npm run typecheck && npm run build` in `web/` passed with 17/17 tests, including real button-click submission and image-preview assertions. Harness validation remains 100/100. Browser runtime discovery returned no instances.
- `feat-022` (2026-09-14): baseline and final `./init.sh` passed. `npm run test && npm run typecheck && npm run build` in `web/` passed with 17/17 tests; focused coverage verifies dropped files appear immediately and can be removed before upload. Harness validation remains 100/100. Browser runtime discovery returned no instances, so interactive visual QA was unavailable; Vite was left running at `http://127.0.0.1:5173` for manual refresh/testing.
- `feat-021` (2026-09-14): `./init.sh` passed before and after the UI migration. `npm run test && npm run typecheck && npm run build` in `web/` passed with 16/16 tests and a production Vite bundle. `npm audit --omit=dev` reported 0 production vulnerabilities. `feature_list.json` parses and the harness validator remains 100/100. Interactive visual QA could not run because the Browser runtime listed zero available browser instances; no alternate browser automation was substituted.
- `feat-021` architecture: Tailwind CSS v4 uses `@tailwindcss/vite`; reusable Button/Card/Badge/Input/Label/Select/Textarea/Progress primitives are source-owned under `web/src/components/ui/`; `web/components.json` records shadcn configuration; TypeScript 7-compatible aliases use `paths` without the removed `baseUrl` option. Backend code and the `/api/v1` contract were unchanged.

- `./init.sh` — passes before and after `feat-017`.
- `npm run test && npm run typecheck && npm run build` in `backend/` — passes outside the sandbox: 52 tests passed, 2 opt-in PostgreSQL integrations skipped, typecheck/build passed.
- `RUN_DATABASE_INTEGRATION=1 node --env-file=.env --import tsx --test src/auth/repository.integration.test.ts src/recorder/repository.integration.test.ts` — passes 2/2 and cleans all fixtures.
- `npm run test && npm run typecheck && npm run build` in `web/` — passes: 26/26 tests, typecheck, and production build.
- `npm audit --omit=dev` in `backend/` and `web/` — registry audit passes with 0 production vulnerabilities in both roots. Initial sandbox attempts failed DNS and were rerun with approved network access.
- Browser visual E2E — unavailable because the in-app browser runtime listed no browser instances. `docs/TESTING.md` records the exact disposable-account/B2 browser workflow rather than substituting an unrelated browser.
- Contract/state/harness — all 9 API JSON examples and `feature_list.json` parse; harness validator scores 100/100.

- `./init.sh` — passes before and after `feat-016`; locked dependencies install successfully.
- `npm run migrate` in `backend/` — applied `0007_add_recorder_lifecycle_controls.sql` successfully to local PostgreSQL.
- `npm run test && npm run typecheck && npm run build` in `backend/` — passes outside the sandbox on 2026-09-13: 45 tests passed, 2 opt-in integrations skipped, typecheck/build passed. The expected sandbox-only `tsx` IPC `EPERM` was recorded before the outside-sandbox run.
- `RUN_DATABASE_INTEGRATION=1 node --env-file=.env --import tsx --test src/recorder/repository.integration.test.ts` — passes 1/1; verifies correction audit, completed deletion/tombstone visibility, exact-version cleanup jobs, retry completion, and event ordering against migration `0007`, then cleans fixtures.
- `npm run test && npm run typecheck && npm run build` in `web/` — passes: 24/24 tests, typecheck, and Vite production build.
- Contract/state/harness — `feature_list.json` and all 9 API JSON examples parse; harness validator scores 100/100.

- `./init.sh` — passes before and after `feat-020`; locked dependencies install successfully.
- `npm run test && npm run typecheck && npm run build` in `backend/` — passes outside the sandbox: 36 tests passed, 2 opt-in PostgreSQL tests skipped, typecheck/build passed. The sandbox attempt hit the known `tsx` IPC `EPERM` restriction.
- `RUN_DATABASE_INTEGRATION=1 node --env-file=.env --import tsx --test src/recorder/repository.integration.test.ts` — passes 1/1 and confirms the verified provider version is persisted and returned for retrieval; fixtures were cleaned.
- `npm run test && npm run typecheck && npm run build` in `web/` — passes: 19/19 tests, typecheck, and production build.
- Backblaze adapter coverage — verifies region-specific SigV4 presigning, unique attempt keys, required B2 version IDs, version-pinned verification/download, version-specific failed upload cleanup, metadata/type/size/SHA-256 checks, and provider outage/missing-object handling.
- Live B2 smoke — not run because `backend/.env` does not yet contain real B2 bucket/application-key configuration and bucket CORS has not been confirmed.

- `npm run test && npm run typecheck && npm run build` in `backend/` — passes outside the sandbox on 2026-09-05: 34 tests passed, 2 opt-in PostgreSQL integration tests skipped, typecheck/build passed.
- `RUN_DATABASE_INTEGRATION=1 node --env-file=.env --import tsx --test src/auth/repository.integration.test.ts src/recorder/repository.integration.test.ts` — passes 2/2 against local PostgreSQL; verifies Argon2-backed account/session persistence and revoke plus asset finalization, owner isolation, and activity completion. Fixtures were cleaned.
- `npm run test && npm run typecheck && npm run build` in `web/` — passes on 2026-09-05: 19/19 tests, typecheck, and Vite production build.
- Local HTTP smoke on backend port 3001 — register `201`, session restore `200`, logout `204`, and recorder activity creation returns the expected `409 STORAGE_PROVIDER_NOT_AVAILABLE` because local R2 is intentionally unconfigured. The temporary smoke account, session, response files, and cookie jar were deleted.
- Browser visual QA — unavailable because the browser runtime reported no available browser instance; component tests cover account restoration/registration and upload/finalize/retry/completion UI behavior.
- Contract/state parse and harness — `feature_list.json` and all 9 JSON examples in `docs/API_CONTRACT.md` parse successfully; the harness validator scores 100/100 across instructions, state, verification, scope, and lifecycle. Final `./init.sh` passes.

- `./init.sh` — passes on 2026-09-05 before and after completing `feat-012`; locked web/backend dependencies install successfully.
- `npm run test && npm run typecheck && npm run build` in `backend/` — passes outside the sandbox on 2026-09-05: 30 tests passed, 1 opt-in database integration test skipped, typecheck/build passed. The sandbox attempt hit the known `tsx` IPC `EPERM` restriction.
- `RUN_DATABASE_INTEGRATION=1 node --env-file=.env --import tsx --test src/recorder/repository.integration.test.ts` in `backend/` — passes 1/1 against local PostgreSQL; verifies persisted asset creation, finalization, ready retrieval, and owner isolation, then removes its fixtures.
- `npm run test && npm run typecheck && npm run build` in `web/` — passes on 2026-09-05: 14/14 tests, typecheck, and Vite production build.
- `npm run migrate` in `backend/` plus schema inspection — passes; local PostgreSQL records migrations `0001`–`0005` and contains all six identity/recorder tables introduced by `0003`–`0005`.
- R2 adapter tests cover short-lived non-overwriting attempt keys, signed headers, provider binding, byte-signature media detection, streamed SHA-256, missing objects, mismatches, outages, cleanup, retry reference rotation, and authorized retrieval. Live R2 smoke testing was not run because `backend/.env` has no R2 credentials/bucket configured.
- Harness validation — passes at 100/100 across instructions, state, verification, scope, and lifecycle; `feature_list.json` and all 8 JSON examples in `docs/API_CONTRACT.md` parse successfully.

- `./init.sh` — passes on 2026-09-03 before activating `feat-012`; installs locked dependencies in `web/` and `backend/` successfully.
- `./init.sh` — passes on 2026-09-03 before activating `feat-011`; installs locked dependencies in `web/` and `backend/` successfully.
- `./init.sh` — passes on 2026-09-03 before activating documentation-only `feat-010`; installs locked dependencies in `web/` and `backend/` successfully.
- `./init.sh` — passes on 2026-09-03 after finalizing `feat-010`; no application code, migration, endpoint, or environment contract was changed.
- Manual contract-example parse check — all 8 JSON examples in `docs/API_CONTRACT.md` parse successfully with `JSON.parse`.
- `npm run test --prefix web && npm run typecheck --prefix web && npm run build --prefix web` — passes; 14/14 web tests and production build succeed.
- `npm run test --prefix backend` — sandbox attempt is blocked by `tsx` IPC pipe creation (`EPERM`); rerun outside sandbox passes 15/15 tests.
- `npm run typecheck --prefix backend && npm run build --prefix backend` — passes outside the sandbox after the backend test rerun.
- `./init.sh` — passes after `feat-011` documentation and harness finalization.

- `./init.sh` — initial attempt failed with `permission denied` because the file lacked executable permission.
- `chmod +x init.sh; ./init.sh` — passes as a clean-harness baseline; reports that application manifests have not been created.
- `./init.sh` — passes after package manifests and lockfiles were added; installs web and backend dependencies reproducibly.
- `npm run typecheck` and `npm run build` in `web/` — pass.
- `npm run typecheck` and `npm run build` in `backend/` — pass.
- `npm run start` in `backend/` — service listens at `http://127.0.0.1:3000` outside the execution sandbox.
- `npm run test` in `backend/` — 4/4 pass outside the execution sandbox; `tsx` requires an IPC pipe that sandboxing blocks.
- `npm run typecheck` and `npm run build` in `backend/` — pass after the platform-foundation changes.
- `PORT=3001 npm run start` in `backend/` — pass; service listens at `http://127.0.0.1:3001`. Port 3000 was already occupied by another process and was left untouched.
- `npm run migrate` in `backend/` — not run; it requires a real PostgreSQL `DATABASE_URL`, which is not provisioned locally.
- `npm run test` in `web/` — 4/4 pass for the health API client and status component states.
- `npm run typecheck` and `npm run build` in `web/` — pass after the application-foundation changes.
- `./init.sh` — passes after frontend router and test dependencies were locked.
- `npm run test` in `backend/` — 8/8 pass after adding shopping-record API/domain coverage.
- `npm run build` in `backend/` — pass after adding the shopping-record migration/repository/API endpoint.
- `./init.sh` — passes after the corrected backend test-discovery script.
- `npm run test` in `web/` — 7/7 pass after adding the create-record API client and form behavior coverage.
- `npm run typecheck` and `npm run build` in `web/` — pass after the create-record UI changes.
- `npm run test` in `backend/` — 8/8 pass outside the execution sandbox; `tsx` IPC remains blocked inside the sandbox.
- `npm run typecheck` and `npm run build` in `backend/` — pass while verifying the existing create-record API contract.
- `./init.sh` — passes after `feat-006`.
- `npm run test` in `web/` — 11/11 pass after adding shopping-history API client and UI states coverage.
- `npm run typecheck` and `npm run build` in `web/` — pass after shopping-history UI changes.
- `npm run test` in `backend/` — 12/12 pass outside the execution sandbox after adding list API and query validation coverage.
- `npm run typecheck` and `npm run build` in `backend/` — pass after adding the paginated PostgreSQL repository query.
- `./init.sh` — passes after `feat-007`.
- `npm run test` in `web/` — 14/14 pass after adding edit/delete API-client and UI interaction coverage.
- `npm run typecheck` and `npm run build` in `web/` — pass after record-maintenance UI changes.
- `npm run test` in `backend/` — 15/15 pass after adding update/delete API coverage.
- `npm run typecheck` and `npm run build` in `backend/` — pass after adding PostgreSQL update/delete operations.
- `./init.sh` — passes after `feat-008`.
- `./init.sh` — passes before the documentation-only scope correction in `feat-009`; it installed locked dependencies in `web/` and `backend/` successfully.

## Local MVP Run

### 2026-09-13 Feature 019 legacy inventory

- `feat-018` was explicitly deferred by the user and marked `blocked`; its implemented production-readiness slice remains intact. Activated only `feat-019` after a passing `./init.sh` baseline.
- Legacy UI is already absent from `HomePage`, but unused shopping create/history components and tests remain. The web API module still exports shopping types and CRUD clients. Backend still wires four `/api/v1/shopping-records` routes plus its repository/domain/tests.
- Read-only local PostgreSQL inventory returned `0 rows, 24 kB` for `shopping_records`. Full removal therefore needs no local data transformation, but dropping the table and endpoints is still a breaking contract/data migration and awaits explicit user approval.
- The user approved full removal. Deleted the dead web shopping components/client/tests and backend routes/domain/repository/tests, removed the obsolete JWT environment example, and updated every affected contract/architecture/product/data-model document.
- Added forward migration `0008_drop_legacy_shopping_records.sql`; `npm run migrate` applied it successfully. PostgreSQL confirms `to_regclass('public.shopping_records') IS NULL` and records migration `0008`; migration `0002` remains byte-for-byte unchanged.
- Verification: backend `npm run test && npm run typecheck && npm run build` passed outside sandbox (46 passed, 2 opt-in integrations skipped); auth+recorder PostgreSQL integration passed 2/2; web same regression command passed (16/16). Live endpoint smoke returned `404 ROUTE_NOT_FOUND`, readiness returned 200, web served normally, and graceful restart on backend 3001 succeeded.

### 2026-09-13 Feature 018 production-readiness slice

- Activated only `feat-018`. Added `X-Request-Id`, no-store liveness, dependency-backed readiness, explicit `TRUST_PROXY`, production fail-fast requirements, and graceful signal shutdown. The existing health contract remains backward compatible; `/api/v1/health/ready` is additive.
- Added independently buildable backend/web Dockerfiles, required build-time web API URL, SPA/static-cache nginx configuration, readiness/static healthchecks, and `docs/OPERATIONS.md` for rollout, observability, cost/retention, backup/restore, provider outage, and release gating.
- Verification: backend `npm run test && npm run typecheck && npm run build` passed outside sandbox (56 passed, 2 opt-in integrations skipped); web same command passed (26/26). `shopping-recorder-backend:feat-018` and `shopping-recorder-web:feat-018` built successfully; nginx syntax and Argon2 runtime smoke checks passed. Live `GET http://localhost:3001/api/v1/health/ready` returned 200 `ready`, `Cache-Control: no-store`, and `X-Request-Id`.
- Runtime: the updated backend remains on 3001 and web on 5173. A stale npm/tsx watcher that respawned port 3000 was terminated at its process tree; only 3001/5173 remain among project Node listeners.
- Remaining decisions/blockers: production deployment target/TLS/secret-manager topology, replica count (shared rate-limit state is required for multiple replicas), concrete database backup RPO/RTO/retention, and operational malware scanner versus explicit acceptance of unscanned-media risk. `feat-018` stays `in-progress` until these are approved and verified.
- User direction update: the user explicitly deferred those production decisions until later. `feat-018` is now `blocked` with its completed slice preserved, and only `feat-019` has been activated for legacy-scope decision/inventory work.

### 2026-09-13 Password boundary adjustment

- Reopened only `feat-017` at user direction and changed the shared registration/login password boundary from 12–128 to 6–128 characters in the browser form, Fastify request schema, authentication service, API contract, and architecture notes.
- Added backend boundary coverage proving a six-character password is accepted and five characters are rejected; the existing web account test now submits six characters and verifies the browser constraint.
- Verification: backend `npm run test && npm run typecheck && npm run build` passed outside the sandbox (53 passed, 2 opt-in integrations skipped); web same command passed (26/26). The initial sandboxed backend test attempt hit the known `tsx` IPC `EPERM` restriction.
- Final restartability/contract checks: `./init.sh` passed, all 9 API JSON examples and `feature_list.json` parsed, and harness validation remained 100/100. `feat-017` returned to `done`.
- Local test stack: the updated backend listens on `127.0.0.1:3001`, Vite runs at `http://localhost:5173`, and the browser-facing `VITE_API_BASE_URL` is `http://localhost:3001/api/v1` so authentication cookies remain same-site. The earlier `127.0.0.1` browser API hostname caused upload requests to lose the localhost session and was corrected after reproducing `AUTH_REQUIRED`. HTTP smoke returned health 200, CORS allows the localhost origin with credentials, six characters reach credential evaluation, and five return validation 400. The pre-existing process on port 3000 was left untouched and no diagnostic account was created; `./init.sh` passed after the runtime correction.

- On 2026-09-02, a local Docker PostgreSQL 16 container named `shopping-recorder-db` was created with database/user `shopping_recorder`/`shopping`; migrations `0001` and `0002` were applied successfully.
- Local-only `backend/.env` and `web/.env` were created. The backend is running at `http://127.0.0.1:3000`, the web at `http://127.0.0.1:5173`, and the health smoke check returned `{ "data": { "status": "ok" } }`.
- Stop the local database with `docker stop shopping-recorder-db`; start it later with `docker start shopping-recorder-db`.

## Blockers / Risks

- Local account registration was restored on 2026-09-05 by replacing the placeholder PostgreSQL credentials in `backend/.env` with the existing local `shopping-recorder-db` configuration and restarting the backend. Migrations passed, the auth PostgreSQL integration passed 1/1 outside the sandbox, a real local registration returned HTTP 201, and the exact diagnostic account was deleted afterward.
- No active implementation blocker. On 2026-09-05, database evidence identified the reported finalize failure as `OBJECT_NOT_FOUND`: B2 had blocked the preceding browser upload because bucket CORS lacked PUT and the signed request headers. The S3-compatible CORS rule now preserves GET/HEAD and adds PUT, `Content-Type`, `x-amz-meta-activity-id`, and `x-amz-meta-asset-id`. Live preflight returned 200 and a temporary JPEG completed upload, verification, version pinning, and exact-version cleanup. Retention/deletion/audit/cleanup retry are complete in `feat-016`, and upload-abuse regression coverage is complete in `feat-017`. No malware engine is configured; selection or explicit risk acceptance is a `feat-018` production gate.
- On 2026-09-05, the user chose to perform the remaining B2/CORS browser check manually. `npm run build` in `web/` passed and produced `web/dist/` for that check.

## 2026-09-05 Upload Verification Regression

- State: reopened only `feat-014`, diagnosed and fixed the browser-to-B2 upload regression, then returned it to `done`; no work began on `feat-015`.
- Root cause: the three latest failed attempts were `OBJECT_NOT_FOUND`. The B2 bucket CORS rule allowed only GET/HEAD and did not allow PUT or the request's content/metadata headers, so the browser preflight blocked upload before finalization.
- Code decision: preserve interrupted-response reconciliation, but retain and show the original upload error if finalization also fails. This prevents an upload/CORS failure from being mislabeled as media verification failure.
- External configuration: B2 S3-compatible CORS now allows origin `http://localhost:5173`, methods GET/HEAD/PUT, and headers `authorization`, `range`, `content-type`, `x-amz-meta-activity-id`, and `x-amz-meta-asset-id`.
- Verification: `./init.sh` passed; web `npm run test && npm run typecheck && npm run build` passed (19/19); backend same command passed outside sandbox (36 passed, 2 opt-in integrations skipped); live OPTIONS preflight returned 200 with PUT and required headers; live temporary JPEG upload returned 200 and passed MIME/size/SHA-256/version verification before exact-version cleanup; final harness validation scored 100/100.

## 2026-09-05 Feature 015

- State: completed owner-authorized activity history, detail, and safe evidence review for the supported S3/B2 provider; Google Drive and destructive lifecycle behavior remained out of scope.
- Backend: added validated one-based pagination, operation/status/provider/time filters, stable `occurredAt`/ID sorting, owner-scoped list/detail repository methods, asset ordinal ordering, and missing/unauthorized `404` equivalence.
- Web: added credentialed history/detail clients and a responsive archive with loading, empty, retryable error, filter, pagination, detail, image preview, video playback, and media-load error states. Completion refreshes history immediately.
- Security: public resources omit ownership/provider references; media loads only through the authenticated application content endpoint and its no-store, short-lived, exact-version B2 redirect.
- Verification: backend `npm run test` 40 pass/2 opt-in integrations skipped, typecheck/build pass; PostgreSQL recorder integration 1/1 pass with fixture cleanup; web tests 22/22, typecheck/build pass; harness 100/100. In-app browser visual QA was unavailable because the runtime exposed no browser instance.

## 2026-09-15 Feature 026 — Documentation and Feature Breakdown

- Completed only `feat-026`. Added `docs/MOBILE_LOCALIZATION_DRIVE_PLAN.md` in Vietnamese with scope, acceptance criteria, verification, provider-default states and a proposed delivery sequence. Updated product, architecture and clearly unimplemented future API notes.
- Added `feat-027`–`feat-034`; retained/reprioritized `feat-013` for Google connection/adapter and assigned provider defaults to `feat-031`. All nine implementation features remain `not-started`; `feat-018` remains `blocked`.
- Decisions: Vietnamese first plus browser-local English preference; phone-first workspace/capture/review; valid available Drive preferred for new records with explicit B2 choice; no automatic provider switching, old-record migration or file deletion on unlink. Recovery initially covers server-created activities and may require reselecting files; background/offline video upload is not promised.
- Skill influence: harness-creator kept planning in one active feature, explicit acceptance/evidence boundaries and current startup instructions. The structural validator reported 100/100 (five subsystems each 5/5); this does not verify planned product behavior.
- Verification commands: `./init.sh` passed; `node .agents/skills/harness-creator/scripts/validate-harness.mjs --target .` passed. The read-only check below validates feature state and contract examples.
- Scope: edited only the four product/architecture/contract/roadmap documents, `feature_list.json`, `progress.md` and `session-handoff.md`. No application source, migration, package/lockfile or environment edits. Application tests/builds, device QA and Google smoke were not run for documentation-only scope. Earlier `git status` was unavailable because this directory is not a Git worktree; no Git diff is claimed.

```bash
node <<'NODE'
const fs = require('node:fs'), assert = require('node:assert/strict');
const features = JSON.parse(fs.readFileSync('feature_list.json', 'utf8')).features;
const byId = new Map(features.map(f => [f.id, f]));
assert.equal(byId.size, features.length);
const visited = new Set(), active = new Set();
function visit(id) {
  assert(byId.has(id)); assert(!active.has(id));
  if (visited.has(id)) return;
  active.add(id); byId.get(id).dependencies.forEach(visit);
  active.delete(id); visited.add(id);
}
features.forEach(f => visit(f.id));
assert.equal(features.filter(f => f.status === 'in-progress').length, 0);
assert.equal(byId.get('feat-026').status, 'done');
assert.equal(byId.get('feat-018').status, 'blocked');
features.filter(f => f.id === 'feat-013' || Number(f.id.slice(5)) >= 27).forEach(f => {
  assert.equal(f.status, 'not-started'); assert(f.acceptance_criteria.length >= 3);
});
const plan = fs.readFileSync('docs/MOBILE_LOCALIZATION_DRIVE_PLAN.md', 'utf8');
for (const id of plan.match(/feat-\d{3}/g) || []) assert(byId.has(id));
let examples = 0;
for (const match of fs.readFileSync('docs/API_CONTRACT.md', 'utf8').matchAll(/```json\n([\s\S]*?)```/g)) {
  JSON.parse(match[1]); examples++;
}
console.log(`${features.length} features valid; no cycles or active work; backlog unstarted; ${examples} API examples valid`);
NODE
```


## 2026-09-16 — Continue feat-013: Google Drive adapter and connection UI

- Continued the sole active feature, feat-013. Startup `./init.sh` passed. Git status is unavailable because this directory is not a Git worktree; no diff/commit is claimed.
- Added Drive resumable initiation and an authenticated, origin-checked backend upload proxy. Session URLs are encrypted at rest and never returned to the browser. Uploads use exact declared length, owner/account/lifecycle/expiry checks and a one-use transfer guard; finalize reconciles interrupted responses. Existing B2 direct uploads do not send cookies.
- Added Drive verification of app binding, byte count, metadata and detected content type, and SHA-256 against a retained binary revision. Reads stay on that revision after Drive head edits; missing/trashed revisions fail closed. Downloads include safe original filenames. Unlink and account replacement preserve old file references and require the original account for reads/cleanup.
- Removed a previously unnoticed S3-only repository insertion guard and parameterized the activity provider. Existing B2 behavior remains covered by regression/integration checks. Drive works without B2 configuration in development using the existing default media limits; production's B2 requirement is unchanged.
- Hardened OAuth: state consumed only by its owning current application user, origin-checked POST initiation, token reuse only for the same provider account, root preservation/rediscovery, provider-state probing, rate limits/no-store, query omission in request logs, and revocation tokens moved from URL to POST body. Unlink invalidates pending OAuth states and retains credentials if provider revocation fails.
- Added VI/EN profile controls for connection status, connect/reconnect/replace and confirmed unlink, plus a warning before leaving unsaved work for OAuth. Provider-selection/default form UI remains feat-031; no second feature was activated.
- Baseline defect discovered by `npm run migrate --prefix backend`: applied 0006 had OAuth-state SQL appended in a prior session. Read-only database checksum comparison proved the original 608-byte prefix exactly matches the migration ledger. Restored that original file; moved state creation to 0010, added upload guard in 0009. Rerun applied both successfully without changing ledger checksums or resetting data.
- Verification: `npm run test --prefix backend && npm run typecheck --prefix backend && npm run build --prefix backend` passed (69 tests, 3 opt-in integrations skipped). `npm run test --prefix web && npm run typecheck --prefix web && npm run build --prefix web` passed (23 tests). Sandbox tsx IPC/socket EPERM required approved escalated runs.
- Live PostgreSQL command (backend directory): `RUN_DATABASE_INTEGRATION=1 node --env-file=.env --import tsx --test src/auth/repository.integration.test.ts src/recorder/repository.integration.test.ts src/google/repository.integration.test.ts` passed 3/3. Drive uses a fake Google client against real PostgreSQL to prove upload, finalize, read, unlink, cleanup and owner isolation; fixtures were removed.
- Remaining gate: authorized real Google consent/upload/revision/download/lifecycle smoke and physical browser/device QA. Configuration is present but google_drive_connections has zero rows. Browser skill discovery returned an empty browser list, so no visual/provider smoke is claimed. Keep feat-013 in-progress; feat-018 remains deferred. Exact manual workflow and provider references are recorded in docs/TESTING.md and docs/API_CONTRACT.md.
- Final restartability check: `./init.sh` passed; read-only JSON validation confirmed feat-013 is the sole in-progress feature and all 9 API JSON examples parse successfully.


## 2026-09-16 — Live Drive verification and feat-031 activation

- User confirmed Google consent/sign-in succeeded. Startup `./init.sh` passed. Added explicitly opt-in `backend/src/google/live-smoke.test.ts`; it selects the sole linked authorized test account (or requires GOOGLE_DRIVE_SMOKE_USER_ID), creates only disposable evidence and cleans its own files, folders and database rows.
- `RUN_GOOGLE_DRIVE_SMOKE=1 node --env-file=.env --import tsx --test src/google/live-smoke.test.ts` in backend passed 1/1 against Google: upload/verification/original-byte download, retained revision after editing the Drive head, missing-file denial, completed-record deletion and unfinished-upload cancellation. Existing connection and evidence preserved. Approved escalation was needed for PostgreSQL/Google network access.
- Backend normal test/typecheck/build passed: 69 tests, four opt-in tests skipped. Marked feat-013 done with user/live/automated evidence; physical mobile/video QA remains unavailable. Activated only feat-031 for provider availability and selection UX.


## 2026-09-17 — Feature 031 storage selection completed

- Continued only the existing in-progress feat-031 and marked it done after verification. feat-018 remains blocked/deferred; feat-032/033/034 remain not-started. This checkout has no .git directory, so Git diff/status/commit are unavailable.
- Added authenticated GET /api/v1/storage-providers with no-store for success/errors, configured B2 availability and owner-specific probed Drive connection state. No secrets/provider references enter the response. B2 configuration and Drive root access are snapshots, not live quota guarantees.
- Web now defaults untouched new forms to available Drive, otherwise B2. Explicit selections survive focus/manual/unlink refresh, including unavailable choices that block creation until recovery or deliberate change. Status-request failure/loading never permits a blind upload. Fields and files stay in memory through refresh and VI/EN switching.
- Selected provider freezes at creation; failures show connection/free-space recovery and retry uses the same activity/assets. Added localized storage controls and a fresh-record action that clears completed work and recalculates defaults. Embedded existing Google connection controls now use type=button to avoid accidental form submission and preserve the OAuth departure warning/cancel path.
- Removed the hidden B2-only history filter; detail already displays the actual provider and its Storage label now localizes. Updated API, architecture, product, roadmap and testing notes. No database/environment/migration changes.
- Verification commands: startup and final `./init.sh` passed. `npm run test --prefix web && npm run typecheck --prefix web && npm run build --prefix web` passed: 33/33. `npm run test --prefix backend && npm run typecheck --prefix backend && npm run build --prefix backend` passed: 78 passed, 4 opt-in tests skipped. A sandbox rerun hit tsx IPC EPERM and passed with approved escalation. Initial regressions caught the obsolete B2-only test expectation and a missing no-store URL guard; both corrected and rerun successfully.
- Browser skill bootstrap and documented discovery returned no browser instances ([]). Physical Safari iPhone/Chrome Android, mobile visual layouts and live UI/provider upload checks are unavailable; exact follow-up is in docs/TESTING.md. Database/live Google smoke was not repeated because persistence/provider adapters did not change; prior feat-013 evidence remains historical.
- Next work: feat-032 server-side owner-scoped reference search, with matching semantics documented before its additive contract implementation. Do not reopen production decisions in feat-018 implicitly.


## 2026-09-17 — Drive browser upload CORS regression

- Reopened only feat-031 for the user's Drive upload report and returned it to done after verification. Startup `./init.sh` passed.
- Root cause verified on the running API: OPTIONS for the Drive upload proxy returned 204 but Access-Control-Allow-Methods only GET,HEAD,POST. Browser PUT never reached the route, then finalize returned 422. This is application API CORS, not B2 bucket CORS. Google callback origin and browser API both use localhost:3000.
- Added explicit GET/HEAD/POST/PUT/PATCH/DELETE/OPTIONS to backend CORS while preserving the configured localhost:5173 origin and credentials. Added preflight coverage for Drive PUT, metadata PATCH, unlink DELETE and foreign-origin denial. This also corrects browser access to existing PATCH/DELETE routes.
- uploadMedia now returns UPLOAD_NETWORK_ERROR with server-strategy Google Drive or direct-strategy application-storage guidance, without incorrectly blaming B2 bucket CORS. Workflow renders the corresponding VI/EN translation. Added XHR network-error tests for both strategies.
- Exact verification: `npm run test --prefix web && npm run typecheck --prefix web && npm run build --prefix web` passed (35/35). `npm run test --prefix backend && npm run typecheck --prefix backend && npm run build --prefix backend` passed outside sandbox (79 passed, 4 opt-in tests skipped). No migrations or provider credential/bucket changes.
- Live verification: `curl -sS -i -X OPTIONS --max-time 10 -H 'Origin: http://localhost:5173' -H 'Access-Control-Request-Method: PUT' -H 'Access-Control-Request-Headers: content-type' http://localhost:3000/api/v1/google-drive/uploads/00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002` now returns 204 with PUT allowed, configured origin, credentials=true, content-type allowed. This is read-only preflight, not an actual Google upload.
- Running backend watcher reloaded the fix on localhost:3000; web uses localhost:5173 and VITE_API_BASE_URL=http://localhost:3000/api/v1. User can retry the failed file in the still-open workflow; no user activity/file was modified by diagnosis. Full browser retry remains user verification; do not refresh an unfinished form merely to test CORS.


## 2026-09-17 — Feature 032 reference search completed

- User confirmed the Drive upload fix worked and requested the next feature. Activated only feat-032 after startup `./init.sh` passed; completed it after verification. feat-018 remains deferred, feat-033/034 remain not-started.
- Documented the additive optional reference query before implementation: literal substring, case-insensitive with PostgreSQL lower/collation, query edges trimmed, empty means no filter, internal whitespace/accents/punctuation preserved, max 160 characters, NUL/repeated parameters rejected. Stored user references never change. Search covers all owned non-deleted rows before count/pagination and combines with existing filters using AND.
- SQL uses parameterized strpos(lower(reference), lower(parameter)) so %, _, backslash and quotes are literal, not patterns or SQL. Reuses the owner/history indexes and bounded page/pageSize; substring matching can scan the owner's matching rows at large volumes, and no trigram extension or schema migration was introduced.
- Added VI/EN reference input, help and clear action. Apply and clear reset to page one; paging retains the query. Clear removes only the search while retaining applied filters. Loading/empty/error/retry states localize, unknown server errors use a generic message, and input persists on language changes. Fixed existing cancelled status schema omission to match its UI/domain/API contract.
- Verification: `npm run test --prefix web && npm run typecheck --prefix web && npm run build --prefix web` passed (38/38). `npm run test --prefix backend && npm run typecheck --prefix backend && npm run build --prefix backend` passed outside sandbox (80 passed, 5 opt-in skipped). Initial backend regression was an expected-query test missing the new optional field; updated and reran successfully.
- PostgreSQL verification (backend directory): `RUN_DATABASE_INTEGRATION=1 node --env-file=.env --import tsx --test src/recorder/repository.integration.test.ts` passed 2/2. Fixtures use unique temporary accounts and clean only their rows. Proved pagination/counts, B2/Drive, owner isolation, deleted/null exclusion, combined status/provider/date filters, literal %, _, backslash, quotes, Unicode, accent/internal-space distinctions and no-match behavior.
- Browser skill's existing runtime discovery again returned []; no physical mobile/visual QA claimed. Automated component tests cover VI/EN search states and preservation. Local processes confirmed listening on 5173 and 3000; no restart/config/provider changes needed.
- API JSON examples parse; feature state has one completed search feature and no active feature. Next session: feat-033 manual packing/unpacking comparison; use the documented substring search carefully and do not assume a reference is unique or automatically pair records.

## 2026-09-17 — Feature 033 manual comparison completed

- Activated only feat-033 after `./init.sh` passed. Added `GET /api/v1/recorder-activities/comparison-candidates?reference=...`: session-required, no-store through the existing recorder prefix, trimmed case-insensitive exact matching, parameterized SQL, newest-first ordering, other-owner/tombstone exclusion, and independent 50-record bounds for packing and unpacking. Public results omit assets, owner IDs and provider references. Duplicate/unknown/blank/NUL/overlong parameters fail validation.
- Exact comparison intentionally differs from feat-032 substring search. All visible lifecycle states remain candidates so the operator can see incomplete/cancelled records. Multiple candidates require explicit selection; a side with exactly one candidate is selected for convenience. The app never persists a pair, assumes reference uniqueness, automatically pairs multiple records, or performs AI assessment.
- Added a VI/EN comparison panel to Evidence archive. Phone uses packing/unpacking tabs; `lg` layouts show both columns. Each selected side shows localized time/status, provider, notes, image/video evidence, not-ready and media-error states, plus the existing protected original download. Missing sides and >50-per-side truncation are explicit. Language switching preserves the comparison.
- Verification: `npm run test --prefix web && npm run typecheck --prefix web && npm run build --prefix web` passed (42/42). `npm run test --prefix backend && npm run typecheck --prefix backend && npm run build --prefix backend` passed outside sandbox (83 passed, 5 opt-in skipped). `RUN_DATABASE_INTEGRATION=1 node --env-file=.env --import tsx --test src/recorder/repository.integration.test.ts` in backend passed 2/2 with temporary fixtures cleaned.
- Final `./init.sh` passed. Harness validation scored 100/100; feature JSON and all API JSON examples parse. No migration, environment, provider, stored-reference or evidence mutation was added. Local web/backend watchers remain on 5173/3000.
- Applied the Browser skill for local responsive UI QA. Browser bootstrap troubleshooting and the required one-time discovery returned no browser instances (`[]`), so interactive phone/wide visual QA is unavailable; the exact manual device workflow is recorded in `docs/TESTING.md`.
- Feature state returned to no active feature. Next unblocked work is feat-034 recovery of server-created unfinished activities; feat-018 remains blocked/deferred.

## 2026-09-17 — Feature 034 unfinished activity recovery completed

- Activated only feat-034 after `./init.sh` passed. Added the Evidence archive unfinished-work view, which loads owner-scoped `draft` and `uploading` activities after reload, deduplicates records and opens the existing server activity detail. The original storage provider is displayed and never replaced by the current new-record default.
- Ready assets remain verified and require no local file. Pending/failed/verifying assets can be selected again only when filename, content type, byte size and SHA-256 all match the server identity. Retry reuses the same asset and existing retry/finalize ownership invariants; active-attempt, provider/network and generic recovery messages are explicit.
- Added VI/EN recovery copy and component tests covering unfinished listing, ready retention, wrong-file rejection and same-asset retry. No backend route, migration, environment or provider contract changed.
- Verification: `./init.sh` passed; `npm run test -- --run` in `web` passed 44/44; `npm run typecheck` and `npm run build` in `web` passed. Browser runtime discovery returned `[]`; physical mobile/provider visual QA remains unavailable and follows `docs/TESTING.md`.
- Feature state returned to no active feature. Next work should follow the roadmap; background uploads, byte-level resume and durable offline video remain explicitly out of scope.
- Follow-up UX: unfinished-work rows now include a custom Delete action. It confirms in-app, calls the existing cancel/cleanup lifecycle, and removes the activity from the recovery list only after success.

## 2026-09-17 — Product feedback broken into features

- User feedback requested clearer post-login guidance for personal Google Drive storage, neutral user-facing wording for application storage instead of “Backblaze B2”, and a clean form plus preview after successful submission.
- Added planned features `feat-035` (Google Drive storage explanation), `feat-036` (product-facing storage labels) and `feat-037` (post-submit reset and verified evidence preview). They are `not-started`; no feature is active. Proposed order is 035 → 036 → 037, with existing OAuth/provider/API identifiers preserved.

## 2026-09-17 — Feature 035 personal storage explanation completed

- Activated only feat-035 after `./init.sh` passed. Signed-in workspace now shows a personal-storage setup panel explaining that Google Drive keeps evidence in the operator's own storage, while application storage remains available without Google.
- Reused the existing Google Drive status/connect/reconnect/unlink controls. App authentication and Google authorization remain visibly separate; no OAuth scope, credential, provider or API contract change.
- Verification: web `npm run test -- --run` passed 44/44; `npm run typecheck` and `npm run build` passed. Feature state returned to no active feature. Next unblocked feature is feat-036.
- Follow-up UX adjustment: the signed-in personal-storage panel now renders only while Drive is unlinked; after a successful connection it hides, and unlink/provider-change events allow it to reappear. Profile-menu management remains available.

## 2026-09-17 — Feature 036 product-facing storage labels completed

- Activated only feat-036 after baseline. Replaced user-facing Backblaze B2 wording in the hero, provider selector/badge, history detail, comparison and unfinished-recovery views with “Application storage / Bộ nhớ ứng dụng”. Google Drive remains named for the external account and permission boundary.
- Technical `s3`/provider identifiers, backend behavior, API contract and logs remain unchanged. Web tests 44/44, typecheck and build passed. Feature state returned to no active feature; next unblocked feature is feat-037.
- Follow-up UX adjustment: removed the manual Refresh storage and Manage Google Drive buttons from New Record. Storage status still refreshes on focus/provider events; connection management remains in the signed-in personal-storage panel and profile menu.

## 2026-09-17 — Feature 037 post-submit reset and preview completed

- Activated only feat-037 after baseline. On successful activity completion, the workflow snapshots verified files for a success preview, clears activity metadata and selected-file state, resets the form and recalculates storage for the next record. The submitted reference and image/video previews remain visible until Start another record.
- Completion failure leaves existing upload/recovery state untouched. Added assertions for cleared reference and retained preview. Web tests 44/44, typecheck and build passed. Feature state returned to no active feature.
- Follow-up UX adjustment: changed the post-submit preview from inline content to a centered success modal with a dimmed backdrop, verified image/video previews and the Start another record action.

## 2026-09-17 — Feature 038 custom confirmation dialogs completed

- Replaced browser-default `window.confirm` prompts for recorder cancel/delete with accessible application modal dialogs using explicit Confirm and Keep actions and localized copy. The operating-system file chooser remains external UI.
- Web tests 44/44, typecheck and build passed. No backend/API/migration change; no active feature remains.

## 2026-09-17 — Feature 039 custom dropdowns completed

- Replaced the shared native Select presentation with an application-owned listbox popover for storage, operation, status, order and comparison selections. A synchronized hidden form select preserves existing form values and API enums.
- Added custom open/close behavior with click-away, Enter/Space/ArrowDown and Escape handling; disabled choices remain disabled and localized labels are preserved. Web tests 44/44, typecheck and build passed.
- Follow-up visual fix: listbox popup now uses an explicit opaque card background and foreground color because the unavailable `bg-popover` token rendered transparently. Workflow/comparison tests 19/19 and typecheck passed.

## 2026-09-21 — Feature 040 product identity refresh

- Activated only feat-040 on `develop` after `./init.sh` passed. Replaced the narrow UnboxProof and legacy Shopping Recorder user-facing identity with PackTrace, a name that covers both packing and unpacking workflows.
- Updated the inline brand mark, document title/description, footer, legal pages, not-found copy, and VI/EN supporting tagline. Technical routes, API identifiers, storage providers, and deployment URLs are unchanged.
- Verification: `./init.sh` passed; web 44/44 tests, typecheck and build passed; `feature_list.json` parsed successfully. The feature is done on `develop`; no backend/API/storage contract changed.

## 2026-09-21 — PackTrace logo direction revised

- Reopened feat-040 after visual feedback. Kept the PackTrace name and replaced the first flat box/check mark with a rounded dark icon, line-art package, and two directional arrows to communicate packing and unpacking.
- Verification: web 44/44 tests, typecheck, build and feature JSON validation passed. No backend/API/storage contract changed.

## 2026-09-21 — PackTrace logo background softened

- Reopened feat-040 after feedback that the dark logo background felt too heavy. Changed the mark to a light mint background with navy/teal package lines and lime return arrow.
- Final verification: web 44/44 tests, typecheck and build passed. The mark now uses a high-contrast lavender background with indigo package lines, navy structure and lime return arrow. No backend/API/storage contract changed.

## 2026-09-21 — Feature 041 retention and logo refresh completed

- Added and locally applied `0011_add_evidence_retention.sql`. Completion now persists `evidence_expires_at = completed_at + 30 days`; existing completed rows were backfilled. A startup/hourly sweep atomically changes due rows to `expired`, records an audit event, creates exact-object cleanup jobs, then invokes B2/Drive deletion. Failed deletion stays pending for later retry and never restores content access.
- Expired records remain in owner-scoped history, detail, search, comparison and the new status filter. Metadata, filenames, checksums and audit events remain; media content endpoints return not found and the UI removes preview/viewer/download controls with localized expiry guidance.
- The PackTrace logo is now a keyboard-accessible button whose activation performs a full browser reload.
- Verification: baseline/final `./init.sh`; migration applied; backend tests 85 passed/5 opt-in skipped, typecheck and build; PostgreSQL integrations 4/4; web tests 46/46, typecheck and build; harness validation 100/100; JSON and diff checks passed. No live provider object was deliberately aged/deleted in this session.

## 2026-09-21 — Feature 041 production rollout

- Committed feature 041 as `64da323`, fast-forwarded `develop` and `main`, and applied `0011_add_evidence_retention.sql` to the production Supabase database before pushing either remote branch.
- Pushed both remote branches successfully. Production verification passed: Render health returned 200, the expired-status query reached authentication with `401 AUTH_REQUIRED` (confirming the new contract), and the Vercel bundle contains the PackTrace reload behavior with the PackTrace document title.
- No production credential was written to the repository or handoff. The database credential supplied through chat should be rotated. `feat-018` remains blocked because malware-scanning/risk acceptance, backup objectives and remaining production governance are not resolved by this rollout.

## 2026-09-22 — Features 042–045 mobile bug fixes completed sequentially

- Started on `develop` with a clean baseline from `./init.sh`. Logged the four reports as dependent features and kept exactly one `in-progress` item at a time: direct camera upload, account popup containment/dismissal, compact mobile recorder, then centered evidence detail.
- `feat-042` root cause was the Google Drive proxy inheriting Fastify's 1 MiB request limit, which rejects normal camera payloads before the upload service runs. The route now uses the largest configured image/video limit while existing exact Content-Length, declared asset size, signature and checksum controls remain. The web safely normalizes empty/`application/octet-stream` camera metadata only for allow-listed filename extensions and uses the normalized media kind for previews and create-asset requests.
- `feat-043` bounds the profile popup to the phone viewport, lets long Vietnamese Drive buttons wrap, wraps confirmation actions, dismisses only on outside pointer input, and supports Escape with focus restoration.
- `feat-044` reduces phone-only vertical depth by hiding secondary intro/help copy, tightening padding/gaps, placing storage and operation in a two-column grid, keeping reference/notes full width, and shortening notes/drop-zone/footer height. `sm`/desktop sizing and form/API names are preserved.
- `feat-045` moves record detail, loading and error states into a centered modal with dynamic viewport height, internal scrolling and body scroll lock. X, outside pointer and Escape close it without resetting archive state; nested confirmation/viewer overlays use a higher z-index and Escape closes the top layer first.
- Verification: focused Drive route 15/15, Account/Drive popup 7/7, RecorderWorkflow 18/18 and RecorderHistory 7/7. Full backend `npm run test && npm run typecheck && npm run build` passed with 86 tests and 5 opt-in skips. Full web command passed 50/50 plus typecheck and production build. `feature_list.json` parsed and `git diff --check` passed.
- Applied the Browser skill for responsive QA; bootstrap troubleshooting and discovery returned no browser instances (`[]`). Physical camera capture and phone visual checks remain manual in `docs/TESTING.md`. No database migration, environment variable, provider object mutation, commit, push or deployment was performed.

## 2026-09-24 — Feature 046 Drive upload session origin fix

- Production mobile evidence showed the browser sending `PUT https://shopping-recorder.onrender.com/api/v1/google-drive/uploads/...` without a `Cookie`. The frontend API is reverse-proxied through Vercel, so the capability URL bypassed the cookie-owning web origin and failed authentication before the Drive transfer service could run.
- Added an explicit upload-origin parameter to `DriveMediaStorage`; production server wiring passes `config.corsOrigin`, while isolated adapter tests retain the redirect-origin fallback. Drive capabilities now point to `https://shopping-recorder-web.vercel.app/api/v1/...`, allowing the Vercel rewrite to forward the authenticated request to Render. Existing origin, ownership, exact length and encrypted provider-session checks are unchanged.
- Verification: backend full suite passed 86 with 5 opt-in skips; typecheck/build passed. No migration, environment change, provider credential change or API response-shape change.
- The client retry path also detects an unexpired legacy server capability on a different production origin and requests a fresh attempt, so an activity already open before deployment does not keep retrying the unauthenticated Render URL. Web 50/50, typecheck and build passed.

## 2026-09-24 — Feature 047 upload-first recorder workspace completed

- Reordered the signed-in workspace so New record/evidence capture is the first content after login; storage guidance and the archive switch remain available below, with archive still isolated behind its own view. Mobile evidence cards and review padding are compact; desktop layout and metadata payloads are preserved.
- Added migration `0012_discard_failed_media_assets.sql` with additive `media_assets.discarded_at` and an active-asset index. `DELETE /api/v1/media-assets/{assetId}` soft-discards failed assets, expires nonterminal attempts, queues provider cleanup when needed, and preserves the database/audit row. Discarded assets are excluded from detail, completion counts, upload targets, retries and finalization.
- Added localized Remove action beside Retry for failed cards. Migration applied locally. Verification: backend 86 passed/5 opt-in skipped, web 50/50, backend/web typecheck and builds passed. No commit/push/deploy performed.
- Follow-up UX: removed the archive toggle from the recorder workspace and added a dedicated `/archive` page. The global header now exposes Workspace and Evidence archive navigation on mobile and desktop; archive checks the current session and shows login when needed. Web tests remain 50/50 with typecheck/build passing.
