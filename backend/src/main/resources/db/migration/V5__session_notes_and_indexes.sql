-- Counselor's free-text working notes for a session.
--
-- Deliberately separate from counselor_judgments.observation: that is a
-- formal, one-per-report clinical assessment that feeds the research dataset,
-- whereas this is an editable scratchpad the counselor keeps for themselves.
-- Conflating them would either make the dataset's ground-truth label editable
-- or force every passing thought into the permanent record.
ALTER TABLE sessions ADD COLUMN notes VARCHAR(4000);

-- Supports the counselor session list: filtered by owner, ordered by date.
CREATE INDEX idx_sessions_counselor_created_at ON sessions(counselor_id, created_at DESC);
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_sessions_participant_created_at ON sessions(participant_id, created_at);
