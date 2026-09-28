ALTER TABLE app_users
  ADD COLUMN retention_days integer NOT NULL DEFAULT 30,
  ADD CONSTRAINT app_users_retention_days_check CHECK (retention_days BETWEEN 1 AND 3650);
