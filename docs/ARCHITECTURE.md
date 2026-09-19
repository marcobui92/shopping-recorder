# Architecture

## Current Technical Baseline

| Area | Current baseline |
| --- | --- |
| Web | React, TypeScript, Vite, Tailwind CSS v4, and local shadcn/ui components in `web/` |
| Backend | Node.js, TypeScript, and Fastify in `backend/` |
| Database | PostgreSQL |
| Local and production packaging | Docker-compatible services; local development may run each service directly |

The browser client communicates only with versioned API endpoints under `/api/v1`. The backend owns validation, authorization, persistence, provider credentials, and error responses.

The web design system uses Tailwind CSS v4 through its Vite plugin and theme tokens defined in `web/src/styles.css`. Reusable shadcn/ui-style primitives are source-owned under `web/src/components/ui/`, configured by `web/components.json`, and composed by the application rather than introduced as a separate runtime UI service. The interface remains responsive and preserves semantic labels, live status announcements, alert states, keyboard focus treatments, and native form behavior.

## Recorder Product Architecture

The target product records packing and unpacking evidence. A recorder activity owns metadata such as its operation type and timestamps. Each activity has one or more media assets (image or video), and every asset has an upload lifecycle plus a storage-provider reference.

```text
Browser
  -> Recorder API (authorization, metadata, upload coordination)
       -> PostgreSQL (activities, assets, ownership, upload state)
       -> S3-compatible storage (when selected)
       -> Google Drive (only through a user-authorized linked account)
```

The browser must never receive storage-provider secrets. The API must use short-lived, narrowly scoped upload/retrieval mechanisms and persist provider references rather than public URLs.

The API rejects unknown request properties instead of silently removing them, applies bounded per-IP mutation/upload rate limits, and preserves its stable error envelope for `429` responses. API responses include restrictive content/sniffing/frame/referrer headers; session, recorder, and media responses are never cacheable. Multi-instance production deployments must replace the in-memory rate-limit store with a shared store as part of `feat-018` deployment configuration.

## Storage-Provider Principles

- A provider-neutral storage interface is required so media metadata has one stable shape across S3 and Google Drive.
- S3 and Google Drive must be independently configurable and testable.
- A file is not completed evidence until its upload is finalized and verified by the backend.
- Media access must enforce the recorder record's ownership/access rule; direct public access is not an acceptable default.
- Google account linking, consent renewal/revocation, credential encryption, and Drive-folder behavior must follow the accepted controls below.

The implemented S3 provider uses Backblaze B2's S3-compatible API. Each upload attempt receives a distinct opaque object key and a short-lived presigned `PUT` that requires the declared content type and activity/asset metadata. Finalization checks object size, content type, and metadata, then reads that exact B2 object version through the authenticated backend SDK to compute SHA-256 over the stored bytes. It requires and persists B2's version ID; authorized retrieval is pinned to that verified version, so later reuse of an upload capability cannot replace completed evidence. This avoids treating client-controlled metadata or provider-specific ETags as content verification. A failed verification leaves the asset non-retrievable and triggers best-effort deletion of the specific failed version when its version ID is available.

The review workflow queries activity metadata only through owner-scoped, validated pagination and filters. Activity detail loads assets in stable ordinal order and exposes only application IDs and verified metadata. Images and videos use the authenticated application content endpoint, which returns a no-store redirect to a short-lived, version-pinned B2 download capability; permanent provider URLs and object references never enter the public activity resource.

The B2 bucket must remain private. Its bucket-scoped application key must provide read/write/delete object capabilities and must not be a master application key. Its S3-compatible CORS policy should allow only the configured web origin, the `PUT` method, and the exact capability headers (`Content-Type`, `x-amz-meta-activity-id`, and `x-amz-meta-asset-id`). Retrieval uses a short-lived, version-pinned presigned `GET` returned only after application-session owner authorization.

## Accepted Identity and Session Architecture

