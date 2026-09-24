# Session Handoff

## Current Objective

- Goal: Deliver the PackTrace packing/unpacking evidence recorder with application storage and optional linked Google Drive.
- feat-041 thirty-day evidence retention and logo reload is deployed from commit `64da323`; production migration `0011` is applied. Features 042–045 are complete locally on `develop` and are not committed or deployed. No active feature; feat-018 remains blocked/deferred.

## Features 042–045 — Mobile bug-fix sequence completed locally

- `feat-042`: Drive's authenticated upload proxy now accepts bodies up to the configured maximum media size instead of Fastify's 1 MiB default. Empty/generic camera MIME metadata is normalized only from allow-listed extensions, preserving the correct image/video preview and asset declaration.
- `feat-043`: the portalled profile popup is viewport-bounded; long Vietnamese Drive actions wrap. Outside pointer dismissal and Escape close the popup, while inside interactions remain usable.
- `feat-044`: the phone recorder hides nonessential explanatory copy, uses compact spacing, places storage/operation side by side, keeps reference/notes full width, and shortens the notes/drop zone. Desktop breakpoint sizing and payload field names remain unchanged.
- `feat-045`: archive activity detail is now a centered, viewport-bounded modal with internal scrolling, outside/X/Escape dismissal, body scroll lock and trigger focus restoration. Search/filter/pagination state remains mounted; confirmation and evidence viewer overlays stay above it.
- Verification: backend 86 passed/5 opt-in skipped plus typecheck/build; web 50/50 plus typecheck/build; feature JSON and diff checks passed. No migration, environment variable or API response-shape change. Browser runtime discovery returned `[]`, so physical iPhone/Android visual/camera verification remains documented in `docs/TESTING.md`.
- Next action: review/commit/push/deploy only if requested. Do not migrate the database for these changes; there is no new migration.

## Feature 046 — Drive upload session origin fix

- A production mobile curl proved Drive upload capabilities pointed directly to Render and carried no Cookie. Since API/session traffic is reverse-proxied through Vercel, this caused authentication failure before upload handling.
- `DriveMediaStorage` now accepts the configured web origin from `server.ts` and emits the application upload URL on that origin. The Vercel rewrite forwards it to Render while preserving the browser session cookie. Three-argument adapter construction keeps a safe redirect-origin fallback for local/integration fixtures.
- Backend 86 tests passed/5 opt-in skipped, typecheck/build passed. Commit/push/deploy is pending the user's current release request; no migration is needed.

## Feature 041 — Thirty-day evidence retention and logo refresh completed

- Migration `0011_add_evidence_retention.sql` is applied locally. Completed activities receive `evidence_expires_at` exactly 30 days after completion; existing completed rows were backfilled. `expired_at`, public `expired` status, audit support and the due index are additive.
- The backend runs retention on startup and hourly. Each sweep commits `expired` and queues exact-provider cleanup before calling B2/Drive, so retrieval is denied immediately and failed deletion remains pending for retry. Record/asset metadata and audit history remain owner-visible; deleted tombstones retain their existing behavior.
- Web history/filter/comparison support expired records without issuing media URLs or showing viewer/download controls. VI/EN expiry guidance is included. PackTrace logo activation now calls a full page reload through an accessible button.
- Verification: backend 85 passed/5 opt-in skipped plus typecheck/build; PostgreSQL integrations 4/4; web 46/46 plus typecheck/build; migration and final `./init.sh` passed; harness 100/100. Provider deletion was deterministically adapter-tested; no live object was deliberately aged/deleted.
- Next session: activate only one newly requested/unblocked feature. Do not restore indefinite retention or add provider-native lifecycle rules. Production multi-replica scheduling/locking decisions remain part of blocked `feat-018`.
- Production rollout: migration `0011` was applied to Supabase before `develop` and `main` were pushed. Render health and the new expired-status contract passed; Vercel serves the new PackTrace reload bundle. Rotate the database credential that was supplied through chat; it is not stored in this repository.

## Feature 040 — Product identity refresh completed

- Selected `PackTrace` as the modern product name because it covers both packing and unpacking evidence.
- Updated the web mark, document title/description, footer, legal pages, not-found copy, and VI/EN tagline. Technical routes, API identifiers, storage providers and deployment URLs remain unchanged.
- The PackTrace name is retained, with a high-contrast lavender mark, line-art package and bidirectional arrows after visual feedback. Web 44/44 tests, typecheck and build passed; no backend/API/storage contract changed.

## Feature 034 — Current Handoff

- Added `RecorderRecovery` to Evidence archive. It queries draft and uploading activities after reload, deduplicates and orders them by update time, preserves each activity's provider, and opens the server detail without creating a new activity.
- Ready assets remain marked verified. Missing/pending/failed assets require exact filename, content type, byte size and SHA-256 validation before retry. Retry uses the existing same-asset attempt endpoint and finalize flow; active attempts, provider/network failures and generic recovery errors stay visible.
- Verification: `./init.sh`; web tests 44/44; web typecheck/build. Backend contract and migrations are unchanged. Browser discovery returned `[]`; physical mobile/provider visual QA remains unavailable and is documented in `docs/TESTING.md`.
- Next session: choose the next unblocked feature after updating the roadmap; do not add background upload, byte-level resume or durable offline video behavior to this scope.

## Product feedback breakdown — 2026-09-17

- Added `feat-035`: explain after app sign-in that Google Drive can be connected as the operator's personal storage, while separating app authentication from Google authorization.
- Added `feat-036`: replace user-facing “Backblaze B2” labels with neutral “Application storage / Bộ nhớ ứng dụng”; keep Google Drive named and technical provider identifiers unchanged.
- Added `feat-037`: after successful completion reset new-record inputs and show the just-submitted verified image/video preview; failed uploads retain recovery state.
- All three are `not-started`; proposed order is 035 → 036 → 037. No active feature is selected.

## Feature 035 — Personal storage explanation completed

