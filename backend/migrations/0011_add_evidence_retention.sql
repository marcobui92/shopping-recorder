ALTER TABLE recorder_activities DROP CONSTRAINT recorder_activities_status_check;
ALTER TABLE recorder_activities DROP CONSTRAINT recorder_activities_lifecycle_check;

ALTER TABLE recorder_activities
  ADD COLUMN evidence_expires_at timestamptz,
  ADD COLUMN expired_at timestamptz;

UPDATE recorder_activities
SET evidence_expires_at = completed_at + interval '30 days'
WHERE completed_at IS NOT NULL;

ALTER TABLE recorder_activities
  ADD CONSTRAINT recorder_activities_status_check
    CHECK (status IN ('draft', 'uploading', 'complete', 'expired', 'cancelled', 'deleted')),
  ADD CONSTRAINT recorder_activities_lifecycle_check CHECK (
    (status IN ('draft', 'uploading') AND completed_at IS NULL AND evidence_expires_at IS NULL AND expired_at IS NULL AND cancelled_at IS NULL AND deleted_at IS NULL)
    OR (status = 'complete' AND completed_at IS NOT NULL AND evidence_expires_at IS NOT NULL AND expired_at IS NULL AND cancelled_at IS NULL AND deleted_at IS NULL)
    OR (status = 'expired' AND completed_at IS NOT NULL AND evidence_expires_at IS NOT NULL AND expired_at IS NOT NULL AND cancelled_at IS NULL AND deleted_at IS NULL)
    OR (status = 'cancelled' AND completed_at IS NULL AND evidence_expires_at IS NULL AND expired_at IS NULL AND cancelled_at IS NOT NULL AND deleted_at IS NULL)
    OR (status = 'deleted' AND deleted_at IS NOT NULL)
  );

ALTER TABLE recorder_activity_audit_events DROP CONSTRAINT recorder_activity_audit_events_action_check;
ALTER TABLE recorder_activity_audit_events
  ADD CONSTRAINT recorder_activity_audit_events_action_check
    CHECK (action IN ('metadata_updated', 'cancelled', 'deleted', 'expired', 'cleanup_retried'));

CREATE INDEX recorder_activities_retention_due_idx
  ON recorder_activities (evidence_expires_at, id)
  WHERE status = 'complete';
