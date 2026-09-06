-- Google sign-in, and proving an applicant controls the email they applied with.
--
-- The rule that shapes all of this: signing in with Google must never create a
-- counsellor account or skip admin approval. Google can prove who someone is;
-- it cannot vouch that they are a qualified clinician. So Google is only ever
-- an alternative way to authenticate INTO an account an admin already
-- approved, never a way to obtain one.


-- ---------------------------------------------------------------------------
-- 1. Google account linking
-- ---------------------------------------------------------------------------

-- Google's stable subject identifier for the account ("sub" in the ID token).
--
-- Stored rather than matching on email alone, because email is not a safe
-- long-term key: Google Workspace addresses get reassigned when staff leave,
-- and matching purely on the string would hand the new holder of an old
-- address someone else's clinical account. The sub is immutable per Google
-- account, so once linked it is checked on every subsequent sign-in.
ALTER TABLE users ADD COLUMN google_sub VARCHAR(255);

-- Partial unique index: one Google identity may back at most one account, but
-- the many accounts that have never used Google stay NULL rather than
-- colliding with each other on an empty string.
CREATE UNIQUE INDEX idx_users_google_sub
  ON users(google_sub) WHERE google_sub IS NOT NULL;

ALTER TABLE users ADD COLUMN google_linked_at TIMESTAMP;


-- ---------------------------------------------------------------------------
-- 2. Email verification
-- ---------------------------------------------------------------------------

ALTER TABLE users ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN email_verified_at TIMESTAMP;

-- Existing accounts are backfilled as verified. They exist only because an
-- administrator read their application and approved it, which is a stronger
-- check than a mailbox round-trip — and flipping them to unverified would
-- raise a warning on every screen for people who did nothing wrong.
UPDATE users SET email_verified = TRUE, email_verified_at = created_at;

-- Verification attaches to the APPLICATION, not just the account, because the
-- point is to catch a typo'd or fake address BEFORE an admin spends time
-- reviewing documents attached to an address that does not exist. It carries
-- over to the user row on approval.
ALTER TABLE counselor_applications ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE counselor_applications ADD COLUMN email_verified_at TIMESTAMP;

-- Applications already reviewed are left alone: re-litigating a decision an
-- admin already made would be noise, not safety.
UPDATE counselor_applications SET email_verified = TRUE, email_verified_at = submitted_at
  WHERE status <> 'PENDING';

-- Tokens are stored HASHED, exactly as password-reset tokens are: a leaked
-- database dump must not hand out working verification links.
CREATE TABLE email_verification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Exactly one of these is set. A token issued during application has no user
  -- row yet (accounts are only created on approval); a token issued for an
  -- email change belongs to an existing account.
  application_id UUID REFERENCES counselor_applications(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,

  -- The address being proved. Held separately from the application/user row so
  -- an email-change flow can verify the NEW address before it replaces the old
  -- one — otherwise a typo locks the account out of its own recovery path.
  email VARCHAR(255) NOT NULL,

  token_hash VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT now(),

  CONSTRAINT email_verification_target CHECK (
    (application_id IS NOT NULL AND user_id IS NULL)
    OR (application_id IS NULL AND user_id IS NOT NULL)
  )
);

CREATE INDEX idx_email_verification_application ON email_verification_tokens(application_id);
CREATE INDEX idx_email_verification_user ON email_verification_tokens(user_id);
CREATE INDEX idx_email_verification_expires ON email_verification_tokens(expires_at);
