ALTER TABLE media_assets ADD COLUMN discarded_at timestamptz;

CREATE INDEX media_assets_activity_active_idx
  ON media_assets (activity_id, ordinal, id)
  WHERE discarded_at IS NULL;