- Added a signed-in workspace panel explaining Google Drive as the operator's personal evidence storage, with the existing status/connect/reconnect/unlink controls and application-storage alternative.
- No OAuth/API/provider contract change. Web tests 44/44, typecheck and build passed after `./init.sh`.
- Feature 035 is done; next unblocked feature is 036 (neutral application-storage labels). Feature 037 remains not started.
- Follow-up: the workspace panel is conditional and hidden when `GoogleDriveStatus.connected` is true; profile-menu controls remain the persistent management path, and provider-change events reset the panel state.

## Feature 036 — Product-facing storage labels completed

- Replaced visible Backblaze B2 wording with “Application storage / Bộ nhớ ứng dụng” across hero, provider selection, badges, history, comparison and recovery. Google Drive remains named.
- Technical provider identifiers and API behavior are unchanged. Web 44/44, typecheck and build passed. Next unblocked feature is 037.
- Follow-up: New Record's Storage area no longer shows Refresh storage or Manage Google Drive buttons; status refresh and connection management live in the workspace/profile surfaces.

## Feature 037 — Post-submit reset and preview completed

- Completion snapshots verified evidence for a success preview, resets metadata/file selection and recalculates storage for the next record. Submitted reference and image/video previews remain until Start another record; failures preserve recovery state.
- Follow-up: success evidence now appears in a centered modal popup with a dimmed backdrop rather than inline in the form.
- Web 44/44, typecheck and build passed. No backend contract or migration change. No active feature remains; feat-018 is still blocked.

## Feature 038 — Custom confirmation dialogs completed

- Recorder cancel/delete confirmations now use an accessible application modal instead of browser `window.confirm`; the operating-system file chooser remains external UI. Web 44/44, typecheck and build passed.

## Feature 039 — Custom dropdowns completed

- Shared Select now renders an app-owned listbox popover for all recorder/comparison dropdowns, with synchronized hidden form values, disabled options, click-away and keyboard open/close handling. No API enum changed. Web 44/44, typecheck and build passed.

## Feature 033 — Current Handoff

- Implemented read-only manual packing/unpacking comparison inside Evidence archive. Exact-reference candidates are case-insensitive, owner-scoped, exclude tombstones, sort newest first and are bounded independently to 50 per operation. Multiple candidates require explicit selection; one candidate on a side is selected for convenience; no pair is persisted or inferred.
- Phone UI uses packing/unpacking tabs; `lg` layouts show both columns. Each side displays reference, time, lifecycle status, provider, notes, image/video evidence, pending-evidence states and protected original downloads. Missing sides, bounded results, auth/load/media failures and VI/EN state are covered. Existing B2/Drive authorization and version behavior is reused.
- Verification: startup/final `./init.sh`; web 42/42 plus typecheck/build; backend 83 passed/5 opt-in skipped plus typecheck/build; recorder PostgreSQL integration 2/2 with fixtures cleaned; harness 100/100; API JSON examples parse. No migration/env/provider change. Local web 5173 and backend 3000 remain listening.
- Browser skill was applied for local UI verification, but runtime discovery returned `[]`; physical phone/wide visual QA remains unavailable and is documented in `docs/TESTING.md`.
- Next: activate only feat-034 after startup baseline. Preserve each unfinished activity's provider and asset identity; do not promise background/byte-level resume or persistent access to local files. feat-018 remains blocked/deferred.

## Feature 032 — Historical Handoff

- Completed owner-scoped reference search. Optional GET /recorder-activities reference query: literal case-insensitive substring, edge whitespace trimmed, max 160 characters, empty disables the filter; accents/internal whitespace/punctuation significant. Search applies before count/pagination with existing filters; stored references unchanged. SQL is parameterized strpos/lower, so %, _, backslash and quotes are literal.
- UI: VI/EN search and clear controls, submit-to-search, reset page on apply/clear, preserve query during paging/language switches, localized loading/empty/error/retry states. Clear keeps other applied filters. Fixed cancelled list schema to agree with existing UI/domain/API docs.
- Verified startup ./init.sh; web 38/38 + typecheck/build; backend 80 passed/5 opt-in skipped + typecheck/build; recorder PostgreSQL integrations 2/2 with fixtures cleaned. No migration/env/provider changes. API JSON examples valid.
- Browser discovery []; physical phone/visual QA unavailable. Local web 5173 and backend 3000 still listening. User confirmed feat-031 Drive retry succeeded.
- Historical next step completed by feat-033. Its exact-reference candidate selection now sits above the feat-032 substring search; references remain non-unique.

## Feature 031 — Historical Handoff

- Latest fix (2026-09-17): browser Drive upload failed because backend CORS allowed only GET/HEAD/POST. Explicit PUT/PATCH/DELETE/OPTIONS are now allowed for the configured web origin; live upload preflight verified 204 with PUT and credentials. Network errors now distinguish Google Drive from application storage and localize VI/EN. Web 35/35; backend 79 passed/4 skipped; typecheck/build passed. User confirmed the upload retry succeeded before feat-032 began.
- Current local runtime: backend watcher on localhost:3000, web localhost:5173, browser API localhost:3000/api/v1. Older port-3001 handoffs are historical. Retry failed files in the still-open form; reload recovery is not yet implemented.

- Completed Drive-preferred storage selection. GET /api/v1/storage-providers requires the app session, is no-store and reports B2 configuration availability plus probed Drive state. B2 health/quota and Drive quota are not preflight guarantees.
- New untouched forms prefer available Drive then B2. Explicit choices survive focus/manual/unlink refresh. Unavailable selections, loading and status errors block creation while preserving local data/files. Creation freezes the provider; errors/retries never create an alternate-provider record. Start another record resets finished work and recalculates defaults.
- Form embeds the existing VI/EN Google connection controls with explicit OAuth navigation warning and cancellation. All connection buttons are type=button to prevent accidental form submit. History filters now include both providers; detail shows the actual storage location.
- Verification: startup/final ./init.sh; web tests 33/33, typecheck/build; backend 78 passed/4 opt-in skipped, typecheck/build. Approved escalation resolved sandbox tsx IPC EPERM. No DB/environment/migration changes. No .git worktree is present.
- Browser discovery returned []; physical mobile/browser visual and live UI upload QA remains unavailable. Follow docs/TESTING.md. Earlier feat-013 live Drive evidence was not rerun.
- Next: activate only feat-032 after startup baseline, document reference matching semantics and implement search across owned server records. feat-018 remains deferred; feat-033/034 are not started.

