CREATE TABLE google_drive_connections (
  user_id uuid PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  provider_account_id text NOT NULL,
  encrypted_refresh_token text NOT NULL,
  refresh_token_iv text NOT NULL,
  refresh_token_tag text NOT NULL,
  encryption_key_version integer NOT NULL DEFAULT 1 CHECK (encryption_key_version > 0),
  root_folder_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_account_id)
);

CREATE INDEX google_drive_connections_updated_idx ON google_drive_connections (updated_at DESC);
