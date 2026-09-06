-- The passage people read aloud to enrol their voice, editable by an admin.
--
-- Previously a Java constant. Moved into the database because the operator —
-- not the developer — is the one who knows what their counsellors should be
-- reading: a clinic running sessions in Hindi will want a Hindi passage, and
-- waiting on a code change and redeploy for that is absurd.
--
-- WHAT CHANGING THE TEXT DOES AND DOES NOT DO
-- A voiceprint is a voice, not a text. Changing the passage does NOT
-- invalidate anyone's existing enrolment — the embedding describes how
-- somebody sounds, not what they said. The version is recorded on each
-- voiceprint only so it stays possible to tell which text a given person read,
-- which matters when two enrolments of the same person differ more than
-- expected.
--
-- (Changing the diarization MODEL is the thing that invalidates voiceprints.
-- That is tracked separately, on counselor_voiceprints.model_id.)

CREATE TABLE enrollment_passages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Human-facing label, stamped onto every voiceprint enrolled while this
  -- passage was active.
  version VARCHAR(20) NOT NULL UNIQUE,

  -- TEXT, not VARCHAR(n): an operator writing a passage in a script with
  -- multi-byte characters should not discover a length limit chosen by
  -- somebody counting ASCII.
  body TEXT NOT NULL,

  is_active BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMP NOT NULL DEFAULT now(),
  created_by UUID REFERENCES users(id),

  -- Why it was changed. Worth capturing: "switched to Marathi for the Pune
  -- clinic" explains a lot later that a bare diff does not.
  notes VARCHAR(500)
);

-- Exactly one passage is live at a time, enforced by the database rather than
-- by application code remembering to deactivate the previous one.
CREATE UNIQUE INDEX idx_enrollment_passages_one_active
  ON enrollment_passages(is_active) WHERE is_active;

-- Seeded with the text that shipped as the Java constant, byte for byte.
-- Recordings already made against it — including the operator's own test
-- files — must keep matching what the UI displays.
INSERT INTO enrollment_passages (version, body, is_active, notes) VALUES (
  'v1',
  'The morning train leaves the station at seven, and the platform is already busy. A woman sells fresh oranges from a wooden cart while three children argue about which bench to sit on. Somewhere behind the ticket window a radio plays an old song that everyone seems to know. The guard blows his whistle twice, checks his watch, and waves the driver forward. Outside the city the fields open up, green and flat, cut through by a narrow canal. A white bird lifts off the water, circles once, and settles again near the far bank. By eleven the light is sharp enough to read by, and the journey feels much shorter than the timetable promised.',
  TRUE,
  'Shipped default. Original, phonetically varied, and deliberately about nothing — the reader is a clinician being voice-printed, not a participant being assessed.'
);
