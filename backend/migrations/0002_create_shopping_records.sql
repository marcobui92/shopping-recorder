CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE shopping_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  description varchar(160) NOT NULL CHECK (char_length(trim(description)) > 0),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  purchased_on date NOT NULL,
  notes text,
  category varchar(80),
  store_name varchar(160),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX shopping_records_purchased_on_idx ON shopping_records (purchased_on DESC, id DESC);
