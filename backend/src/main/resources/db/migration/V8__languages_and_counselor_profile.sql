-- Two changes that both come from the same goal: making this deployable
-- outside one English-speaking clinic in one country.
--
--   1. Sessions carry a language, and models are registered per language.
--   2. Counselors have a real professional identity record, not five free-text
--      boxes, so an administrator in any country can actually verify them.


-- ---------------------------------------------------------------------------
-- 1. Session language
-- ---------------------------------------------------------------------------

-- BCP-47 / ISO 639-1, the codes Whisper expects ('en', 'hi', 'mr'). Stored on
-- the session and not derived at analysis time: the counselor's answer is more
-- reliable than Whisper's 30-second auto-detect, code-switched speech makes
-- detection non-deterministic, and a report must stay reproducible.
--
-- Existing rows are English by definition — English models are all that has
-- ever been installed, so nothing else could have been scored.
ALTER TABLE sessions ADD COLUMN language VARCHAR(10) NOT NULL DEFAULT 'en';

CREATE INDEX idx_sessions_language ON sessions(language);


-- ---------------------------------------------------------------------------
-- 2. Model weights are per language
-- ---------------------------------------------------------------------------

-- The whole point of the upload/activate flow was that retraining should not
-- need a redeploy. Training a Marathi model set is the same act as retraining
-- the English one, so it goes through the same door: upload three files
-- tagged 'mr', activate them, and Marathi becomes scorable.
ALTER TABLE model_versions ADD COLUMN language VARCHAR(10) NOT NULL DEFAULT 'en';

-- The old constraint allowed one active model per modality across the whole
-- platform, which would have made activating a Marathi text model silently
-- deactivate the English one. Uniqueness is per (modality, language) now.
DROP INDEX IF EXISTS idx_model_versions_one_active_per_modality;

CREATE UNIQUE INDEX idx_model_versions_one_active_per_modality_language
  ON model_versions(modality, language) WHERE is_active;

DROP INDEX IF EXISTS idx_model_versions_modality;
CREATE INDEX idx_model_versions_modality
  ON model_versions(language, modality, uploaded_at DESC);


-- ---------------------------------------------------------------------------
-- 3. Professional identity for counselors
-- ---------------------------------------------------------------------------
--
-- These columns are added to BOTH counselor_applications and users. The
-- application row is what the applicant submitted and what the administrator
-- judged; the user row is the live profile the counselor maintains afterwards.
-- Keeping them separate means editing your address later never rewrites the
-- record of what was actually approved.
--
-- Everything except country is nullable. A hard NOT NULL would lock out every
-- existing account and force fake data into a record whose entire purpose is
-- being accurate.

-- Country is ISO 3166-1 alpha-2 ('IN', 'GB', 'KE'). It is the field the rest
-- hangs off: which regulator is plausible, which crisis numbers to show, which
-- privacy regime applies, and how to read the phone number. Validated in Java
-- against Locale.getISOCountries() rather than a hand-maintained list here.
ALTER TABLE counselor_applications ADD COLUMN country_code VARCHAR(2);

-- Phone is split rather than stored as one string. '+91 98765 43210' and
-- '09876543210' are the same number written by two people; only the split form
-- can be normalised, compared, or dialled from another country. phone_e164 is
-- the canonical join key, derived on write.
ALTER TABLE counselor_applications ADD COLUMN phone_dial_code VARCHAR(6);
ALTER TABLE counselor_applications ADD COLUMN phone_national VARCHAR(20);
ALTER TABLE counselor_applications ADD COLUMN phone_e164 VARCHAR(20);

ALTER TABLE counselor_applications ADD COLUMN address_line1 VARCHAR(255);
ALTER TABLE counselor_applications ADD COLUMN address_line2 VARCHAR(255);
ALTER TABLE counselor_applications ADD COLUMN city VARCHAR(120);
-- 'state_region', not 'state': a US state, an Indian state, a UK county and a
-- Kenyan county are the same slot in an address and different words for it.
ALTER TABLE counselor_applications ADD COLUMN state_region VARCHAR(120);
ALTER TABLE counselor_applications ADD COLUMN postal_code VARCHAR(20);

-- Free text, not an enum, and never required. Some clients specifically ask to
-- see a counselor of a particular gender, which makes this a genuine directory
-- field — but an enum would force people into boxes that do not fit, and
-- requiring it would gate professional access on a personal disclosure.
ALTER TABLE counselor_applications ADD COLUMN gender VARCHAR(50);

-- Date of birth rather than an age integer: an age is wrong within a year of
-- being entered and there is no way to tell when it was entered. Optional,
-- because a counselor's age is rarely anyone's business — where it does matter
-- (minimum age for a licence) the licence itself is the evidence.
ALTER TABLE counselor_applications ADD COLUMN date_of_birth DATE;