## Feature 013 — Current Handoff

- Implemented: Google status/connect/callback/unlink routes, encrypted tokens and resumable sessions, owner-bound one-use OAuth state, PKCE, same-account reconnect/root reuse, replacement binding, revocation without file deletion, invalid-grant status, no-store/rate limits and query-safe request logging. Profile menu exposes VI/EN Google connection controls and warns before leaving unsaved work.
- Storage: Drive adapter reserves a file ID, creates/reuses activity folders and returns an authenticated application upload URL (`strategy: server`). Upload proxy checks ownership/account/lifecycle/expiry/length, forwards a bounded stream and persists a one-use guard. Finalization reads and hashes the exact retained binary revision, checking binding, size and byte signature. Retrieval streams that revision through the protected content endpoint; `?download=1` sets an attachment filename. B2 keeps its existing direct strategy.
- Lifecycle: unlink/replacement never migrate or delete evidence. Old references require the original provider account. Cancel/delete revoke logical access and queue file cleanup; disconnected/unavailable cleanup stays retryable. Uploads hold activity/asset/attempt locks for the provider transfer (10-minute timeout); configure reverse proxy upload limits/timeouts before production. Byte-level client resume and Range seeking are not implemented.
- Fixed the pre-existing migration checksum failure: restored 0006 to the 608-byte original whose SHA-256 matches the applied ledger. New 0009 adds drive_transfer_started_at; 0010 creates OAuth states. Both applied locally. Never append SQL to an applied migration or rewrite its ledger checksum.
- Verification: backend 69 passed/3 skipped plus typecheck/build; web 23/23 plus typecheck/build; real PostgreSQL auth/B2/Drive integrations 3/3 with fixture cleanup. Google calls are mocked in automated checks. Commands and manual real-provider gate are in docs/TESTING.md and progress.md.
- Live evidence: user confirmed OAuth; opt-in live-smoke.test.ts passed real upload/byte verification/download, retained revision after head edits, missing-file denial and cancel/delete cleanup. Disposable files/folders/database rows cleaned; existing connection preserved. Physical mobile/video/browser visual QA remains unavailable.
- Provider selection/default UI is now complete in feat-031; see the current handoff above. The create form prefers available connected Drive and keeps B2 selectable.

## Feature 026 Handoff — Planning Only

- The user requested documents and feature breakdown, explicitly no code yet. The roadmap does not authorize implementation in this session.
- Read `docs/MOBILE_LOCALIZATION_DRIVE_PLAN.md` for detailed scope, acceptance criteria, provider-default states and verification. Product, architecture and API notes distinguish planned behavior from the current runtime.
- Accepted grouping: phone-first experience, then Google Drive. Proposed detailed order: `feat-027` Vietnamese-default/English switching, `feat-028` workspace, `feat-029` additive capture/selection, `feat-030` viewer/downloads, existing `feat-013` Drive linking/adapter, then `feat-031` Drive-preferred provider selection.
- Additional backlog: `feat-032` owner-scoped reference search, `feat-033` manual packing/unpacking comparison and `feat-034` recovery of server-created drafts/uploads. Their exact delivery order remains open.
- Vietnamese defaults on first visit; browser-local preference, localized application errors/formatting and state-preserving switching are planned. Preserve original user content, API identifiers/enums and stored timestamps.
- Google remains storage-only after app login. Prefer available, validly connected Drive for new records, allow explicit B2 selection, keep one provider per activity, never switch mid-upload or migrate old records automatically. Unlink preserves Drive files.
- Skill workflow kept one active documentation feature and explicit acceptance criteria for the unstarted work. Do not treat historical UI/test evidence as verification of the new plan.
- Verification: `./init.sh` passed; `node .agents/skills/harness-creator/scripts/validate-harness.mjs --target .` scored 100/100. The read-only check in `progress.md` verifies 34 unique feature IDs, acyclic dependencies, valid roadmap references, unstarted implementation features and 9 API JSON examples. No application tests/builds/device or Google smoke were run for this documentation-only change.

## Feature 027 Handoff

- Implemented Vietnamese-default application localization with English switching in `web/src/i18n.tsx`; `App` wraps the runtime in `I18nProvider` and exposes a VI/EN switcher.
- Preference key is `shopping-recorder-locale`; invalid/missing storage falls back to Vietnamese, and `document.documentElement.lang` follows the selected locale. Direct component tests retain the English context default, while the application runtime defaults to Vietnamese.
- Core Home, account, health, new-record and selected history copy now uses the translator. User-entered values and API payloads remain unchanged. Some deep dynamic history/error strings remain follow-up scope for the phone-first localization audit.
- Follow-up completed: translated remaining visible workflow/history operation labels, file guidance, statuses, pagination, selection text and detail accessibility labels. Future phone QA should still scan newly added copy for untranslated strings.
- Verification: web `npm run test` 18/18, `npm run typecheck`, and production build passed after the follow-up. `./init.sh` passed before implementation. Browser/device QA was unavailable; phone-specific verification belongs to `feat-028`.

## Feature 028 Handoff

