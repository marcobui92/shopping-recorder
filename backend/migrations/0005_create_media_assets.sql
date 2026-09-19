CREATE TABLE media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL,
  storage_provider varchar(16) NOT NULL CHECK (storage_provider IN ('s3', 'google_drive')),
  ordinal integer NOT NULL CHECK (ordinal > 0),
  media_type varchar(16) NOT NULL CHECK (media_type IN ('image', 'video')),
  status varchar(24) NOT NULL DEFAULT 'pending_upload'
    CHECK (status IN ('pending_upload', 'verifying', 'ready', 'failed')),
  original_filename varchar(255) NOT NULL CHECK (char_length(trim(original_filename)) BETWEEN 1 AND 255),
  declared_content_type varchar(127) NOT NULL CHECK (char_length(trim(declared_content_type)) BETWEEN 1 AND 127),
  verified_content_type varchar(127),
  expected_size_bytes bigint NOT NULL CHECK (expected_size_bytes > 0),
  verified_size_bytes bigint CHECK (verified_size_bytes > 0),
  expected_sha256 char(64) NOT NULL CHECK (expected_sha256 ~ '^[0-9a-f]{64}$'),
  verified_sha256 char(64) CHECK (verified_sha256 IS NULL OR verified_sha256 ~ '^[0-9a-f]{64}$'),
  provider_object_ref text,
  provider_version_ref text,
  ready_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (activity_id, storage_provider)
    REFERENCES recorder_activities(id, storage_provider) ON DELETE RESTRICT,
  UNIQUE (activity_id, ordinal),
  CHECK (
    (status = 'ready'
      AND verified_content_type IS NOT NULL
      AND verified_size_bytes IS NOT NULL
      AND verified_sha256 IS NOT NULL
      AND provider_object_ref IS NOT NULL
      AND ready_at IS NOT NULL)
    OR
    (status <> 'ready' AND ready_at IS NULL)
  )
);

CREATE UNIQUE INDEX media_assets_provider_object_idx
  ON media_assets (storage_provider, provider_object_ref)
  WHERE provider_object_ref IS NOT NULL;
CREATE INDEX media_assets_activity_order_idx ON media_assets (activity_id, ordinal, id);

CREATE TABLE media_upload_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES media_assets(id) ON DELETE RESTRICT,
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  status varchar(24) NOT NULL DEFAULT 'issued'
    CHECK (status IN ('issued', 'finalizing', 'succeeded', 'failed', 'expired')),
  provider_upload_ref text,
  expires_at timestamptz NOT NULL,
  failure_code varchar(64),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id, attempt_number),
  CHECK (expires_at > created_at),
  CHECK ((status = 'failed' AND failure_code IS NOT NULL) OR status <> 'failed')
);

CREATE UNIQUE INDEX media_upload_attempts_active_idx ON media_upload_attempts (asset_id)
  WHERE status IN ('issued', 'finalizing');
CREATE INDEX media_upload_attempts_expiry_idx ON media_upload_attempts (expires_at)
  WHERE status = 'issued';
