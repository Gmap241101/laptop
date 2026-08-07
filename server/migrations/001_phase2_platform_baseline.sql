CREATE TABLE app_runtime_metadata (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT app_runtime_metadata_key_length CHECK (char_length(key) BETWEEN 1 AND 100)
);

INSERT INTO app_runtime_metadata (key, value)
VALUES (
  'platform_baseline',
  '{"phase":2,"backend":"node","database":"postgresql","auth":"firebase-current-clerk-next"}'::jsonb
);
