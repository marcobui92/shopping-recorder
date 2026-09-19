ALTER TABLE recorder_activities DROP CONSTRAINT recorder_activities_status_check;
ALTER TABLE recorder_activities DROP CONSTRAINT recorder_activities_check;

ALTER TABLE recorder_activities
  ADD COLUMN cancelled_at timestamptz,
  ADD COLUMN deleted_at timestamptz,
  ADD CONSTRAINT recorder_activities_status_check
    CHECK (status IN ('draft', 'uploading', 'complete', 'cancelled', 'deleted')),
  ADD CONSTRAINT recorder_activities_lifecycle_check CHECK (
    (status IN ('draft', 'uploading') AND completed_at IS NULL AND cancelled_at IS NULL AND deleted_at IS NULL)
    OR (status = 'complete' AND completed_at IS NOT NULL AND cancelled_at IS NULL AND deleted_at IS NULL)
    OR (status = 'cancelled' AND completed_at IS NULL AND cancelled_at IS NOT NULL AND deleted_at IS NULL)
    OR (status = 'deleted' AND deleted_at IS NOT NULL)
  );

CREATE TABLE recorder_activity_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES recorder_activities(id) ON DELETE RESTRICT,
  owner_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  action varchar(32) NOT NULL CHECK (action IN ('metadata_updated', 'cancelled', 'deleted', 'cleanup_retried')),
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX recorder_activity_audit_owner_idx
  ON recorder_activity_audit_events (owner_user_id, activity_id, created_at, id);

CREATE TABLE media_cleanup_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES recorder_activities(id) ON DELETE RESTRICT,
  asset_id uuid NOT NULL REFERENCES media_assets(id) ON DELETE RESTRICT,
  storage_provider varchar(16) NOT NULL CHECK (storage_provider IN ('s3', 'google_drive')),
  provider_object_ref text NOT NULL,
  provider_version_ref text,
  status varchar(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error_code varchar(64),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (activity_id, asset_id)
);

CREATE INDEX media_cleanup_jobs_pending_idx ON media_cleanup_jobs (activity_id, status) WHERE status = 'pending';
