# Recorder Operations Runbook

## Release status

The application has provider-neutral container packaging, health probes, structured request logs, graceful shutdown, validated production configuration, and tested PostgreSQL/B2 failure behavior. A production release remains blocked until the owner records:

1. the deployment target, TLS/ingress topology, replica count, and secret manager;
2. either an operational malware scanner with positive-detection and outage behavior, or explicit acceptance of the unscanned-media risk; and
3. database backup retention and recovery objectives suitable for the evidence being stored.

Google Drive is deferred and legacy shopping endpoints remain supported. Neither is part of this release-readiness work.

## Build and configuration

Build each deployable root independently from the repository root:

```bash
docker build -t shopping-recorder-backend ./backend
docker build --build-arg VITE_API_BASE_URL=https://api.example.com/api/v1 -t shopping-recorder-web ./web
```

The web API URL is compiled into the static bundle and must use the public HTTPS API origin. In production the backend fails at startup unless `DATABASE_URL`, all four required `B2_*` credentials/settings, and an HTTPS `CORS_ORIGIN` are present. Set `TRUST_PROXY=true` only behind a trusted proxy that overwrites client forwarding headers; otherwise leave it false so rate limits cannot be bypassed with spoofed headers.

Run migrations as a single pre-deployment job before starting new application replicas:

```bash
npm run migrate --prefix backend
```

Never run competing migration jobs. Applied migration checksums are immutable. Roll back application containers independently; do not edit or reverse an applied migration without a separately reviewed recovery plan.

## Health, shutdown, and observability

- `GET /api/v1/health` is liveness only. Restart a process that stops answering it.
- `GET /api/v1/health/ready` checks production dependencies and PostgreSQL. Remove an instance from traffic whenever it returns `503`.
- Every response returns `X-Request-Id`. Fastify writes structured request/response logs containing the same ID; preserve it through the ingress and log collector.
- `SIGTERM` and `SIGINT` stop new work, close Fastify, and drain the PostgreSQL pool. The deployment platform's termination grace period must exceed its longest accepted API request.

At minimum, alert on sustained readiness failures, elevated `5xx` or `429` rates, authentication bursts, finalize/provider failures, and pending cleanup growth. Never log cookies, passwords, B2 keys, presigned URLs, provider object references, or request bodies containing them.

Useful database checks:

```sql
SELECT status, count(*) FROM recorder_activities GROUP BY status ORDER BY status;
SELECT status, count(*), coalesce(sum(verified_size_bytes), 0) AS verified_bytes
FROM media_assets GROUP BY status ORDER BY status;
SELECT count(*) AS pending_cleanup, min(created_at) AS oldest_pending
FROM media_cleanup_jobs WHERE status = 'pending';
SELECT failure_code, count(*) FROM media_upload_attempts
WHERE status = 'failed' GROUP BY failure_code ORDER BY count(*) DESC;
```

Treat a growing or old pending-cleanup count as both a cost and privacy incident. Investigate B2 availability/credentials, then use the owner-authorized cleanup retry flow; never perform bucket-wide deletion.

## Storage cost and retention

`B2_MAX_IMAGE_BYTES` and `B2_MAX_VIDEO_BYTES` cap individual objects, while upload capability lifetimes limit abandoned PUT exposure. Review the verified-byte query above alongside B2 billed bytes, request counts, and lifecycle/version totals.

Stored evidence expires 30 days after an activity is completed. The backend runs a retention sweep at startup and hourly: it first commits the owner-visible `expired` state and audit event, then deletes the exact B2 version or Drive file through tracked cleanup jobs. Metadata, filenames, checksums and audit history remain in PostgreSQL. Provider failures leave cleanup pending for the next sweep or an authorized retry and never restore content access. Alert when completed rows remain past `evidence_expires_at` or pending cleanup grows old. Do not add an independent bucket/Drive lifecycle rule because it would bypass application state and audit handling.

## PostgreSQL backup and recovery

Use encrypted, access-controlled provider snapshots plus periodic logical backups. Do not place dumps in the web image, application logs, or the B2 evidence bucket. A representative logical backup and restore validation is:

```bash
pg_dump --format=custom --no-owner --file=shopping-recorder.dump "$DATABASE_URL"
createdb shopping_recorder_restore_test
pg_restore --exit-on-error --no-owner --dbname=shopping_recorder_restore_test shopping-recorder.dump
```

Run a restore drill on a schedule and record duration, row counts, migration checksums, and owner-scoped media retrieval checks. Restore PostgreSQL before reopening traffic, confirm that every ready asset still resolves its exact B2 version, and keep the service unready if referential checks fail. The deployment owner must set concrete RPO/RTO and backup retention before release.

## Provider outage procedure

1. Confirm PostgreSQL readiness separately from B2 failures using request IDs and stable error codes.
2. Keep metadata/history available, but do not mark unverified media ready or issue misleading completion success.
3. Preserve failed assets and pending cleanup jobs for bounded retry. Do not rotate bucket keys during a transient outage unless compromise is suspected.
4. After recovery, test one disposable upload/finalize/retrieve/exact-version cleanup cycle, then retry pending user-authorized work.
5. For suspected credential exposure, revoke the B2 application key, issue a least-privilege replacement through the secret manager, restart instances, and review access logs. Never paste the key into the incident record.

## Release gate

Run the complete gate in `docs/TESTING.md`, build both container images, start them with production-shaped configuration, and verify liveness/readiness plus one disposable browser workflow. Record image digests and verification evidence in `progress.md`. A failed or undecided malware-scanning gate, backup restore drill, TLS/cookie check, shared rate-limit design for multiple replicas, or deployment target keeps the release blocked.
