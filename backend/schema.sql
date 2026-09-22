-- wrangler d1 execute rangerhawk --file=schema.sql
CREATE TABLE IF NOT EXISTS users   (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS codes   (email TEXT NOT NULL, code TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS tokens  (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, device TEXT, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS plans   (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, plan TEXT NOT NULL, back_by INTEGER NOT NULL,
                                    contact_email TEXT, contact_phone TEXT, safe INTEGER DEFAULT 0, alerted INTEGER DEFAULT 0, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS photos  (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, site TEXT NOT NULL, taken TEXT, tag TEXT, n INTEGER,
                                    bytes INTEGER, created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS plans_due ON plans (safe, alerted, back_by);
CREATE INDEX IF NOT EXISTS photos_user ON photos (user_id, site);
