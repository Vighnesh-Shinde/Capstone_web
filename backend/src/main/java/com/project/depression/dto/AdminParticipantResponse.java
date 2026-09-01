package com.project.depression.dto;

import java.time.Instant;
import java.util.UUID;

/**
 * Participant summary across all counselors, for privacy administration.
 * Distinct from ParticipantResponse, which is scoped to one counselor's own
 * participants and carries no counselor attribution.
 */
public record AdminParticipantResponse(
        UUID id,
        String participantRef,
        String counselorName,
        String counselorEmail,
        long sessionCount,
        Instant firstSeenAt,
        Instant lastSessionAt
) {
}
