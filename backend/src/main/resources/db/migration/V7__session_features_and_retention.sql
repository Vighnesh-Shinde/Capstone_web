-- The feature vectors the models actually consumed, kept per session.
--
-- This is what makes the retraining loop possible. Without it, building a
-- training set from real sessions would mean re-running ffmpeg, Whisper,
-- diarization and sentence embedding over every archived recording — which in
-- turn would force the raw video to be kept forever. Storing the derived
-- numbers instead means the dataset survives the video being deleted.
--
-- Stored as JSONB arrays rather than 3181 columns: the vectors are opaque to
-- SQL (nothing queries an individual feature), the widths are a property of the
-- model version rather than of the schema, and a retrained model with different
-- widths must not require a migration.
CREATE TABLE session_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL UNIQUE REFERENCES sessions(id) ON DELETE CASCADE,
  text_features JSONB,
  audio_features JSONB,
  transcript_text TEXT,
  text_feature_count INT,
  audio_feature_count INT,
  extracted_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_session_features_session_id ON session_features(session_id);

-- Set when the retention sweep removes the raw recording. The report, transcript
-- and features outlive it, so a deleted video never costs us training data or
-- the clinical record.
ALTER TABLE sessions ADD COLUMN video_deleted_at TIMESTAMP;

-- Lets a participant's consent be withdrawn after the fact, which must exclude
-- the session from the research dataset without destroying the clinical record.
ALTER TABLE sessions ADD COLUMN consent_withdrawn_at TIMESTAMP;
