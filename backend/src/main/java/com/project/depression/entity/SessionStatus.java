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

    FAILED
}
