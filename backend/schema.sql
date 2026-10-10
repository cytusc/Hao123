CREATE TABLE IF NOT EXISTS categories (
 id text PRIMARY KEY, name text NOT NULL, icon text NOT NULL DEFAULT 'Grid2X2', sort integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sites (
 id text PRIMARY KEY, name text NOT NULL, url text NOT NULL, domain text NOT NULL,
 category_id text NOT NULL REFERENCES categories(id), mark text NOT NULL, color text NOT NULL DEFAULT '#5577ba',
 description text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'approved' CHECK(status IN ('approved','disabled')),
 sort integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sites_category_idx ON sites(category_id,sort);
CREATE UNIQUE INDEX IF NOT EXISTS sites_url_idx ON sites(url);
CREATE TABLE IF NOT EXISTS users (
 id text PRIMARY KEY, email text UNIQUE NOT NULL, name text NOT NULL, password_hash text NOT NULL,
 role text NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin')), disabled boolean NOT NULL DEFAULT false,
 preferences jsonb NOT NULL DEFAULT '{"pinned":[],"hidden":[],"custom":[],"personalized":true,"largeText":false,"showSearch":true,"engine":"baidu"}',
 created_at timestamptz NOT NULL DEFAULT now()
);
-- Additive, idempotent migration; initialize runs this under an advisory lock in one transaction.
ALTER TABLE users ADD COLUMN IF NOT EXISTS verified boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS prefs_version bigint NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS email_tokens (
 token_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 purpose text NOT NULL CHECK(purpose IN ('verify','reset')), expires_at timestamptz NOT NULL,
 used boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS email_tokens_user_idx ON email_tokens(user_id,purpose);
CREATE INDEX IF NOT EXISTS email_tokens_expiry_idx ON email_tokens(expires_at);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS user_site_stats (
 user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE, site_id text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
 clicks bigint NOT NULL DEFAULT 1, score double precision NOT NULL DEFAULT 1, last_clicked timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,site_id)
);
CREATE INDEX IF NOT EXISTS stats_site_idx ON user_site_stats(site_id);
CREATE TABLE IF NOT EXISTS submissions (
 id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id), name text NOT NULL, url text NOT NULL,
 category_id text NOT NULL REFERENCES categories(id), description text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 note text NOT NULL DEFAULT '', reviewer_id text REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz
);
CREATE INDEX IF NOT EXISTS submissions_user_idx ON submissions(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS app_meta(key text PRIMARY KEY, value text NOT NULL);
