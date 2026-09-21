# API Contract

## Conventions

- Base path: `/api/v1`
- Content type: `application/json`
- Successful responses return JSON with an HTTP 2xx status.
- Errors return `{ "error": { "code": "STRING", "message": "Human-readable message" } }`.
- Protected recorder endpoints belong to application users authenticated by username and password. The browser sends an opaque persistent session cookie managed and revocable by the backend; sessions expire after 30 days of inactivity or 90 days absolutely.
- Registration and login are application-owned flows. Users may self-register without administrator provisioning; registration accepts optional email account metadata. Self-service password reset is available only when the account has an email on file. Registration, login, and reset are rate-limited and reset responses must not disclose account existence.
- Google OAuth is not a login endpoint. Link, replace, status, and revoke operations require an existing authenticated application session and only manage optional Drive storage authorization.
- Google linking requests only `drive.file`, permits one connected Google account per application user, and uses an app-managed Drive folder. OAuth access and refresh tokens are never returned by the API.
- Recorder authorization uses the internal application user ID. Only the owner may access an activity or its media in the MVP.
- API responses send `nosniff`, frame denial, no-referrer, and restrictive API content-security headers. Authentication, recorder, and media responses use `Cache-Control: no-store`.
- Authentication and recorder mutations are rate-limited. Limit responses use the standard error shape with `429 RATE_LIMITED` and a `Retry-After` header.
- Every response includes `X-Request-Id` for correlation. Health responses are not cacheable.

## Operational Health Endpoints

`GET /api/v1/health` is the backward-compatible liveness probe and returns `200 { "data": { "status": "ok" } }` while the process can serve HTTP. `GET /api/v1/health/ready` checks required runtime configuration and PostgreSQL connectivity. It returns `200 { "data": { "status": "ready" } }` or `503 { "data": { "status": "not-ready" } }` without exposing dependency or credential details. Neither endpoint requires authentication.

## Recorder Contract Status

The recorder contract supports packing/unpacking activities and verified image/video evidence. Authentication, S3 activity creation, media intent/retry/finalize, explicit completion, owner-authorized activity history/detail, and authorized content retrieval are implemented. Google Drive connection and server-mediated storage are implemented in feat-013, with authorized live Google verification completed on 2026-09-16. Provider selection and Drive-first defaults are implemented in feat-031.

| Capability | Planned responsibility | Owning feature |
| --- | --- | --- |
| Identity and connected accounts | Application registration/session/login/logout are implemented; optional Google linking is implemented and live-verified | feat-010 / feat-014 / feat-013 |
| Recorder activities | Create and read packing/unpacking activity metadata, status, and ownership | feat-011 / feat-014 |
| Media assets | Create upload intent, finalize a verified image/video asset, and retain provider-neutral metadata | feat-011 / feat-012 |
| S3 storage | Coordinate secure S3 uploads and retrieval without public credentials or URLs | feat-012 |
| Google Drive storage | Coordinate Drive uploads through a linked Google account and approved folder policy | feat-013 |
| Review | List, filter, and retrieve activities and authorized evidence previews/playback | feat-015 |
| Lifecycle controls | Correct metadata, audit changes, cancel unfinished work, delete records, and automatically expire stored evidence 30 days after completion with retryable provider cleanup | feat-016 / feat-041 |

## Planned Additions — Not Implemented (2026-09-15)

The documentation-only roadmap in [MOBILE_LOCALIZATION_DRIVE_PLAN.md](MOBILE_LOCALIZATION_DRIVE_PLAN.md) assigns these future responsibilities. This section adds no callable endpoint, query parameter, response field, or new runtime language behavior.

| Feature | Contract boundary for future implementation |
| --- | --- |
| feat-027 | Client translates stable error/status codes and formats values; existing enum values, error envelope, timestamps and user content remain unchanged. No language-preference API is planned initially. |
| feat-028 / feat-029 | Responsive navigation and capture/selection preserve the activity/media lifecycle. Any exposure of configured upload limits must be additive and documented when implemented. |
| feat-030 | Preserve owner-authorized, verified original bytes for viewing/download; document any needed download headers or additive endpoint when implemented. |
| feat-013 | Define connection status/link/callback/reconnect/unlink operations and Drive upload/retrieval/lifecycle behavior, keeping credentials server-only and preserving existing S3 support. |
| feat-031 | Use authoritative provider availability/connection state for the visible default; still send explicit storageProvider at creation and never silently change an existing activity's provider. |
| feat-032 | Add and document bounded owner-scoped reference search, matching semantics and interaction with pagination/filters. The optional reference parameter below provides literal substring search. |
| feat-033 | Implemented below: retrieve only owner-authorized exact-reference candidates for manual comparison; no unique-reference constraint or automatic pairing is implied. |
| feat-034 | Reconcile server-created activity/asset/attempt states after interruption; document any additive recovery contract while preserving asset identity and provider. |

