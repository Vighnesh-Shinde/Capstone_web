package com.project.depression.entity;

public enum SessionStatus {
    UPLOADED,
    PROCESSING,
    COMPLETED,

    /**
     * Transcribed, but not scored: the voices in the recording could not be
     * matched to exactly one unidentified participant.
     *
     * Distinct from FAILED on purpose. Nothing malfunctioned — the pipeline
     * declined to guess whose mental health it was measuring, which is the
     * correct outcome, and the recording is usually fine. Collapsing it into
     * FAILED would tell a counselor to report a bug when what they need to do
     * is check who was in the room.
     */
    SPEAKER_UNVERIFIED,

    /**
     * Transcribed, but too short to score.
     *
     * The models were trained on clinical interviews of 167-4,611 participant
     * words; below that range the text stage returns a near-constant value
     * that happens to clear the fusion threshold, so every short recording
     * would be reported as depressed with a plausible-looking confidence.
     *
     * Its own status rather than FAILED because nothing went wrong and the
     * counsellor's fix is specific: record a longer interview. Telling them
     * the file was unreadable would send them to check a recording that plays
     * perfectly.
     */
    TOO_SHORT,

    FAILED
}
