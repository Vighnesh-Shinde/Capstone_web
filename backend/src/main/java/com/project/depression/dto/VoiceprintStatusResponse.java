package com.project.depression.dto;

import java.time.Instant;

/**
 * Whether this counselor can start a session, and when they must record again.
 *
 * `enrolled` and `valid` are separate because they lead to different screens:
 * somebody who has never recorded needs an explanation of what a voiceprint is
 * for, while somebody whose recording lapsed last week only needs the button.
 */
public record VoiceprintStatusResponse(
        boolean enrolled,
        boolean valid,
        Instant enrolledAt,
        Instant expiresAt,
        Double speechSeconds,
        /** Negative once it has lapsed, which is what drives the warning banner. */
        Long daysRemaining,
        String passageVersion
) {
}