Concrete schemas and examples must be updated together with client, backend and tests in the owning implementation feature. The creation UI defaults to available linked Drive, otherwise configured B2, and sends the explicit selected provider. Existing activities retain their provider.

## Authentication Endpoints

Authentication mutations require the configured web `Origin`. Registration and login are rate-limited. Successful registration and login set an opaque `recorder_session` cookie with `HttpOnly`, `SameSite=Lax`, `Path=/`, a persistent lifetime no longer than 90 days, and `Secure` outside local development. Raw session tokens and password hashes are never returned.

### `POST /api/v1/auth/register`

Creates an application account and starts a session. Usernames are case-insensitively unique, contain 3–64 letters, numbers, dots, underscores, or hyphens, and preserve their display casing. Passwords contain 6–128 characters and are stored with Argon2id. Email is optional.

```json
{
  "username": "warehouse.operator",
  "password": "a-long-operator-password",
  "email": "operator@example.com"
}
```

Returns `201` with `{ "data": { "user": { "id", "username", "email" } } }`. Duplicate usernames return `409 USERNAME_TAKEN`.

### `POST /api/v1/auth/login`

Accepts `username` and `password`, returns the same public user shape, and starts a new persistent session. Invalid or disabled accounts return the generic `401 INVALID_CREDENTIALS` response.

### `GET /api/v1/auth/session`

Returns the current public user for a valid session, or `401 AUTH_REQUIRED`.

### `POST /api/v1/auth/logout`

Revokes the presented session, clears its cookie, and returns `204`. The operation is idempotent.

## Recorder Resource Schemas

All timestamps are UTC RFC 3339 strings. Request objects reject unknown properties. String fields are trimmed before validation. Provider locators and credentials are never public resource fields.

### Activity

```json
{
  "id": "3b9b6354-e351-4aed-94b1-828ea68de6c2",
  "operationType": "packing",
  "status": "uploading",
  "storageProvider": "s3",
  "reference": "ORDER-1042",
  "notes": "Outer carton and seal",
  "occurredAt": "2026-09-03T08:30:00.000Z",
  "completedAt": null,
  "evidenceExpiresAt": null,
  "expiredAt": null,
  "createdAt": "2026-09-03T08:31:00.000Z",
  "updatedAt": "2026-09-03T08:32:00.000Z",
  "assets": []
}
```

- `operationType`: `packing` or `unpacking`.
- `status`: `draft`, `uploading`, `complete`, `expired`, or `cancelled`. Internal `deleted` tombstones are never returned.
- `storageProvider`: `s3` or `google_drive`; it cannot change after the first asset is created.
- `reference`: nullable string, maximum 160 characters.
- `notes`: nullable string, maximum 2,000 characters.
- `occurredAt`: required valid timestamp, defaulted to server time when omitted during creation.
- `evidenceExpiresAt`: null until completion, then exactly 30 days after `completedAt`.
- `expiredAt`: set when the retention sweep revokes evidence access and queues provider cleanup; expired record metadata remains visible.
- `assets`: included by the detail endpoint and omitted from list items.

### Media asset

```json
{
  "id": "a6c2b026-5e4c-4436-8c51-b597033bbf2f",
  "activityId": "3b9b6354-e351-4aed-94b1-828ea68de6c2",
  "ordinal": 1,
  "mediaType": "image",
  "status": "ready",
  "originalFilename": "carton-seal.jpg",
  "contentType": "image/jpeg",
  "sizeBytes": 2418790,
  "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "readyAt": "2026-09-03T08:33:00.000Z",
  "createdAt": "2026-09-03T08:31:30.000Z",
  "updatedAt": "2026-09-03T08:33:00.000Z"
}
```

- `mediaType`: `image` or `video`.
- `status`: `pending_upload`, `verifying`, `ready`, or `failed`.
- `contentType`, `sizeBytes`, and `sha256` contain expected values until verification and verified values when `ready`.
- `sha256` is exactly 64 lowercase hexadecimal characters.
- `readyAt` is null unless `status` is `ready`.

### Upload capability