- Recorder users authenticate with an application-managed username and password.
- Users may self-register their application account; registration does not require prior administrator provisioning or approval in the MVP.
- An email address is optional account metadata. Only users who have supplied an email may use self-service password recovery; accounts without email cannot initiate that recovery flow.
- Passwords contain 6–128 characters and are hashed with Argon2id. Registration, login, and password-reset requests are rate-limited. Password-reset tokens are random, single-use, short-lived, and stored only as a digest; recovery responses are generic to prevent account enumeration.
- Authentication uses a server-managed session identified by an opaque persistent cookie. The cookie uses `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` outside local development. Session tokens are not stored in browser `localStorage`, and only a verifier/digest is persisted server-side.
- A session expires after 30 days without activity and has a non-extendable 90-day absolute lifetime. The server enforces both limits and the cookie expires no later than the absolute limit. Session identifiers rotate at authentication; logout revokes the current session, while password reset revokes all sessions for the account.
- State-changing cookie-authenticated requests require CSRF protection and same-origin validation.
- Google is not an identity or login provider for the recorder. Google OAuth is an optional connected-account flow used only for Drive storage.
- Only an already-authenticated application user may link, replace, or revoke a Google Drive connection.
- The internal application user ID owns recorder activities and media metadata. A Google account ID or email is connection metadata and must never become the ownership key.
- Linking or unlinking Google must not create, merge, authenticate, or delete the application account.

## Accepted Google Linking and Access Architecture

Google Drive was deferred on 2026-09-05 and reprioritized on 2026-09-15 after the planned phone-first experience. Connection management and the server-mediated adapter are now implemented; authorized live Google validation passed on 2026-09-16. These accepted controls govern `feat-013`; provider-choice/default UI is implemented in `feat-031`. See [the next-delivery plan](MOBILE_LOCALIZATION_DRIVE_PLAN.md).

- Each internal user may link at most one Google account.
- Linking uses a backend authorization-code flow with `state`, PKCE, and offline access. It requests only `https://www.googleapis.com/auth/drive.file`; Google sign-in scopes are not requested.
- Refresh tokens are encrypted at rest with a server-held, versioned encryption key. Access tokens are short-lived and are not persisted in the browser. Re-encryption supports key rotation without requiring a new user grant.
- Unlinking calls Google's revocation endpoint and deletes stored credentials. It does not delete provider files or application media metadata. Invalid or revoked credentials put the connection in `reauthorization_required`; the user must explicitly link again.
- The application creates one visible `Shopping Recorder` folder with activity-specific child folders. Arbitrary user-selected folders are out of MVP scope.
- Each activity selects either configured S3 storage or the user's linked Drive. Its assets cannot span providers.
- Planned default: a valid, available Drive connection is preferred for each new activity; otherwise available application storage is the default. Explicit user selection wins before creation. After creation, provider failures require recovery on the same provider; no automatic fallback or migration occurs.
- Only the internal activity owner may access activity metadata or media in the MVP. No sharing or administrator bypass is part of the recorder contract.

Upload limits, byte signatures, checksums, and accepted media formats are enforced by the S3 workflow. No malware engine is configured; `feat-018` must select one or explicitly accept the release risk before production.

## Planned Phone and Localization Direction

The 2026-09-15 planning decision makes phones the primary UI, with responsive tablet/desktop layouts and explicit Safari iPhone/Chrome Android verification. Create/history navigation and keyboard-safe controls must preserve in-progress form and upload state. The existing React/Vite web and Fastify backend roots remain unchanged.

`feat-027` will introduce Vietnamese-default application-owned messages plus English switching, a browser-local remembered preference, locale-aware formatting and document/accessibility language. Translation changes presentation only: API enum/error codes, identifiers, user content and stored timestamps remain stable. The client maps stable error codes to localized messages with a safe localized fallback. Browser/OS/provider-owned dialogs are outside application translation coverage. A localization library and concrete file layout have not been selected by this documentation change.

