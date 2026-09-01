package com.project.depression.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record ParticipantDetailResponse(
        UUID id,
        String participantRef,
        long sessionCount,
        Instant createdAt,
        Instant lastSessionAt,
        /** Oldest first, so a trend chart can plot them left to right. */
        List<ParticipantSessionResponse> sessions
) {
}
