package com.project.depression.dto;

import java.time.Instant;
import java.util.UUID;

public record ParticipantResponse(
        UUID id,
        String participantRef,
        long sessionCount,
        Instant firstSeenAt,
        Instant lastSessionAt
) {
}