Reference search (`feat-032`) belongs at the owner-scoped server query boundary. Recovery (`feat-034`) reconciles existing server-created activities/assets and preserves their provider; it must not rely on React state surviving reload or promise persistent browser access to selected files. Any new contract or migration must be versioned/documented and implemented across affected boundaries by its owning feature.

## Recorder Persistence Boundaries

The normalized recorder model is specified in `docs/RECORDER_DATA_MODEL.md`. The main ownership chain is `app_users -> recorder_activities -> media_assets -> media_upload_attempts`. `google_drive_connections` belongs to a user but never participates in record ownership.

Activity and asset rows store the selected provider plus opaque server-only provider references. Public API resources expose stable application IDs instead of bucket keys, Drive file IDs, resumable-upload identifiers, credentials, or permanent URLs. A composite activity/provider foreign key prevents assets from crossing the activity's selected provider.

Provider adapters issue short-lived upload capabilities and implement verification, while the recorder domain owns lifecycle transitions. Consequently, S3 and Drive integrations cannot mark an asset `ready` without proving the object exists and matches the expected size, type, and SHA-256 digest.

The implemented browser workflow uses an application session cookie, computes SHA-256 locally, creates one server-side asset/attempt per selected file, uploads directly with provider-returned instructions, and asks the backend to finalize. Upload response loss is resolved by finalizing the same attempt before retrying, preventing duplicate logical assets. Explicit activity completion remains a locked PostgreSQL transition requiring at least one asset and all assets ready.

Lifecycle control is a two-phase boundary. PostgreSQL first commits a `cancelled` or internal `deleted` state, expires active attempts, appends a provider-neutral audit event, and creates cleanup jobs. Only then does the service delete exact B2 versions. Failed calls remain pending for owner-authorized retry, while list/detail/content authorization already denies access. The MVP applies no automatic expiry. Metadata correction is allowed independently of evidence bytes and is always captured as a before/after audit event without provider references.

## Retired Shopping-Record Implementation

The user approved complete retirement in `feat-019` after the local inventory confirmed that `shopping_records` contained zero rows. The dead browser components/client, backend CRUD/domain/repository, and their tests were removed together. Forward migration `0008_drop_legacy_shopping_records.sql` drops the obsolete table; the already-applied `0002` migration remains immutable for migration checksum history.

## Environment Contract

`web/.env.example` documents browser-safe variables prefixed with `VITE_`. `backend/.env.example` documents server-only configuration. Real environment files are local-only and must never be committed.

Existing backend configuration includes `PORT`, `HOST`, `DATABASE_URL`, `CORS_ORIGIN`, and explicit proxy trust. `B2_REGION`, `B2_BUCKET_NAME`, `B2_APPLICATION_KEY_ID`, and `B2_APPLICATION_KEY` enable S3-compatible storage; upload/download capability lifetimes and image/video byte limits have bounded `B2_*` settings documented in `backend/.env.example`. The endpoint is derived as `https://s3.<region>.backblazeb2.com`. `feat-013` now validates optional Google OAuth variables and a base64-encoded 32-byte token-encryption key; OAuth routes and the Drive adapter are wired when Google and database configuration are present. Authorized live consent/upload verification passed on 2026-09-16.

## Database Migrations

PostgreSQL changes use ordered SQL files in `backend/migrations/` named `NNNN_description.sql`. Run `npm run migrate --prefix backend` after setting a real `DATABASE_URL` in `backend/.env`. The runner records filenames and SHA-256 checksums in `schema_migrations`, serializes concurrent runs with a PostgreSQL advisory lock, and rejects a migration whose applied contents have changed.

Recorder persistence is introduced through migrations beginning at `0003`; the sequence and table-level constraints are defined in `docs/RECORDER_DATA_MODEL.md`. Migration `0008` is the separately approved destructive retirement of the obsolete, empty local `shopping_records` table. Existing applied migration files remain unchanged.

