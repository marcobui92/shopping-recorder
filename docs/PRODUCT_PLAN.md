# Product Delivery Plan

## Purpose

Shopping Recorder is an evidence-recording product for warehouse operations. Its core job is to let a user create a record for an **unpacking** or **packing** activity, capture or select photos and videos as evidence, and retain those media files in a storage location the user has authorized.

The supported storage targets are:

- Amazon S3-compatible object storage.
- A user's Google Drive after that user has linked a Google account and granted the required permission.

This replaces the earlier shopping-expense-tracker product direction. Its legacy UI, API, application code, and empty local table were fully retired with explicit user approval in `feat-019`.

## First Releasable Workflow

1. A signed-in user starts a packing or unpacking record.
2. They add one or more image or video files, with a clear upload state for every file.
3. The first release stores evidence in configured S3-compatible storage. Google Drive is a later optional storage choice available only after a successful account link.
4. The system stores media safely, records immutable asset metadata and its storage reference, and shows the completed record with playable/viewable evidence.
5. The owner can find and review records, correct audited metadata, cancel unfinished work, and delete completed evidence with immediate access revocation and retryable provider cleanup. The MVP does not expire evidence automatically.

## Product Boundaries


- This product records operational evidence; it is not an expense tracker, inventory-counting system, marketplace, or automatic video-analysis service.
- A media file must be associated with a recorder activity before it is considered completed evidence.
- The application stores metadata and an opaque provider reference; it must not expose provider credentials or long-lived public media URLs to the browser.
- Users authenticate with an application username and password. After signing in, they may optionally link one Google account for Drive storage; Google is not a login provider.

## Accepted Identity, Session, and Storage Direction

- Application username and password are the primary and only login method for the recorder MVP.
- Users may self-register an application account with a username and password; administrator provisioning or approval is not required for account creation in the MVP.
- Email is optional at registration. Only an account with an email on file is eligible for self-service password reset; an account without email has no self-service recovery path.
- Passwords must be hashed with Argon2id. Registration, login, and password-reset requests are rate-limited, and recovery responses must not reveal whether an account exists.
- Login uses a server-managed session referenced by a persistent browser cookie. Closing and reopening the browser preserves login. The session has a sliding 30-day inactivity expiry and a 90-day absolute lifetime; logout, password reset, or backend revocation may end it earlier.
- Google authorization is optional and is used only to connect Google Drive storage.
- A user must already have an authenticated application account before starting, replacing, or revoking a Google Drive connection.
- Each application user may connect at most one Google account. The integration requests only the Drive `drive.file` scope through a server-side authorization-code flow with offline access.
- Google Drive uses one visible app-managed `Shopping Recorder` folder with activity-specific children. The MVP does not support selecting an arbitrary Drive folder.
- A user chooses S3 or a linked Google Drive for each activity; all assets in one activity use that one provider.
- Private Backblaze B2 and optionally linked Google Drive are implemented. A valid available Drive connection is the default for new activities, with configured B2 still selectable. Each activity keeps one provider; failures do not trigger automatic switching and existing records never migrate automatically.
- The internal application user ID owns each activity and its media. Only the owner has access in the MVP.
- Unlinking Google revokes and removes the stored credential but does not delete files from the user's Drive.
- Linking or unlinking Google does not create, merge, authenticate, or delete the application account.

## Decisions Deferred to Owning Features

The identity and Google-account-linking decisions required by `feat-010` are complete. The following media lifecycle policies remain deliberately deferred to their owning implementation features:

- File type/size/signature verification and upload-abuse coverage are implemented; lifecycle retention/deletion/audit rules were approved for `feat-016` on 2026-09-13. No malware engine is configured. Selecting or explicitly waiving one is a production release decision for `feat-018`, alongside duration/privacy operations.

## Delivery Sequence

1. **Recorder scope correction and contract reset (`feat-009`)** — Document the corrected product goal, boundaries, storage choices, legacy API status, and unresolved decisions. No product code changes.
2. **Identity and Google-account-linking decisions (`feat-010`)** — Decide and document the login model, Google OAuth consent scope, token handling, account-link lifecycle, and ownership rules before implementation.
3. **Recorder data model and API contract (`feat-011`)** — Specify activity records, media assets, ownership, lifecycle states, and API schemas; plan a versioned migration without removing legacy endpoints.
4. **S3 media-storage foundation (`feat-012`)** — Add the server-side storage abstraction and secure S3 upload/finalization flow with provider-neutral metadata.
5. **Create packing/unpacking records (`feat-014`)** — Build the S3-backed browser workflow to create an activity and capture/select image and video evidence with robust progress and retry states.
6. **Google Drive connection and storage adapter (`feat-013`, completed)** — Add Google account linking, encrypted credential handling, Drive folder policy, and the Drive upload/finalization flow. The 2026-09-15 next-delivery plan below places this after the phone-first experience; it did not block the completed S3 core.
7. **Review and retrieve recorder evidence (`feat-015`)** — Provide paginated activity history, filters, detail playback/preview, and provider-safe media retrieval.
8. **Record correction and lifecycle controls (`feat-016`)** — Define and implement permitted metadata edits, cancellation/retry handling, and explicitly approved deletion/retention behavior.
9. **Quality, security, and regression coverage (`feat-017`)** — Add focused web, backend, integration, authorization, upload-abuse, and accessibility coverage.
10. **Production readiness and release documentation (`feat-018`)** — Complete observability, storage cost/retention controls, backup/recovery, deployment, and operational runbooks.
11. **Legacy shopping-scope retirement (`feat-019`)** — Complete removal approved: remove the retired shopping-record API/UI/application code and drop the inventoried-empty table through versioned migration `0008`.

## Next Delivery Plan — 2026-09-15

The user primarily works on a phone and approved Vietnamese as the main UI language, with English switching. The current request authorizes documentation and feature breakdown only. No implementation feature is activated by this plan.

Detailed scope, acceptance criteria, provider-state behavior, and verification are in [the mobile, localization, and Drive plan](MOBILE_LOCALIZATION_DRIVE_PLAN.md).

| Group | Features | Planned result |
| --- | --- | --- |
| Documentation | feat-026 | Consolidated decisions, feature breakdown and handoff |
| Phone experience first | feat-027, feat-028, feat-029, feat-030 | Vietnamese-default UI, responsive workspace, additive capture/selection, full viewer and original downloads |
| Google Drive next | feat-013, feat-031 | Account connection/storage adapter, then visible provider choice with Drive preferred when connected and available |
| Additional backlog | feat-032, feat-033, feat-034 | Reference search, manual packing/unpacking comparison, recovery of server-created unfinished activities |

The phone-before-Drive grouping is accepted. Ordering within that group and the additional backlog is a proposed implementation sequence, not a delivery commitment. Vietnamese-first localization is proposed first so subsequent screens use the translation structure. Only a browser-local language preference is planned initially; user content, references, filenames, API values and stored timestamps are preserved.

`feat-018` remains explicitly blocked/deferred for production decisions. Planning new features does not resume it, select a deployment target, enable Google login, or authorize external OAuth configuration in this session.

## Planning Constraints

- Complete one feature at a time and respect the dependencies in `feature_list.json`.
- Do not start provider integrations until `feat-010` has an accepted identity and Google-account-linking decision.
- Contract changes must update the browser client, backend, documentation, and relevant tests together when implementation begins.
- Feature evidence is required before a feature is marked done.