- Signed-in Home now hides the large marketing/health hero and presents a sticky touch-friendly switcher between New record and Evidence archive. Both panels stay mounted behind `hidden`, so switching sections does not discard entered metadata, selected files, or in-flight state.
- Completing a record moves the user to the archive and triggers the existing history refresh. The global button role gets a 44px minimum height and mobile body padding includes the bottom safe-area inset.
- Verification: web tests 18/18, typecheck and production build passed; baseline `./init.sh` passed. No connected browser runtime was available for Safari iPhone/Chrome Android keyboard, orientation, viewport or enlarged-text checks; run those manually before release.
- Follow-up: at 400px width the header now uses tighter spacing, a non-wrapping brand label and hides the redundant Workspace nav link below `sm`; the VI/EN switcher remains available. Web tests/typecheck/build still pass.
- Latest mobile spacing fix: VI/EN buttons explicitly override the global 44px button minimum to 32px; signed-in Home uses reduced root/account spacing so the profile card sits closer to the header. Web tests/typecheck/build pass.
- Profile follow-up: signed-in `AccountAccess` now portals a compact profile icon and tap-open dialog into `#header-profile`; the signed-out login/register card remains in the page. The hidden source mount keeps session handling alive while avoiding workspace layout space.

## Feature 029 Handoff

- `RecorderWorkflow` now exposes separate Take photo, Record video and Choose files controls. Photo/video inputs use `accept="image/*"`/`accept="video/*"` and `capture="environment"`; the general picker and drag/drop remain fallbacks.
- Selecting additional files appends to existing state. Unsupported files produce a localized alert while valid files remain; matching name/size/lastModified files produce a duplicate warning but are retained for explicit user removal.
- Verification: web tests 19/19, typecheck and production build passed. No connected mobile/browser runtime was available to prove the native camera chooser, so Safari iPhone/Chrome Android capture behavior remains a manual check.

## Feature 030 Handoff

- `RecorderHistory` now opens a fixed in-page viewer for ready assets. Images use `object-contain` and a zoom range of 75–200%; multiple ready assets support previous/next navigation. Video assets retain native controls.
- Every ready asset has a protected original-download link, and the viewer includes the same link with the original filename. Both use the existing owner-authorized content endpoint; no public storage URL was introduced.
- Verification: web tests 19/19, typecheck and production build passed. No connected browser/device runtime was available for physical mobile zoom, video and download behavior; record that manual check before release.

## Feature 025 Handoff

- The broken preview shown in the user screenshot was caused by creating a blob URL in a state initializer and revoking it during React StrictMode's development effect replay. The mounted `<img>` then referenced the revoked URL and triggered the fallback icon.
- `EvidencePreview` now creates and revokes each URL within one effect tied to the selected file. StrictMode's replay creates a replacement URL after revoking the diagnostic one, and preview failure state resets when the file changes.
- Verification: a focused StrictMode test proves the stale URL is revoked but the active preview URL remains live; web tests 18/18, TypeScript and production build, final `./init.sh`, and harness validation passed. Browser QA remained unavailable because no browser instance was connected.

## Feature 024 Handoff

- New Record is now organized into visible Activity details, Add evidence, and Review & upload stages. The signed-in page gives this workflow the full content width before activity history.
- Selected evidence renders in large 4:3 review cards. Images can be opened full-size, videos have playback controls, and every card shows filename, media type, MIME type, size, upload state, and a remove action; clear-all and review guidance remain available before upload begins.
- The existing activity creation, upload, retry, finalize, and completion contract is unchanged. Verification: web tests 17/17, TypeScript and production Vite build, final `./init.sh`, and harness validation passed. Interactive browser QA was unavailable because the browser runtime listed zero instances.

## Feature 023 Handoff

- Root cause of “Please select one or more files”: `RecorderWorkflow` copied selected files into React state and cleared the native input for reliable same-file reselection, but the input retained `required`, so browser constraint validation rejected the now-empty DOM input before React submit ran.
- The input no longer uses native `required`; the existing `items` guard controls button availability and submit validation. Selected images show object-URL thumbnails and selected videos show local playable previews. Preview URLs are revoked on unmount and failed rendering falls back to the media icon.
- Verification: final `./init.sh`; web tests 17/17; TypeScript and production Vite build; harness 100/100. Browser QA remained unavailable because no browser instance was connected.

## Feature 022 Handoff

- `RecorderWorkflow` now handles picker and drag/drop files through one validation path, gives the dropzone active/selected states, displays count/names/total size, and allows replace, clear-all, or per-file removal before activity creation.
- Unsupported types dropped outside the native file-picker `accept` filter are rejected with an accessible alert. Once upload starts, the existing immutable activity/file lifecycle and retry behavior remains unchanged.
- Verification: final `./init.sh`; web tests 17/17; TypeScript and production Vite build; harness 100/100. Browser QA was unavailable because no browser instance was connected. Vite is running at `http://127.0.0.1:5173` for manual verification.

## Feature 021 Handoff

- Added Tailwind CSS v4 with the official Vite plugin, tokenized OKLCH theme variables, shadcn `components.json`, local UI primitives, class-merging utilities, and Lucide icons.
- Refreshed the app shell, signed-out and signed-in account states, health card, recorder form/dropzone/upload progress, history filters/list/detail/evidence/audit UI, and 404 page. API calls, form names, accessible labels, live statuses, alerts, and recorder behavior are preserved.
- Verification: final `./init.sh`; web tests 16/16; TypeScript and production Vite build; production dependency audit 0 vulnerabilities; feature JSON parse; harness 100/100.
- Interactive browser visual QA remains unavailable in this session because the Browser runtime reported no connected browser instances. Start `npm run dev --prefix backend` and `npm run dev --prefix web`, then check desktop and mobile layouts when a browser instance is available.

## Completed

