-- Counsellor settings: notification preferences and a safe email change.

-- ---------------------------------------------------------------------------
-- 1. Notification preferences
-- ---------------------------------------------------------------------------
--
-- Typed columns rather than a JSONB blob. There are five of them, they are
-- read and written as a set, and a column per preference means a typo in a key
-- name is a compile error instead of a silently-ignored setting.
--
-- All default TRUE except the last: a counsellor who has just been given an
-- account should hear about the things that need their attention without
-- having to go and enable them. Report-generated is off because it fires for
-- every single session and would train people to ignore the rest.
ALTER TABLE users ADD COLUMN notify_analysis_complete BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN notify_analysis_failed BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN notify_needs_review BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN notify_assessment_differs BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN notify_report_generated BOOLEAN NOT NULL DEFAULT FALSE;


-- ---------------------------------------------------------------------------
-- 2. Pending email change
-- ---------------------------------------------------------------------------
--
-- A new address is parked here and only replaces `email` once the owner proves
-- they can receive mail at it. Writing it straight into `email` would mean a
-- single typo locks the account out of its own password-reset path — the one
-- recovery route that depends on the address being correct.
--
-- Not UNIQUE: two people may both have a pending change to the same address,
-- and only whoever confirms first can have it. Uniqueness is enforced against
-- `email` at the moment of the swap, which is the only point it matters.
ALTER TABLE users ADD COLUMN pending_email VARCHAR(255);
ALTER TABLE users ADD COLUMN pending_email_requested_at TIMESTAMP;
