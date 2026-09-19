-- The backend consumes each Drive transfer once; finalization remains a separate transition.
ALTER TABLE media_upload_attempts ADD COLUMN drive_transfer_started_at timestamptz;