```json
{
  "attemptId": "4bc74257-cc21-46ac-8191-b94b734ea06a",
  "strategy": "direct",
  "method": "PUT",
  "url": "https://short-lived-upload-capability.example",
  "headers": {
    "Content-Type": "image/jpeg",
    "x-amz-meta-activity-id": "3b9b6354-e351-4aed-94b1-828ea68de6c2",
    "x-amz-meta-asset-id": "a6c2b026-5e4c-4436-8c51-b597033bbf2f"
  },
  "expiresAt": "2026-09-03T08:46:30.000Z"
}
```

`strategy` is `direct` when the browser uploads through a short-lived provider capability and `api` when it uploads to an application endpoint. The client sends every returned header exactly as provided, treats `url`, `method`, and `headers` as opaque instructions, never persists them, and never logs them. Neither strategy exposes provider credentials. S3 upload attempts use distinct object keys. Backblaze B2 retrieval is pinned to the exact provider version verified by the backend, so reusing an older upload capability cannot replace completed evidence.

## Recorder Endpoints

All endpoints in this section require a valid application session and CSRF protection for state-changing requests. A record that exists but is not owned by the caller returns the same `404` as a missing record.

### `POST /api/v1/recorder-activities`

Creates an activity in `draft` state.

```json
{
  "operationType": "packing",
  "storageProvider": "s3",
  "reference": "ORDER-1042",
  "notes": "Outer carton and seal",
  "occurredAt": "2026-09-03T08:30:00.000Z"
}
```

Required fields are `operationType` and `storageProvider`; the other fields are optional and nullable where their resource schema permits it. Google Drive is accepted only when the caller has an active connection. S3 is accepted only when configured for the deployment.

Returns `201` with `{ "data": Activity }`.

### `GET /api/v1/recorder-activities`

Returns only the caller's activities. Supported query parameters:

- `page`: positive one-based integer, default `1`, maximum `1000000`.
- `pageSize`: positive integer, default `20`, maximum `100`.
- `operationType`: optional `packing` or `unpacking`.
- `status`: optional `draft`, `uploading`, `complete`, `expired`, or `cancelled`.
- `reference`: optional string, at most 160 characters before trimming. Leading/trailing whitespace is trimmed; empty/whitespace-only means no reference filter. Matches a literal substring, case-insensitively using PostgreSQL lower/collation behavior; accents and internal whitespace remain significant. `%`, `_`, backslash, quotes and punctuation are ordinary characters, not SQL wildcards. Null references do not match a nonempty query. Stored references are never rewritten. Search applies before count/pagination across all of the owner's visible records and combines with all other filters using AND. Existing page/pageSize bounds and stable sort are unchanged. Duplicate parameters, overlong values and NUL are rejected with 400 VALIDATION_ERROR.
- `storageProvider`: optional `s3` or `google_drive`.
- `occurredFrom` / `occurredTo`: optional inclusive RFC 3339 timestamps; `occurredFrom` must not exceed `occurredTo`.
- `sortDirection`: `asc` or `desc`, default `desc`; sorting is always by `occurredAt`, then `id`, in the same direction.

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "totalPages": 0,
    "totalRecords": 0
  }
}
```

List items omit `assets`. The empty collection uses `200`, not `404`.

### `GET /api/v1/recorder-activities/comparison-candidates`

Requires the application session and one `reference` query parameter. The raw parameter is at most 160 characters; the server trims its edges, rejects an empty value, NUL, duplicate/unknown parameters, and matches the stored reference exactly without regard to letter case. Internal whitespace, accents, punctuation and special characters remain significant. This differs deliberately from the activity list's substring search.

The response contains separate newest-first `packing` and `unpacking` arrays of public activity metadata plus `truncated`. Deleted and other-owner records never appear. Each side is independently limited to its newest 50 candidates; `truncated` is true if either side exceeded that limit. Every lifecycle status may appear so the operator can see incomplete/cancelled candidates rather than receiving a fabricated pair. No provider references, assets, credentials, or ownership IDs are returned.

```json
{
  "data": {
    "packing": [],
    "unpacking": [],
    "truncated": false
  }
}
```

The client never assumes references are unique. It auto-selects a side only when that side has exactly one candidate; multiple candidates require explicit selection. Selected evidence is then loaded through the existing owner-scoped activity-detail endpoint and protected content endpoint. Comparison is read-only and creates no stored pair or AI assessment.

### `GET /api/v1/recorder-activities/{activityId}`

Returns `200` with `{ "data": Activity }`, including assets ordered by `ordinal`, then `id`. Returns `404 ACTIVITY_NOT_FOUND` when absent or not owned by the caller.

### `PATCH /api/v1/recorder-activities/{activityId}`

Partially updates at least one of `operationType`, `reference`, `notes`, or `occurredAt`. Storage provider and evidence files are immutable. Every accepted update appends an audit event. Cancelled/deleted activities reject correction; otherwise returns `200` with `{ "data": Activity }`.

### `POST /api/v1/recorder-activities/{activityId}/cancel`

Cancels only a `draft` or `uploading` activity, expires active attempts, revokes media access immediately, and schedules every known provider object for cleanup. Returns `{ "data": { "activity": Activity, "cleanupPending": number } }`. Repeated cancellation is idempotent; completed activities return `409 ACTIVITY_NOT_CANCELLABLE`.

### `DELETE /api/v1/recorder-activities/{activityId}`

Deletes a completed or expired activity after explicit browser confirmation. The API changes it to an internal tombstone immediately and attempts exact-version provider cleanup. Returns `202` with `{ "data": { "cleanupPending": number } }`; deleted activities disappear from history/detail/content immediately.

Completed evidence automatically expires 30 days after `completedAt`. The backend sweep changes the activity to `expired` before provider calls, so content retrieval is denied immediately even if B2 or Drive deletion must retry. List/detail responses retain the record, asset metadata and audit trail; provider references remain private.

### `POST /api/v1/recorder-activities/{activityId}/cleanup-retry`

Retries pending provider cleanup for an owner-controlled cancelled or deleted activity and returns `{ "data": { "cleanupPending": number } }`. Provider locators and errors remain server-only.

### `GET /api/v1/recorder-activities/{activityId}/audit-events`

Returns the owner's append-only lifecycle events in ascending timestamp/ID order. Events expose application metadata before/after correction but never provider object references, URLs, credentials, or upload capabilities. Audit remains accessible for a deleted tombstone by its known application ID.

### `POST /api/v1/recorder-activities/{activityId}/media-assets`

Declares one asset and creates its first upload attempt. The operation changes a `draft` activity to `uploading`.

```json
{
  "mediaType": "image",
  "originalFilename": "carton-seal.jpg",
  "contentType": "image/jpeg",
  "sizeBytes": 2418790,
  "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
}
```

- `originalFilename`: required, 1–255 characters after trimming; used only for display.
- `contentType`: required, 1–127 characters and must be allowed for `mediaType` by the active media policy.
- `sizeBytes`: required positive safe integer and must satisfy the provider/media limits introduced by `feat-012`.
- `sha256`: required lowercase SHA-256 hex digest.

Returns `201`:

```json
{
  "data": {
    "asset": {},
    "upload": {}
  }
}
```

The response fields use the Media asset and Upload capability schemas above. A completed activity rejects new assets with `409 ACTIVITY_IMMUTABLE`.

### `POST /api/v1/media-assets/{assetId}/upload-attempts`

Creates a retry capability for a failed, expired, or pending asset when it has no nonterminal attempt. The existing asset ID and ordinal are retained. Returns `201` with `{ "data": { "asset": MediaAsset, "upload": UploadCapability } }`.

Returns `409 UPLOAD_ALREADY_ACTIVE` when an `issued` or `finalizing` attempt already exists, and `409 ASSET_ALREADY_READY` when verification previously succeeded.

### `POST /api/v1/media-assets/{assetId}/upload-attempts/{attemptId}/finalize`

Starts backend verification. The request body is an empty object. The server verifies provider existence, provider/activity binding, byte size, detected media type, and SHA-256 checksum over the stored bytes before marking the asset `ready`. The Backblaze B2 adapter reads the private object version once during finalization to calculate SHA-256; it does not trust browser metadata or an ETag as a content digest, and it stores B2's version ID for immutable retrieval.

Returns `200` with `{ "data": MediaAsset }`. Repeating finalization for the same successful attempt returns the same ready asset. An expired capability returns `410 UPLOAD_EXPIRED`; a verification mismatch returns `422 UPLOAD_VERIFICATION_FAILED` and marks the attempt and asset failed.

### `POST /api/v1/recorder-activities/{activityId}/complete`

Completes an activity only when it has at least one asset and every asset is `ready`. The request body is an empty object. Returns `200` with `{ "data": Activity }`; repeated completion is idempotent. Otherwise returns `409 ACTIVITY_NOT_COMPLETABLE`.

The S3-backed browser workflow computes SHA-256 before declaring each asset, follows the returned upload capability with per-file progress, finalizes every upload, and enables completion only when every selected file is ready. If the provider response is interrupted, the client first finalizes the same attempt to distinguish a committed object from a failed upload; a verified failure can then obtain a new attempt under the same asset.

### `GET /api/v1/media-assets/{assetId}/content`

Returns only ready evidence owned by the caller. The backend may stream a `200` response or issue a redirect to a narrowly scoped, short-lived retrieval capability. The response must not disclose provider credentials or a permanent public URL. Missing, unauthorized, or non-ready assets return `404 ASSET_NOT_FOUND`.

## Recorder Error Codes

All errors retain the standard `{ "error": { "code", "message" } }` shape.

| HTTP | Code | Meaning |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Body, path, or query input is invalid |
| 401 | `AUTH_REQUIRED` | Session is absent, expired, or revoked |
| 401 | `INVALID_CREDENTIALS` | Username/password authentication failed |
| 403 | `CSRF_VALIDATION_FAILED` | State-changing request fails CSRF/origin checks |
| 404 | `ACTIVITY_NOT_FOUND` | Activity is missing or not owned by caller |
| 404 | `ASSET_NOT_FOUND` | Asset is missing, unauthorized, or not ready for retrieval |
| 409 | `STORAGE_PROVIDER_NOT_AVAILABLE` | Provider is not configured, linked, or selectable for the user |
| 409 | `USERNAME_TAKEN` | Registration username is already used |
| 409 | `GOOGLE_REAUTHORIZATION_REQUIRED` | Drive connection exists but must be authorized again |
| 409 | `ACTIVITY_IMMUTABLE` | Completed activity cannot accept the requested mutation |
| 409 | `ACTIVITY_NOT_COMPLETABLE` | Activity has no assets or at least one asset is not ready |
| 409 | `ACTIVITY_NOT_CANCELLABLE` | Completed activity cannot use cancellation |
| 409 | `ACTIVITY_NOT_DELETABLE` | Activity must be completed before deletion |
| 409 | `UPLOAD_ALREADY_ACTIVE` | Asset already has a nonterminal upload attempt |
| 409 | `ASSET_ALREADY_READY` | Ready evidence does not need another upload |
| 410 | `UPLOAD_EXPIRED` | Upload capability can no longer be finalized |
| 422 | `UPLOAD_VERIFICATION_FAILED` | Stored bytes do not match declared evidence metadata |
| 429 | `RATE_LIMITED` | Authentication or recorder mutation rate exceeded; retry after the response delay |
| 503 | `STORAGE_PROVIDER_UNAVAILABLE` | Configured provider is temporarily unreachable |

Provider failures must map to these stable application codes. Provider response bodies, credentials, object references, and stack traces must not be returned to the browser.

## Implemented Endpoint

### `GET /api/v1/health`

Returns `200 OK` when the HTTP service is running:

```json
{
  "data": {
    "status": "ok"
  }
}
```

Unknown routes return `404` using the standard error shape with code `ROUTE_NOT_FOUND`. Invalid requests and unexpected server errors use `VALIDATION_ERROR` and `INTERNAL_ERROR` respectively.

## Retired Endpoint Surface

The former `/api/v1/shopping-records` CRUD surface was removed by the explicitly approved `feat-019` breaking change. Requests to those paths now return `404 ROUTE_NOT_FOUND`; clients must use the recorder activity APIs. Migration `0008_drop_legacy_shopping_records.sql` removes the obsolete table after the local pre-migration inventory confirmed it contained no rows.


## Google Drive connection and storage — feat-013 (2026-09-16)

All routes below require the application session, return `Cache-Control: no-store`, and never expose Google tokens, account IDs, file IDs, revision IDs, or upload-session URLs. Connection mutations are limited to 10/minute per client group. Google query parameters are omitted from application request logs.

| Endpoint | Behavior |
| --- | --- |
| `GET /api/v1/google-drive/status` | Returns `data: { configured, connected, state, updatedAt }`. `connected` means credentials are stored; `state` is `connected`, `disconnected`, `reauthorization_required`, or `unavailable`, based on a provider check. Missing configuration returns configured=false, connected=false, state=unavailable. |
| `POST /api/v1/google-drive/connect` | Origin-checked JSON `{}`; returns `data.authorizationUrl`. Navigate only after warning about unsaved work. Uses one-use owner-bound expiring state, PKCE and drive.file. Also used for reconnect/replace. |
| `GET /api/v1/google-drive/callback` | Requires the current application user to match the OAuth state owner; consumes state once. Redirects to configured web origin with `googleDrive=connected`, `cancelled`, `error`, or `unavailable`. Failed/cancelled OAuth does not affect the app login. |
| `DELETE /api/v1/google-drive/connection` | Origin-checked; revokes token, removes credentials and pending OAuth states, returns 204. Provider revocation outage returns 503 and retains credentials for retry. Does not delete Drive files or recorder metadata. |
| `PUT /api/v1/google-drive/uploads/{assetId}/{attemptId}` | Origin-checked, session-protected `application/octet-stream` with exact Content-Length. Streams to an encrypted server-only Google resumable session and returns 204. Uses the shared 60/minute upload group. Wrong owner returns 404, expired/unavailable attempt 410, reuse 409. |

Drive media intents/retries return the existing upload shape with additive `strategy: "server"`, an application API URL and `Content-Type: application/octet-stream`. The web sends cookies for this strategy only. Existing `strategy: "direct"` B2 uploads stay credential-free. Default limits without B2 configuration are 25 MiB/image and 500 MiB/video; when B2 limits are configured, both providers share them. Upload intents expire after 15 minutes. The server checks ownership, provider-account binding, lifecycle, attempt expiry and expected length before forwarding bytes. A one-use transfer guard survives interrupted responses; callers finalize to reconcile state before creating another attempt. Provider sessions are encrypted at rest. Upload retries allocate distinct Drive file IDs.

Finalization checks the file's activity/asset binding, metadata size/type, streamed byte count, SHA-256 and byte signature. It marks the binary revision Keep Forever and reads that exact revision before storing its server-only reference. No ready evidence is created on mismatch. Download uses that verified revision even if the user later edits the Drive file; removed/trashed files, removed revisions, changed-account connections and lost permissions fail closed with a retryable provider-unavailable response. Reconnect the original Google account to regain access; no migration or ownership reassignment occurs.

`GET /api/v1/media-assets/{assetId}/content` keeps B2's 307 behavior. For Drive it returns the verified revision stream with its verified Content-Type/Length and an encoded original filename in Content-Disposition. Add `?download=1` for a Drive attachment; default is inline preview. Original revision bytes remain pinned; Range seeking and physical mobile playback/download require live validation. Lifecycle cleanup deletes only the referenced app-created Drive file; if the account is disconnected or permissions are unavailable the job remains pending for the existing owner-authorized cleanup retry.

Implementation references: [Google resumable uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads), [binary revision retention/download](https://developers.google.com/workspace/drive/api/guides/manage-revisions), [server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server).


## Storage selection — feat-031 (2026-09-17)

### `GET /api/v1/storage-providers`

Requires the application session (401 otherwise), returns `Cache-Control: no-store`, and exposes only selectability and connection state:

```json
{
  "data": {
    "s3": { "available": true },
    "google_drive": { "available": true, "configured": true, "state": "connected" }
  }
}
```

B2 availability means server configuration is present; it is not a live bucket/quota probe. Drive is configured only when its configuration, service and repository exist; its existing connection probe returns `connected`, `disconnected`, `reauthorization_required` or `unavailable`. Only `connected` makes Drive selectable. Missing Google configuration gives configured=false, available=false, state=unavailable. Availability is a snapshot, not a guarantee of quota or future transfer success. Creation/upload still enforce provider access and report existing errors.

The browser refreshes on mount, window focus, explicit refresh and unlink. Untouched new forms prefer Drive then B2; an explicit choice survives refresh even if unavailable (creation is disabled until recovery or a deliberate alternate choice). Loading/failed availability checks prevent creation while preserving local fields/files. Creation freezes the provider; retries keep the same activity and assets. Starting another record clears the finished form and recalculates the default. Connection management from the form requires confirmation before OAuth navigation warns that unsaved fields/files may be lost; cancellation preserves the form. Browser history filtering includes both providers.


### Browser CORS for API uploads and lifecycle mutations

The application API permits GET, HEAD, POST, PUT, PATCH, DELETE and OPTIONS from the configured `CORS_ORIGIN`, with credentials enabled. Drive uploads require PUT preflight with Content-Type allowed; a 204 OPTIONS alone does not prove the requested method is permitted. Origin checks and owner authentication remain enforced on the actual mutation. Direct B2 uploads continue to use bucket CORS separately. Browser transfer network failures use the client-side `UPLOAD_NETWORK_ERROR` code and strategy-specific VI/EN guidance; this is not a server error-envelope change.