- Created project instructions, state tracking, handoff log, and verification entry point.
- Restored executable permission for `init.sh` and confirmed the clean-harness baseline.
- Documented approved architecture, first product scope, environment contract, and planned API surface.
- Created the React/Vite web root and Fastify backend root with safe environment examples and lockfiles.
- Implemented backend configuration validation, `/api/v1/health`, standard errors, CORS/logging, and the PostgreSQL migration runner.
- Implemented the responsive React shell, Home/404 routes, health API client, and loading/error/retry UI states.
- Implemented shopping-record migration `0002`, domain validation, PostgreSQL repository, and `POST /api/v1/shopping-records`.
- Implemented the web create-purchase form with required fields, amount-to-cents conversion, optional category/store/notes fields, and clear saving, success, and API-failure feedback.
- Implemented `GET /api/v1/shopping-records` with pagination, category/store/date-range filters, and deterministic sorting; added responsive history filters, rows, pagination, loading, empty, and retryable-error states.
- Implemented validated record update and deletion operations, `RECORD_NOT_FOUND` responses, inline web editing, an explicit destructive-action confirmation, and automatic history refresh after changes.
- Corrected the product documentation and future feature plan: shopping-record functionality is legacy; the target is recorder evidence for packing/unpacking, stored in S3 or linked Google Drive.
- Finalized the recorder identity and Google-linking architecture: self-service username/password accounts, optional recovery email, persistent server sessions, Drive-only optional Google authorization, secure token lifecycle, single-provider activities, and owner-only access.
- Defined the normalized recorder data model, state transitions, additive `0003`–`0006` migration plan, provider-neutral media references, upload retries/finalization, authorized retrieval, pagination, validation rules, and stable errors.
- Completed the S3 foundation with migrations `0003`–`0005`, PostgreSQL session authorization, provider-neutral repository/service/adapter contracts, Cloudflare R2 direct uploads, fail-closed content verification, retry isolation, and owner-authorized short-lived retrieval.
- Completed the first S3-backed recorder workflow: self-registration/login/session restore/logout, packing/unpacking creation, multi-file hashing and progress upload, finalize/reconciliation/retry, and explicit activity completion.
- Replaced the R2-specific runtime with Backblaze B2 configuration and S3-compatible presigning, requiring B2 object version IDs and pinning verification, retrieval, and failed-upload cleanup to exact versions without changing the public `s3` provider contract.
- Corrected the browser upload regression: B2 CORS now permits PUT and required content/metadata headers, and the web reports the original upload failure if provider reconciliation cannot find the object.
- Implemented owner-scoped recorder activity history/detail APIs and the responsive web evidence archive with filters, pagination, image preview, video playback, and protected media retrieval.
- Implemented audited activity metadata correction, cancellation for unfinished activities, confirmed logical deletion for completed evidence, immediate access revocation, exact-version B2 cleanup, and persistent retryable cleanup jobs with no automatic MVP expiry.
- Hardened API validation/headers/cache policy and mutation throttling; prevented duplicate retry capability issuance before provider access; expanded session, authorization, upload-abuse, provider-outage, lifecycle, and accessibility tests; and documented repeatable release plus browser E2E verification in `docs/TESTING.md`.

## Verification Evidence

