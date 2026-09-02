-- Speaker identification by enrolled voiceprint.
--
-- Until now the pipeline decided which diarized speaker was the participant by
-- assuming it was whoever talked most. That rule came from DAIC-WOZ, where the
-- interviewer is a virtual agent asking short scripted questions. In a real
-- counselling room a withdrawn client answers in single words while the
-- counselor carries the conversation, so the rule inverts — and the platform
-- would score the counselor's voice and words while presenting the result as
-- the participant's. It failed hardest on exactly the people it exists to help,
-- and it failed silently.
--
-- Speakers are now identified positively: the counselor enrols their voice, so
-- does anyone else in the room, and the participant is whoever matches none of
-- them. When that does not resolve to exactly one person, the session is not
-- scored. See ml-service/app/real/voiceprint.py.


-- ---------------------------------------------------------------------------
-- 1. Counselor voiceprints
-- ---------------------------------------------------------------------------
--
-- Only the embedding is stored, never the recording it came from. A vector
-- cannot be played back; an audio file of a named clinician can. The enrollment
-- audio is deleted as soon as the vector is extracted.
--
-- Rows are kept after they expire rather than deleted. A report produced in
-- March should stay traceable to the voiceprint that decided whose voice was
-- scored, and that is exactly the kind of question asked long after the fact.
CREATE TABLE counselor_voiceprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- The vector itself, as a JSON array of floats. JSONB rather than a
  -- Postgres array because the rest of this schema already stores model
  -- vectors as JSONB (session_features), and nothing ever queries inside it —
  -- it is read whole, handed to the ML service, and compared there.
  embedding JSONB NOT NULL,
  dimension INT NOT NULL,

  -- How much speech the vector was derived from. A voiceprint built from 13
  -- seconds is weaker than one from 50, and that is worth being able to see
  -- when a match later looks marginal.
  speech_seconds DOUBLE PRECISION,

  -- Which passage was read. Changing the passage does not invalidate old
  -- voiceprints, but it does explain why two enrolments of the same person
  -- might differ slightly.
  passage_version VARCHAR(20) NOT NULL DEFAULT 'v1',

  -- Which embedding model produced this vector. Embeddings are only comparable
  -- within one model's space, so upgrading the diarization model invalidates
  -- every voiceprint made before it. Recording that here turns a baffling
  -- platform-wide match failure into an obvious one.
  model_id VARCHAR(120) NOT NULL DEFAULT 'pyannote/speaker-diarization-community-1',

  enrolled_at TIMESTAMP NOT NULL DEFAULT now(),

  -- Voices drift, and re-reading the passage monthly keeps the reference
  -- current. Stored rather than computed so changing the interval later does
  -- not silently re-date every existing enrolment.
  expires_at TIMESTAMP NOT NULL,

  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- One live voiceprint per counselor, enforced by the database. Two active rows
-- would make which voice is matched depend on row ordering — and that decides
-- whose speech gets analysed.
CREATE UNIQUE INDEX idx_counselor_voiceprints_one_active
  ON counselor_voiceprints(user_id) WHERE is_active;

CREATE INDEX idx_counselor_voiceprints_user
  ON counselor_voiceprints(user_id, enrolled_at DESC);


-- ---------------------------------------------------------------------------
-- 2. Companions present at a session
-- ---------------------------------------------------------------------------
--
-- An interpreter, a parent, a spouse. Common in practice, and previously
-- invisible: their speech would have been folded into the participant's or the
-- counselor's, contaminating the exact signal being measured.
--
-- Their voiceprint is per-session and never reused. A companion is not a user
-- of this platform, has no account, and did not agree to be recognised at any
-- other appointment.
CREATE TABLE session_companions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,

  -- How the participant described them ("Interpreter", "Mother"). Free text
  -- and deliberately not a name: this record needs to distinguish voices, not
  -- identify a third party who never consented to being on file.
  role_label VARCHAR(100),

  embedding JSONB NOT NULL,
  dimension INT NOT NULL,
  speech_seconds DOUBLE PRECISION,

  -- Recording someone's voice to recognise it is biometric processing, and a
  -- companion is a third party with no account here. Their agreement is
  -- captured separately from the participant's consent, because it is a
  -- different person agreeing to a different thing.
  consent_given BOOLEAN NOT NULL DEFAULT FALSE,
  consent_recorded_at TIMESTAMP,

  enrolled_at TIMESTAMP NOT NULL DEFAULT now(),

  -- Cleared when the session's video is deleted on the retention schedule.
  -- The vector has no purpose once the audio it was used to segment is gone,
  -- and keeping a third party's biometric longer than the recording it
  -- explained would be indefensible.
  purged_at TIMESTAMP
);

CREATE INDEX idx_session_companions_session ON session_companions(session_id);


-- ---------------------------------------------------------------------------
-- 3. Speaker attribution on the session
-- ---------------------------------------------------------------------------

-- Which diarized cluster was judged to be whom, and the cosine similarity
-- behind every judgement. This is the decision that determined whose mental
-- health was scored, so it has to remain checkable after the audio is deleted.
ALTER TABLE sessions ADD COLUMN speaker_similarities JSONB;
ALTER TABLE sessions ADD COLUMN participant_speaker VARCHAR(50);
ALTER TABLE sessions ADD COLUMN counselor_speaker VARCHAR(50);

-- The conversation in DAIC-WOZ format, so sessions recorded here can be
-- appended to a training set built from the corpus with no separate parser.
ALTER TABLE sessions ADD COLUMN daic_transcript_path VARCHAR(500);

-- Why a session did not produce a report. Previously a failure left only a
-- status and a line in the server log, so a counselor saw "Failed" with no way
-- to know whether to re-upload, re-record, or call somebody.
ALTER TABLE sessions ADD COLUMN failure_reason VARCHAR(1000);

-- Existing rows predate voice identification and were scored under the old
-- "whoever talks most" rule. Marking them is the honest option: their speaker
-- attribution was never verified, and silently leaving the column NULL would
-- make them indistinguishable from sessions that simply have not run yet.
ALTER TABLE sessions ADD COLUMN speaker_attribution VARCHAR(30) NOT NULL DEFAULT 'VOICEPRINT';
UPDATE sessions SET speaker_attribution = 'LEGACY_DURATION_HEURISTIC';
-- VOICEPRINT | LEGACY_DURATION_HEURISTIC

CREATE INDEX idx_sessions_attribution ON sessions(speaker_attribution);
