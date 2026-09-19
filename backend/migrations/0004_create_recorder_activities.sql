CREATE TABLE recorder_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  operation_type varchar(16) NOT NULL CHECK (operation_type IN ('packing', 'unpacking')),
  status varchar(16) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'uploading', 'complete')),
  storage_provider varchar(16) NOT NULL CHECK (storage_provider IN ('s3', 'google_drive')),
  reference varchar(160) CHECK (reference IS NULL OR char_length(trim(reference)) BETWEEN 1 AND 160),
  notes text CHECK (notes IS NULL OR char_length(notes) BETWEEN 1 AND 2000),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, storage_provider),
  CHECK ((status = 'complete' AND completed_at IS NOT NULL) OR (status <> 'complete' AND completed_at IS NULL))
);

CREATE INDEX recorder_activities_owner_history_idx
  ON recorder_activities (owner_user_id, occurred_at DESC, id DESC);
CREATE INDEX recorder_activities_owner_status_idx
  ON recorder_activities (owner_user_id, status, occurred_at DESC, id DESC);
