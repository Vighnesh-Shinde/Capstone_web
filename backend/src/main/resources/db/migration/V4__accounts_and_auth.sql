-- Account lifecycle: usernames, suspension, and self-service password reset.
--
-- Username is nullable and unique: admins sign in with a username, while
-- counselors keep signing in with the email their approved application was
-- keyed on. Login accepts either (see AuthService.login).
ALTER TABLE users ADD COLUMN username VARCHAR(50);
CREATE UNIQUE INDEX idx_users_username ON users(LOWER(username));

-- ACTIVE / SUSPENDED. Distinct from counselor_applications.status: that gates
-- whether an account may be created at all, this gates an existing account.
-- An admin has no application, so suspension is the only lever over them.
ALTER TABLE users ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE';

ALTER TABLE users ADD COLUMN last_login_at TIMESTAMP;
ALTER TABLE users ADD COLUMN password_changed_at TIMESTAMP;

-- Reset tokens are stored HASHED, never in plaintext: a leaked database dump
-- must not hand out working password-reset links.
CREATE TABLE password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
CREATE INDEX idx_password_reset_tokens_expires_at ON password_reset_tokens(expires_at);
