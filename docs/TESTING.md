# Recorder Verification Guide

## Automated release gate

Run from the repository root:

```bash
./init.sh
npm run migrate --prefix backend
npm run test --prefix backend
npm run typecheck --prefix backend
npm run build --prefix backend
npm run test --prefix web
npm run typecheck --prefix web
npm run build --prefix web
```

The backend `tsx` runner creates a local IPC pipe. In a restricted execution sandbox, `npm run test --prefix backend` may fail with `listen EPERM`; rerun that exact command in a normal local shell. Do not treat the sandbox failure as a passing test.

Run PostgreSQL boundary tests explicitly after migrations:

```bash
cd backend
RUN_DATABASE_INTEGRATION=1 node --env-file=.env --import tsx --test src/auth/repository.integration.test.ts src/recorder/repository.integration.test.ts
```

These tests create uniquely named fixtures and remove them in `finally` blocks.

## Coverage matrix

| Boundary | Required evidence |
| --- | --- |
| Authentication/session | Argon2-backed registration/session integration, generic invalid login, CSRF origin rejection, exact cookie parsing, revocation, and no-store responses |
| Authorization | Missing and other-owner activities/assets return equivalent `404` responses across read, correction, cancellation, deletion, audit, and content routes |
| Upload abuse | Unknown fields, unsupported MIME declarations, excessive byte sizes, malformed checksums, duplicate active attempts, and mutation bursts fail before privileged provider behavior |
| Provider failures | Missing objects and verification mismatches fail closed; transient finalize/download/cleanup outages use stable errors and preserve retryable state |
| Lifecycle integrity | PostgreSQL integration covers finalization, completion, 30-day expiry with retained metadata and denied retrieval, audited correction, tombstone visibility, exact-version cleanup jobs, retry completion, and fixture cleanup |
| Browser behavior | Component tests cover session restore, validated file selection, upload/finalize/reconciliation/retry, completion, history states, evidence rendering, correction, confirmation, and audit display |
| Accessibility | Forms and landmarks have accessible names; fields have programmatic labels; progress has a file-specific label; asynchronous success uses status; actionable failures use alert; controls expose disabled state |
| Build safety | Both roots pass TypeScript checks and production builds |

## Manual browser end-to-end check

1. Configure local `backend/.env` and `web/.env` from their examples. Use a private test B2 bucket/key, never production credentials or customer evidence.
2. Run `npm run migrate --prefix backend`, then start backend and web in separate terminals.
3. Register a disposable operator through the browser and confirm a refresh restores the session.
4. Create a packing activity with one small JPEG and one small MP4. Confirm each file moves through hashing, upload, finalization, and `ready` before completion becomes available.
5. Complete the activity, open it in history, and verify authenticated image/video retrieval.
6. Correct the reference or notes and confirm a timestamped audit event appears.
7. Create a second unfinished activity, cancel it, and confirm its media is no longer retrievable.
8. Delete the completed disposable activity using the explicit confirmation. Confirm it disappears from history and its B2 object versions are removed.
9. Delete the disposable account/fixtures with reviewed SQL only if required; do not use broad recursive or bucket-wide cleanup commands.

Record the browser, backend, PostgreSQL, and B2 outcomes in `progress.md`. Live B2 checks are supplemental: deterministic adapter tests and PostgreSQL integration remain mandatory even when credentials are unavailable.

For direct mobile capture, repeat the upload with the camera controls using an image and a video larger than 1 MiB. The Drive server proxy must accept the configured media limit rather than Fastify's default request limit. Also verify Safari/Chrome camera files whose MIME metadata is empty or `application/octet-stream`: recognized `.jpg`, `.heic`, `.mp4`, `.mov`, and `.webm` filenames are normalized, while an unrecognized extension remains rejected.

At a narrow phone width in both VI and EN, open the profile menu and verify long Drive account actions wrap inside the viewport, inside actions remain clickable, and tapping outside dismisses it. In New record, confirm storage/operation are visible side by side, reference/notes stay full-width, and the camera actions appear with substantially less scrolling while desktop spacing remains unchanged. In Evidence archive, View evidence must open a centered, internally scrollable dialog; closing by X, outside tap, or Escape must retain search filters and pagination, and the nested evidence viewer must remain above the detail dialog.

## Known production gate

The application verifies allowed MIME declarations, byte signatures, size, ownership metadata, and SHA-256, but it does not run an antivirus or content-scanning engine. `feat-018` must select an operational scanner or explicitly document risk acceptance before a production release; this guide must then add its outage and positive-detection checks.

Also validate the production images and operational probes described in `docs/OPERATIONS.md`. A release candidate must return `200 ready` with healthy dependencies, `503 not-ready` without them, emit a correlatable `X-Request-Id`, and exit cleanly on `SIGTERM`.


## Google Drive gate (feat-013)

Run normal backend/web test, typecheck, build commands. PostgreSQL integration now includes:

