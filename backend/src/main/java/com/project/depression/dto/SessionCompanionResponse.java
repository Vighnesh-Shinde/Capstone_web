package com.project.depression.dto;

import java.time.Instant;
import java.util.UUID;

/**
 * Somebody who was in the room besides the counselor and participant.
 *
 * Carries no embedding. The vector exists to separate their speech out during
 * processing and is never sent to a browser — there is no screen that needs
 * it, and a biometric that leaves the server is a biometric that can leak.
 */
public record SessionCompanionResponse(
        UUID id,
        String roleLabel,
        /** Which voice in the recording they turned out to be; null before processing. */
        String diarizedLabel,
        boolean consentGiven,
        Instant enrolledAt,
        /** True once the vector has been dropped with the session's video. */
        boolean purged
) {
}