| Check | Command | Result | Notes |
|---|---|---|---|
| Harness baseline | `./init.sh` | initial failure | `init.sh` lacked executable permission. |
| Harness baseline | `chmod +x init.sh; ./init.sh` | pass | No client or backend manifest exists yet. |
| Environment setup | `./init.sh` | pass | Installed locked dependencies for `web/` and `backend/`. |
| Web checks | `npm run typecheck && npm run build` | pass | TypeScript check and Vite production build passed. |
| Backend checks | `npm run typecheck && npm run build` | pass | TypeScript check and production build passed. |
| Backend start | `npm run start` | pass | Listened on `http://127.0.0.1:3000` outside sandbox. |
| Backend tests | `npm run test` | pass | 4 tests passed outside sandbox; `tsx` IPC is blocked inside sandbox. |
| Backend checks | `npm run typecheck` and `npm run build` | pass | Platform-foundation code compiles and builds. |
| Backend start | `PORT=3001 npm run start` | pass | Listened on `http://127.0.0.1:3001`; port 3000 was occupied and left unchanged. |
| Migrations | `npm run migrate` | not run | Requires a provisioned PostgreSQL `DATABASE_URL`. |
| Web tests | `npm run test` | pass | 4 tests passed for API-client and health-status behavior. |
| Web checks | `npm run typecheck` and `npm run build` | pass | Application shell compiles and produces a Vite build. |
| Environment setup | `./init.sh` | pass | Reinstalls the locked frontend router and test dependencies. |
| Backend tests | `npm run test` | pass | 8 tests passed, including shopping-record API and validation. |
| Backend build | `npm run build` | pass | Shopping-record API, repository, and migration code compiles. |
| Web tests | `npm run test` | pass | 7 tests passed, including create-record client and form interactions. |
| Web checks | `npm run typecheck && npm run build` | pass | Create-record UI compiles and produces a production bundle. |
| Backend tests | `npm run test` | pass | 8 tests passed outside sandbox, including create-record API coverage. |
| Backend checks | `npm run typecheck && npm run build` | pass | Existing create-record API contract compiles. |
| Environment setup | `./init.sh` | pass | Reinstalls locked dependencies after `feat-006`. |
| Web tests | `npm run test` | pass | 11 tests passed, including shopping-history API client and UI state coverage. |
| Web checks | `npm run typecheck && npm run build` | pass | Shopping-history UI compiles and produces a production bundle. |
| Backend tests | `npm run test` | pass | 12 tests passed outside sandbox, including list API and query validation coverage. |
| Backend checks | `npm run typecheck && npm run build` | pass | Paginated list repository and API compile. |
| Environment setup | `./init.sh` | pass | Reinstalls locked dependencies after `feat-007`. |
| Web tests | `npm run test` | pass | 14 tests passed, including edit/delete API-client and UI interaction coverage. |
| Web checks | `npm run typecheck && npm run build` | pass | Record-maintenance UI compiles and produces a production bundle. |
| Backend tests | `npm run test` | pass | 15 tests passed, including PATCH/DELETE API and missing-record coverage. |
| Backend checks | `npm run typecheck && npm run build` | pass | PostgreSQL update/delete repository operations compile. |
| Environment setup | `./init.sh` | pass | Reinstalls locked dependencies after `feat-008`. |
| Documentation scope correction | `./init.sh` | pass | Baseline passed before `feat-009`; no application source, migration, environment, or endpoint changes were made. |
| Feature 010 baseline | `./init.sh` | pass | Installed locked `web/` and `backend/` dependencies before activating documentation-only `feat-010` on 2026-09-03. |
| Feature 010 finalization | `./init.sh` | pass | Baseline passed after final documentation/state finalization; no application code, endpoint, migration, or environment contract changed. |
| Feature 011 contract examples | Manual `JSON.parse` check | pass | Parsed all 8 JSON examples in `docs/API_CONTRACT.md`. |
| Feature 011 web regression | `npm run test --prefix web && npm run typecheck --prefix web && npm run build --prefix web` | pass | 14 tests passed; typecheck and Vite production build succeeded. |
| Feature 011 backend regression | `npm run test --prefix backend && npm run typecheck --prefix backend && npm run build --prefix backend` | pass outside sandbox | 15 tests passed; typecheck and build succeeded. Sandbox test attempt was blocked by the known `tsx` IPC `EPERM`. |
| Feature 011 final baseline | `./init.sh` | pass | Locked dependencies reinstall successfully after documentation and harness finalization. |
| Feature 012 migrations | `npm run migrate` and schema inspection | pass | Local PostgreSQL has applied `0001`–`0005`; identity and recorder tables exist. |
| Feature 012 backend | `npm run test && npm run typecheck && npm run build` in `backend/` | pass outside sandbox | 30 tests passed, 1 opt-in integration skipped; typecheck and build passed. Sandbox rerun was needed for the known `tsx` IPC restriction. |
| Feature 012 database integration | `RUN_DATABASE_INTEGRATION=1 node --env-file=.env --import tsx --test src/recorder/repository.integration.test.ts` | pass | 1/1 against local PostgreSQL; test fixtures were cleaned. |
| Feature 012 web regression | `npm run test && npm run typecheck && npm run build` in `web/` | pass | 14/14 tests, typecheck, and production build passed. |
| Feature 012 final baseline | `./init.sh` | pass | Locked dependencies reinstall successfully. |
| Feature 012 harness/contract | Harness validator plus JSON parse check | pass | Harness scored 100/100; feature state and all 8 API JSON examples are valid. |
| Feature 014 backend | `npm run test && npm run typecheck && npm run build` in `backend/` | pass outside sandbox | 34 tests passed, 2 opt-in database tests skipped; typecheck/build passed. |
| Feature 014 database integration | `RUN_DATABASE_INTEGRATION=1 node --env-file=.env --import tsx --test src/auth/repository.integration.test.ts src/recorder/repository.integration.test.ts` | pass | 2/2; all fixtures cleaned. |
| Feature 014 web | `npm run test && npm run typecheck && npm run build` in `web/` | pass | 19/19 tests, typecheck, and production build passed. |
| Feature 014 HTTP smoke | Local backend on port 3001 | partial pass | Register/session/logout returned 201/200/204; activity creation correctly returned 409 because R2 credentials are not configured. Smoke account/session/files were removed. |
| Feature 014 visual QA | In-app browser runtime | unavailable | No browser instance was available; recorded rather than substituting an unrelated browser tool. |
| Feature 014 final baseline | `./init.sh` | pass | Locked dependencies, including auth packages, reinstall successfully. |
| Feature 014 harness/contract | Harness validator plus JSON parse check | pass | Harness scored 100/100; feature state and all 9 API JSON examples are valid. |
| Feature 020 baseline | `./init.sh` | pass | Locked dependencies installed before the Backblaze B2 change. |
| Feature 020 backend | `npm run test && npm run typecheck && npm run build` in `backend/` | pass outside sandbox | 36 tests passed, 2 opt-in integration tests skipped; typecheck/build passed. |
| Feature 020 database integration | `RUN_DATABASE_INTEGRATION=1 node --env-file=.env --import tsx --test src/recorder/repository.integration.test.ts` | pass | 1/1; verified provider version persistence/retrieval and cleaned fixtures. |
| Feature 020 web | `npm run test && npm run typecheck && npm run build` in `web/` | pass | 19/19 tests, typecheck, and production build passed after UI copy changed to Backblaze B2. |
| Feature 020 live B2 smoke | Presigned browser preflight/upload, verification, version-pinned download, and cleanup | partial pass | Upload (200), verification, version-pinned download (200), and exact-version cleanup pass. Bucket CORS has the correct localhost origin but only `HEAD`/`GET` and `authorization`/`range`; it lacks `PUT` and the three upload headers, so preflight returns 403. No secret was logged. |
| Manual B2 browser-test build | `npm run build` in `web/` | pass | User opted to perform the remaining browser/CORS check manually; production assets were generated in `web/dist/`. |
| Feature 014 upload regression | Database failure query, live B2 OPTIONS, temporary JPEG upload/verify/cleanup | pass | Failures were `OBJECT_NOT_FOUND`; updated CORS preflight returned 200 and the live object passed MIME/size/SHA-256/version verification before cleanup. |
| Feature 014 regression checks | `npm run test && npm run typecheck && npm run build` in `web/` and `backend/` | pass | Web 19/19; backend 36 passed and 2 opt-in integrations skipped; both typechecks/builds passed. |
| Feature 016 migration | `npm run migrate` in `backend/` | pass | Applied `0007_add_recorder_lifecycle_controls.sql` to local PostgreSQL. |
| Feature 016 backend | `npm run test && npm run typecheck && npm run build` in `backend/` | pass outside sandbox | 45 passed, 2 opt-in integrations skipped; typecheck/build passed. Sandbox test attempt hit the known `tsx` IPC `EPERM`. |
| Feature 016 database integration | `RUN_DATABASE_INTEGRATION=1 node --env-file=.env --import tsx --test src/recorder/repository.integration.test.ts` | pass | 1/1 verified audit, tombstone visibility, cleanup jobs/retry, and ordering; fixtures cleaned. |
| Feature 016 web | `npm run test && npm run typecheck && npm run build` in `web/` | pass | 24/24 tests, typecheck, and Vite production build passed. |
| Feature 016 contract/harness | JSON parse plus harness validator | pass | Feature state and all 9 API examples are valid; harness scored 100/100. |
| Feature 016 final baseline | `./init.sh` | pass | Locked web/backend dependencies reinstall successfully. |
| Feature 017 backend | `npm run test && npm run typecheck && npm run build` in `backend/` | pass outside sandbox | 52 passed, 2 opt-in integrations skipped; typecheck/build passed. |
| Feature 017 database integration | `RUN_DATABASE_INTEGRATION=1 node --env-file=.env --import tsx --test src/auth/repository.integration.test.ts src/recorder/repository.integration.test.ts` | pass | 2/2; auth and lifecycle/storage fixtures cleaned. |
| Feature 017 web | `npm run test && npm run typecheck && npm run build` in `web/` | pass | 26/26 tests, accessible semantics checks, typecheck, and production build passed. |
| Feature 017 dependency audit | `npm audit --omit=dev` in both roots | pass | Registry reported 0 production vulnerabilities for backend and web. |
| Feature 017 browser E2E | In-app browser runtime | unavailable | Browser list was empty; exact manual disposable-data workflow is in `docs/TESTING.md`. |
| Feature 017 final baseline | `./init.sh` | pass | Locked dependencies reinstall successfully. |