-- IANA zone id ('Asia/Kolkata'). Without this every timestamp on every report
-- renders in server time, which is silently wrong for everyone not sitting
-- next to the server.
ALTER TABLE counselor_applications ADD COLUMN timezone VARCHAR(64);

-- Comma-separated BCP-47 codes ('en,hi,mr'). Deliberately not a join table:
-- this is a short list read whole and never aggregated over, so a table would
-- add a join to every profile read and buy nothing. Revisit if it ever needs
-- to be searched at scale.
ALTER TABLE counselor_applications ADD COLUMN practice_languages VARCHAR(200);

-- Who issued the licence, as free text with country-specific suggestions in the
-- UI. There is no universal register — India has the RCI, the UK has HCPC and
-- BACP, the US has one board per state — so an enum here would be wrong
-- everywhere except wherever it was written.
ALTER TABLE counselor_applications ADD COLUMN licence_authority VARCHAR(200);
ALTER TABLE counselor_applications ADD COLUMN licence_expires_on DATE;
ALTER TABLE counselor_applications ADD COLUMN years_of_experience INT;
ALTER TABLE counselor_applications ADD COLUMN professional_website VARCHAR(300);

-- Same fields on the live account.
ALTER TABLE users ADD COLUMN country_code VARCHAR(2);
ALTER TABLE users ADD COLUMN phone_dial_code VARCHAR(6);
ALTER TABLE users ADD COLUMN phone_national VARCHAR(20);
ALTER TABLE users ADD COLUMN phone_e164 VARCHAR(20);
ALTER TABLE users ADD COLUMN address_line1 VARCHAR(255);
ALTER TABLE users ADD COLUMN address_line2 VARCHAR(255);
ALTER TABLE users ADD COLUMN city VARCHAR(120);
ALTER TABLE users ADD COLUMN state_region VARCHAR(120);
ALTER TABLE users ADD COLUMN postal_code VARCHAR(20);
ALTER TABLE users ADD COLUMN gender VARCHAR(50);
ALTER TABLE users ADD COLUMN date_of_birth DATE;
ALTER TABLE users ADD COLUMN timezone VARCHAR(64);
ALTER TABLE users ADD COLUMN practice_languages VARCHAR(200);
ALTER TABLE users ADD COLUMN organization VARCHAR(255);
ALTER TABLE users ADD COLUMN professional_role VARCHAR(255);
ALTER TABLE users ADD COLUMN qualification VARCHAR(255);
ALTER TABLE users ADD COLUMN registration_number VARCHAR(255);
ALTER TABLE users ADD COLUMN licence_authority VARCHAR(200);
ALTER TABLE users ADD COLUMN licence_expires_on DATE;
ALTER TABLE users ADD COLUMN years_of_experience INT;
ALTER TABLE users ADD COLUMN professional_website VARCHAR(300);

-- Credentials expire. An account approved in 2026 against a licence that
-- lapsed in 2027 is not a verified account any more, and nothing in the system
-- could previously notice that. verified_until is set by the administrator at
-- approval; the counselor list warns as it approaches and once it passes.
ALTER TABLE users ADD COLUMN verified_at TIMESTAMP;
ALTER TABLE users ADD COLUMN verified_until DATE;
ALTER TABLE users ADD COLUMN verified_by UUID REFERENCES users(id);

CREATE INDEX idx_users_country_code ON users(country_code);
CREATE INDEX idx_users_verified_until ON users(verified_until) WHERE verified_until IS NOT NULL;


-- ---------------------------------------------------------------------------
-- 4. Verification documents get a type
-- ---------------------------------------------------------------------------
--
-- Previously an application carried an unlabelled pile of files. An
-- administrator opening 'scan_2.pdf' had to work out what it was meant to
-- prove, and an expired licence certificate looked exactly like a current one.
-- Typing the upload is what turns "some documents were attached" into a
-- decision someone could defend later.
ALTER TABLE verification_documents
  ADD COLUMN doc_type VARCHAR(40) NOT NULL DEFAULT 'OTHER';
  -- LICENCE, DEGREE, PHOTO_ID, INSURANCE, EMPLOYMENT, OTHER

ALTER TABLE verification_documents ADD COLUMN issuing_authority VARCHAR(200);
ALTER TABLE verification_documents ADD COLUMN document_number VARCHAR(100);
ALTER TABLE verification_documents ADD COLUMN issued_on DATE;
ALTER TABLE verification_documents ADD COLUMN expires_on DATE;
ALTER TABLE verification_documents ADD COLUMN file_size BIGINT;

CREATE INDEX idx_verification_documents_application
  ON verification_documents(application_id);
