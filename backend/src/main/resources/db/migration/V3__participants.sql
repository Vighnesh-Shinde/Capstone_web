-- Participants: groups a counselor's sessions by the same real-world
-- participant (DAIC-WOZ-style), so repeat interviews are tracked and stored
-- together instead of each session being an isolated, unrelated upload.
CREATE TABLE participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  counselor_id UUID NOT NULL REFERENCES users(id),
  participant_ref VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT now(),
  last_session_at TIMESTAMP DEFAULT now(),
  UNIQUE (counselor_id, participant_ref)
);

-- NOT NULL: safe because this project has no production data yet (dev DB is
-- reset, not migrated-with-backfill, whenever schema changes land).
ALTER TABLE sessions ADD COLUMN participant_id UUID NOT NULL REFERENCES participants(id);

CREATE INDEX idx_participants_counselor_id ON participants(counselor_id);
CREATE INDEX idx_sessions_participant_id ON sessions(participant_id);