## Decisions

- On 2026-09-13, the user changed the accepted password length to 6–128 characters. The web constraint, backend route schema/service validation, API contract, architecture note, and 5/6-character boundary tests agree; hashing remains Argon2id and authentication rate limits remain in force.

- On 2026-09-13, recorder lifecycle mutations were bounded at 30/minute per client group and upload mutations at 60/minute. The in-memory limiter is correct for one process; shared production rate-limit state belongs to `feat-018` deployment architecture.

- On 2026-09-13, the user approved audited correction of operation/reference/notes/occurred time, cancellation only for draft/uploading activities, confirmed deletion only for complete activities, immediate logical access revocation, retryable provider cleanup, and no automatic MVP expiry.

- On 2026-09-05, the user directed that Google Drive be handled later as an additional option. No Google implementation or migration had begun; `feat-013` returned to `not-started`, and the core release proceeds with S3-compatible storage.
- On 2026-09-05, the user selected Backblaze B2 to replace Cloudflare R2. The application retains the public `s3` provider value, uses the region-specific B2 S3 endpoint and bucket-scoped application keys, and pins completed evidence to B2 `VersionId`.

- Expected roots are `web/` and `backend/`; alternatives are detected by `init.sh`.
- Web uses React + TypeScript + Vite; backend uses Node.js + TypeScript + Fastify; PostgreSQL is the selected database; Docker-compatible services are the deployment approach.
- Users may self-register and log in with application-managed username/password; administrator provisioning or approval is not required for MVP registration. Google is optional Drive-only account linking after login; it is not a login provider, and Google identity does not own application data.
- Email is optional; self-service password reset is available only to an account with an email on file. Accounts without email have no self-service recovery path.
- Sessions are backend-managed and referenced by an opaque persistent secure cookie, preserving login across browser restarts. They expire after 30 days without activity or 90 days absolutely; password reset revokes all sessions.
- Passwords use Argon2id. Registration/login/reset are rate-limited; reset is available only with an email on file and uses a short-lived, single-use token stored as a digest.
- Google requests only `drive.file` for optional Drive storage. One link and one app-managed root folder are allowed per user; refresh tokens are encrypted and revoked/deleted on unlink, without deleting Drive files.
- Each activity uses one user-selected available provider. The internal user ID owns activities/media, and access is owner-only in the MVP.
- The earlier JWT choice remains retired and is not used by the recorder.
- Recorder storage is modeled as `app_users -> recorder_activities -> media_assets -> media_upload_attempts`; ownership always derives from the internal user ID.
- Public activities are `draft`, `uploading`, `complete`, or `cancelled`; `deleted` is an internal tombstone. Assets are `pending_upload`, `verifying`, `ready`, or `failed`. At least one ready asset and no non-ready assets are required for explicit completion.
- Each activity fixes one provider. Assets enforce the activity/provider pair, retries create attempts under one asset, and all provider/upload references are server-only.
- Migrations `0003`–`0005` add identity, activities, assets, and attempts; `0007` adds lifecycle/audit/cleanup persistence without touching legacy tables; `0006` remains reserved for Google connection persistence in `feat-013`.
- The recorder activity-create/completion, list/detail, media intent/retry/finalize, and safe content-retrieval endpoints are implemented for S3.
- Migrations are ordered SQL files in `backend/migrations/`, recorded with checksums in `schema_migrations`, and executed through `npm run migrate --prefix backend`.
- Web uses React Router for Home and fallback routes; `VITE_API_BASE_URL` is validated and the health API UI includes loading, error, and retry states.
- Legacy shopping-record amounts use integer `amountCents`; required fields are description, positive amount, and purchase date. Category, store name, and notes are optional. Recorder ownership is now fixed to the internal application user ID by `feat-010`.
- `npm run test --prefix backend` runs both root-level and nested test files; a PostgreSQL instance is still needed to apply migrations and exercise live persistence.
- The create form accepts decimal currency input and sends the documented integer `amountCents`; it does not infer or display a currency because no currency convention has been approved.
- `GET /api/v1/shopping-records` supports one-based `page`, `pageSize` (1–100), exact case-insensitive category/store filters, inclusive `purchasedFrom`/`purchasedTo`, and `purchasedOn` or `createdAt` sorting; the UI requests 10 records per page.
- `PATCH /api/v1/shopping-records/{id}` takes a complete valid record body; absent records return `404 RECORD_NOT_FOUND`. `DELETE` returns `204` or the same `404`; the web requires a separate confirmation before deletion.
- A local Docker PostgreSQL 16 container `shopping-recorder-db` is running with database/user `shopping_recorder`/`shopping`; migrations `0001`–`0005` and `0007` are applied. Earlier local API/web smoke checks used `http://127.0.0.1:3000` and `http://127.0.0.1:5173`.
- The documentation-only scope correction ran `./init.sh` successfully; it made no application-source, migration, environment, or endpoint changes.