## Local Commands

Run `./init.sh` from the repository root to install dependencies for both application roots. Then start each service in its own terminal:

```bash
npm run dev --prefix backend
npm run dev --prefix web
```

The repeatable automated gate, PostgreSQL integration command, accessibility expectations, and disposable-data browser walkthrough are documented in `docs/TESTING.md`.

Production-neutral container packaging, health/readiness semantics, graceful shutdown, storage-cost checks, backup/recovery, and provider-outage procedures are documented in `docs/OPERATIONS.md`. The final deployment target, multi-replica shared rate-limit store, backup objectives, and malware-scanning decision remain explicit `feat-018` release gates.


## Drive implementation notes (2026-09-16)

Drive upload capabilities target the session-protected API. The backend streams the exact declared byte count to Google's resumable endpoint; provider credentials/session URLs never enter the browser. Resumable session URLs are encrypted with the same versioned AES-GCM envelope as refresh tokens. A persisted one-use transfer guard prevents another write under the same attempt; finalize reconciles interrupted responses. The upload holds activity/asset/attempt row locks while forwarding (up to ten minutes), so cancellation waits for the transfer before revoking access and deleting evidence. Configure upstream request-size/time limits accordingly; this is not browser background upload or byte-level resume.

Verification reads and pins the exact binary revision rather than assuming Drive's mutable head has B2 semantics. Reads use the retained revision and never silently switch to newer bytes. Unlink keeps provider files; replacement cannot access earlier references unless the original Google account is restored. Cleanup remains retryable after unlink/outage. Root folders are retained on reconnect and new roots carry an app owner property for rediscovery after unlink. Account state probes distinguish invalid grants from transient provider failures.

Recovered migration 0006 to its original checksum-verified applied contents after finding OAuth-state SQL appended by a prior session. Additive 0009 adds the one-use upload marker; 0010 creates OAuth states. No migration ledger/checksum was rewritten, no application rows reset. Both new migrations applied locally. Live OAuth/Drive verification passed on 2026-09-16; physical mobile preview/download remain unverified. Drive-first creation defaults are implemented in feat-031.


## Provider selection (feat-031)

The session-protected, no-store storage-providers endpoint supplies deployment B2 configuration availability and the current user's probed Drive connection state. Client defaults prefer connected Drive, then B2. Explicit selections survive background refresh; created activities never switch provider. Neither selectability check guarantees storage quota. Provider failures retain the activity for same-provider retry and show connection/free-space recovery guidance. No migration, environment change, or new provider credentials are required by this feature.


## Reference search (feat-032)

Owner-scoped activity listing accepts an optional reference substring query. The server trims query edges and validates length/NUL before parameterized SQL applies strpos(lower(reference), lower(parameter)) alongside the existing owner, lifecycle, provider, operation and date predicates. Both count and page retrieval share that predicate; sorting stays occurredAt/ID. No user reference normalization/write occurs. Existing owner/history indexes remain; result size is bounded by the existing pageSize limit. Substring/count queries may scan a large owner's history, so large-volume tuning should be measured before introducing a trigram index/extension.

## Manual evidence comparison (feat-033)

Comparison is a read-only projection over existing owner-scoped activities. The candidate query uses parameterized, case-insensitive exact-reference matching and independently returns at most 50 newest packing and 50 newest unpacking records. It excludes tombstones and other owners but retains visible lifecycle states so the operator can make an informed choice. The application does not persist a pairing, impose reference uniqueness, or infer which records belong together.

The browser requires explicit selection when either side has multiple candidates, then reuses the existing activity-detail and protected media-content boundaries. Phone layouts switch between packing and unpacking tabs; wider layouts show both columns. B2 and Drive evidence keep their existing authorization, immutable-version and download behavior. No migration, provider change, public URL, or automated damage analysis is introduced.