```bash
cd backend
RUN_DATABASE_INTEGRATION=1 node --env-file=.env --import tsx --test src/auth/repository.integration.test.ts src/recorder/repository.integration.test.ts src/google/repository.integration.test.ts
```

The Drive integration creates disposable app/connection/activity fixtures, uses a fake provider with real PostgreSQL ownership/locking/state, and cleans them afterward. It proves state single-use/owner binding, credential removal, server transfer one-use and length checks, Drive persistence (not hardcoded S3), SHA-256/signature verification, ready reads, owner isolation, unlink access loss and cleanup retry after reconnect. It does not prove Google consent or provider API behavior.

Live gate: use an authorized disposable Google account, enable Drive API and register the exact GOOGLE_REDIRECT_URI and web origin. In the app profile, connect Google, grant drive.file, verify cancellation/reconnect/replace/unlink and invalid-grant messaging. Provider-selection UI belongs to feat-031, so until then exercise Drive creation via an authenticated API client with explicit storageProvider=google_drive. Upload a small allowed image and video using returned server instructions, finalize/complete, review/download through history, and compare original hashes. Edit the Drive head and confirm the original revision remains served; trash/remove the file/revision and verify a bounded failure. Unlink must preserve files; reconnect the original account and retry pending cleanup. Record actual Safari/Chrome playback, original filenames and download results. Do not use production evidence or record tokens/session URLs in logs.

Current local gate: no Google connection is stored, and Browser discovery returned no available browser. Live Google/device tests remain pending; automated provider mocks are not equivalent evidence.


## Feature 031 storage-selection verification

Automated: run `npm run test --prefix web && npm run typecheck --prefix web && npm run build --prefix web` and the corresponding `--prefix backend` commands. Coverage includes the authenticated/no-store provider-state matrix, missing configuration, Drive-first and B2 fallback defaults, explicit-choice preservation, revoked selection, no providers, status-request failure/recovery, same-provider retries, fresh-record default recalculation, VI/EN state preservation and cancelling OAuth without submitting or discarding the form. History filters no longer constrain results to B2.

Manual device gate (unavailable in the 2026-09-17 session; Browser discovery returned []): on Safari iPhone and Chrome Android, check both locales at phone widths, connect/reconnect from a form with selected files (confirm warning or cancel), create a disposable Drive record, verify its detail provider/download, then deliberately choose B2 for a second disposable record. Check refresh after unlink/revocation, unavailable providers, free-space/provider failures and same-provider retry. Use Start another record to verify the default is recalculated. The status endpoint does not probe B2 health or provider quotas. The earlier authorized live Drive smoke is recorded under feat-013; it was not rerun for this UI feature.


Drive browser CORS regression (2026-09-17): backend app tests assert upload PUT and lifecycle PATCH/DELETE preflight method/origin/credential/header acceptance and deny foreign origins; web API tests simulate XHR network failure for both upload strategies. Check Access-Control-Allow-Methods, not merely the OPTIONS 204 status. Live local Drive preflight was verified after the fix; actual user upload retry is still a manual check. Google provider smoke via Node alone cannot prove browser CORS.


## Feature 032 reference search verification

Run web/backend test/typecheck/build commands and, from backend, `RUN_DATABASE_INTEGRATION=1 node --env-file=.env --import tsx --test src/recorder/repository.integration.test.ts`. The dedicated PostgreSQL test uses unique temporary accounts and cleans its own rows. It covers case-insensitive literal search, both providers, count/page boundaries, owner/deleted/null isolation, status/date/provider composition, %, _, backslash, quotes, Unicode, internal whitespace and absent matches. API tests cover trimming/blank input, authentication, repeated/NUL/overlong queries and page-size bounds. Client tests verify encoding, search/apply/clear pagination, preserved filters/query, VI/EN loading/error/empty states and language switching.

Manual check still needed when a browser/device is available: in Evidence archive, search a partial reference from outside the current page, combine filters, paginate, clear search, and switch VI/EN at phone widths. Confirm no horizontal overflow and the native search clear button plus Apply filters removes the search. Browser discovery returned no instances on 2026-09-17.

## Feature 033 manual comparison verification

Run the normal web/backend test, typecheck and build commands plus the recorder PostgreSQL integration command. API coverage verifies exact case-insensitive reference matching, edge trimming, missing/duplicate/overlong input, owner and tombstone isolation, newest-first ordering, public response shape, and an independent 50-candidate bound for each operation. PostgreSQL coverage verifies exact matching and owner isolation against real parameterized queries. Client coverage verifies URL encoding, no automatic selection when a side has multiple candidates, one-candidate selection, missing-side messaging, protected B2/Drive media/download URLs, phone tabs, and VI/EN state preservation.

Manual device check remains required: in Evidence archive, enter a reference with one packing and one unpacking record, then a reference with multiple records on one side, and explicitly choose candidates. Verify phone tab switching, wide two-column layout, long filenames/notes, image containment, video controls, downloads, missing-side and unavailable-provider errors in both locales. Browser skill discovery returned no available instances on 2026-09-17, so no interactive or physical-device result is claimed.
