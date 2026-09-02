package com.project.depression.entity;

/**
 * How a session's speakers were told apart.
 *
 * Exists so that sessions scored before voice enrollment stay honestly
 * distinguishable from ones scored after it. Leaving the older ones unmarked
 * would present a guess and a verified match as the same thing.
 */
public enum SpeakerAttribution {

    /** Every speaker matched against an enrolled voiceprint. */
    VOICEPRINT,

    /**
     * Scored under the retired rule that the participant is whoever talks
     * most. Kept only as a label on historic rows; nothing produces it any
     * more. Reports carrying it should be read with the possibility that the
     * counselor and participant were swapped.
     */
    LEGACY_DURATION_HEURISTIC
}
