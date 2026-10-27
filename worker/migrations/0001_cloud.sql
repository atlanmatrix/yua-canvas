PRAGMA foreign_keys = ON;
CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, owner_id TEXT NOT NULL, name TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE canvases (owner_id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 0, version_id TEXT, updated_at INTEGER NOT NULL);
CREATE TABLE versions (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, object_key TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX versions_owner ON versions(owner_id);
CREATE TABLE assets (owner_id TEXT NOT NULL, id TEXT NOT NULL, size INTEGER NOT NULL, PRIMARY KEY(owner_id,id));
CREATE TABLE shares (id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, owner_id TEXT NOT NULL, version_id TEXT NOT NULL REFERENCES versions(id), expires_at INTEGER, revoked_at INTEGER, created_at INTEGER NOT NULL);
CREATE INDEX shares_owner ON shares(owner_id);
