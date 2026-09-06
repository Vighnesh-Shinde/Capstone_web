-- Video features, the participant-only transcript, and deleting the original
-- recording as soon as everything derived from it is safely stored.
--
-- THE ORDERING RULE THAT MATTERS
-- The recording is the most sensitive artifact and the least necessary to
-- keep. But it is also the only source of the features — once it is gone,
-- nothing that was not already extracted can ever be recovered. So deletion is
-- gated on extraction having actually succeeded, checked per artifact, and a
-- session whose extraction was incomplete keeps its video rather than losing
-- data silently to a privacy rule.

-- ---------------------------------------------------------------------------
-- 1. Video features
-- ---------------------------------------------------------------------------

-- 111 facial-geometry measurements (see ml-service video_features.py).
-- Nullable: a recording where the participant was off camera or in darkness
-- has no face to measure, which is a reason to store fewer features rather
-- than to fail the session.
ALTER TABLE session_features ADD COLUMN video_features JSONB;

-- Why they are missing, when they are. Without this the gap is indisputable
-- but unexplained, and nobody can tell a camera problem from a bug.
ALTER TABLE session_features ADD COLUMN video_features_error VARCHAR(500);


-- ---------------------------------------------------------------------------
-- 2. Participant-only transcript
-- ---------------------------------------------------------------------------

-- The conversation filtered to the participant's turns — exactly what the text
-- model consumes. Stored as its own file so a training script does not have to
-- re-implement the filter, and risk implementing it differently.
ALTER TABLE sessions ADD COLUMN participant_transcript_path VARCHAR(500);


-- ---------------------------------------------------------------------------
-- 3. Media purge
-- ---------------------------------------------------------------------------

-- Whether everything derivable from the recording has been stored. Only a
-- session where this is true may have its media deleted.
--
-- A separate column rather than re-deriving the condition at deletion time:
-- the check involves several tables, and a privacy-critical decision should
-- not depend on a join being written correctly in two different places.
ALTER TABLE sessions ADD COLUMN derived_data_complete BOOLEAN NOT NULL DEFAULT FALSE;

-- Why a purge has not happened. Surfaced on the admin privacy screen so an
-- operator can see which recordings are still on disk and why.
ALTER TABLE sessions ADD COLUMN purge_blocked_reason VARCHAR(500);

-- Backfill: existing completed sessions predate video-feature extraction, so
-- their derived data is by definition incomplete. Marking them true would
-- authorise deleting recordings whose video features were never taken.
UPDATE sessions SET derived_data_complete = FALSE;

CREATE INDEX idx_sessions_purge_pending
  ON sessions(derived_data_complete)
  WHERE video_deleted_at IS NULL;