## Next Session Startup

1. Read `AGENTS.md`, `feature_list.json`, `progress.md`, `docs/PRODUCT_PLAN.md`, `docs/MOBILE_LOCALIZATION_DRIVE_PLAN.md` and relevant architecture/API/testing notes.
2. Account registration is operational again: local database configuration was corrected, auth integration passed 1/1, and an HTTP registration smoke returned 201 with its diagnostic account cleaned up.
3. B2 bucket CORS is configured and live preflight/upload verification passes; manually retry the browser workflow if desired.
4. Run `./init.sh` and activate feat-034 using the current handoff at the top. feat-013, feat-031, feat-032 and feat-033 are complete; device/browser QA limitations remain documented. Older planning/feature sections below are historical.

## Feature 019 Handoff

- Completed after explicit approval: removed the dead web shopping components/API/tests and backend CRUD/domain/repository/tests; retired paths now return `404 ROUTE_NOT_FOUND`.
- Migration `0008_drop_legacy_shopping_records.sql` applied after a zero-row inventory; PostgreSQL confirms the legacy table is absent and the migration is recorded. Migration `0002` was not changed.
- Verification: backend 46 pass/2 skip plus typecheck/build; PostgreSQL auth+recorder 2/2; web 16/16 plus typecheck/build; live endpoint/readiness/web smoke passed. Local runtime remains backend 3001 and web 5173.

## Feature 018 Handoff

- Implemented: additive `/api/v1/health/ready`, response request IDs, health no-store, explicit proxy trust, production configuration fail-fast, graceful shutdown, separate production Docker images with healthchecks, nginx SPA/static caching, and a production-neutral operations runbook.
- Verification: backend 56 pass/2 integration skip plus typecheck/build; web 26/26 plus typecheck/build; both Docker builds pass; nginx config and container Argon2 smoke checks pass; live local readiness returns 200 with no-store and request ID.
- Local runtime: only the updated backend on 3001 and web on 5173 should remain. Port 3000 had a parent npm/tsx watcher and was stopped at the process tree after it respawned.
- Still required before completion: approved production target/TLS/secret manager, replica count and shared rate-limit decision, backup RPO/RTO/retention, and malware scanner or explicit risk acceptance. These are recorded as release blockers in `docs/OPERATIONS.md`; do not infer them.
- Status: explicitly deferred and marked `blocked` by user direction on 2026-09-13 so work can proceed to `feat-019`.

## Feature 017 Handoff

- Password-boundary amendment: user-directed minimum is now 6 characters everywhere (maximum remains 128); backend tests prove 6 accepted/5 rejected and the web account test exercises the 6-character constraint.
- Active local test stack at handoff: open Vite only at `http://localhost:5173`; its browser API URL is `http://localhost:3001/api/v1`, while the updated backend process listens on `127.0.0.1:3001`. Keeping `localhost` on both browser-visible origins is required for the session cookie; the earlier mixed hostname caused `AUTH_REQUIRED` during upload. CORS/credentials, health, and live 5/6-character boundary smoke checks passed without creating data. The pre-existing port-3000 backend was left untouched.

- Security: Fastify now rejects unknown fields instead of stripping them, protected responses are no-store, API responses carry restrictive security headers, and rate-limit errors preserve the standard envelope.
- Important fix: guarded routes are registered after the rate-limit plugin, so auth and recorder route configuration now executes. Duplicate active upload retries are rejected before another B2 capability is issued.
- Coverage: backend tests exercise cookies/digests, owner isolation across every lifecycle surface, malformed/oversized/unsupported uploads, provider outages/recovery, mutation bursts, audit secrecy, and exact-version behavior. Web tests cover accessible form names, labels, progress/error announcements, lifecycle confirmation, and async states.
- Runbook: `docs/TESTING.md` contains the automated release gate, PostgreSQL integration command, coverage matrix, and manual browser/B2 walkthrough.
- Production gate: allowed media is size/type/signature/checksum verified, but no malware engine is configured. `feat-018` must select one or record explicit risk acceptance before release.
- Verification after the password amendment: backend 53 pass/2 skipped plus typecheck/build; PostgreSQL 2/2 from the original feature close; web 26/26 plus typecheck/build; both production dependency audits 0 vulnerabilities; final `./init.sh`; all 9 API JSON examples parsed; harness 100/100. Browser visual E2E was unavailable because no browser instance was connected.

## Feature 016 Handoff

- API: added owner-scoped `PATCH`, cancel, delete, cleanup-retry, and audit-event endpoints. Cancelled/deleted activities cannot expose media; missing and unauthorized resources remain indistinguishable.
- Persistence/storage: migration `0007` adds lifecycle timestamps, append-only audit events, and pending/succeeded cleanup jobs. B2 cleanup resolves unverified keys to a version and always deletes an exact version.
- Web: history detail supports corrections, cancellation/deletion confirmation, audit display, clear cleanup outcomes, and immediate history refresh.
- Retention: there is no automatic MVP expiry. A logical state change commits before provider calls; failed cleanup remains pending for retry.
- Verification: backend 45 pass/2 integration skipped plus typecheck/build; PostgreSQL integration 1/1; web 24/24 plus typecheck/build; final `./init.sh`; harness 100/100.

## Feature 015 Handoff

- API: `GET /api/v1/recorder-activities` implements the documented pagination/filter/sort contract; `GET /api/v1/recorder-activities/{activityId}` includes assets ordered by ordinal and ID. Both are session-protected and owner-scoped.
- Web: `RecorderHistory` loads after session restoration, refreshes after a completed upload workflow, and displays only ready assets through `/api/v1/media-assets/{assetId}/content`.
- Verification: backend 40 pass/2 opt-in integration skipped plus typecheck/build; PostgreSQL recorder integration 1/1; web 22/22 plus typecheck/build; harness 100/100. In-app browser visual QA was unavailable because no browser runtime was connected.
