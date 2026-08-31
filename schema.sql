-- Run once with: npx wrangler d1 execute edgedress-cache --remote --file=schema.sql
CREATE TABLE IF NOT EXISTS image_cache (
  cache_key TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  source_url TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS image_cache_session_idx ON image_cache(session_id);