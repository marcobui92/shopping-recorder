CREATE TABLE google_drive_oauth_states (
  state_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  code_verifier text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX google_drive_oauth_states_expiry_idx ON google_drive_oauth_states (expires_at);
